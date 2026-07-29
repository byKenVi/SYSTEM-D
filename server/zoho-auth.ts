import { storage } from "./storage";

// ── In-memory token cache ──────────────────────────────────────────────────
// Avoids a DB read on every parallel API call within the same token window.
let _cachedToken: string | null = null;
let _cachedTokenExpiresAt: Date | null = null;

/** Invalidate the in-memory cache (call after refresh or new token stored). */
export function invalidateAccessTokenCache(): void {
  _cachedToken = null;
  _cachedTokenExpiresAt = null;
}

// ── Refresh lock ───────────────────────────────────────────────────────────
// Prevents concurrent requests from all firing parallel refresh calls when the
// token expires simultaneously (e.g. after server restart or background sync).
// The first caller kicks off the real refresh; all subsequent callers wait for
// the same in-flight promise instead of issuing competing Zoho requests.
let _refreshInFlight: Promise<string> | null = null;
// ──────────────────────────────────────────────────────────────────────────

// Regional domain mappings
const REGION_DOMAINS: Record<string, { accounts: string; api: string }> = {
  us: { accounts: "accounts.zoho.com", api: "www.zohoapis.com" },
  eu: { accounts: "accounts.zoho.eu", api: "www.zohoapis.eu" },
  in: { accounts: "accounts.zoho.in", api: "www.zohoapis.in" },
  au: { accounts: "accounts.zoho.com.au", api: "www.zohoapis.com.au" },
  jp: { accounts: "accounts.zoho.jp", api: "www.zohoapis.jp" },
  ca: { accounts: "accounts.zohocloud.ca", api: "www.zohoapis.ca" },
};

export function getZohoDomains(region: string = "us") {
  return REGION_DOMAINS[region] || REGION_DOMAINS.us;
}

export function getCallbackUrl(): string {
  const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
  if (raw) {
    // REPLIT_DOMAINS may be comma-separated; prefer custom domain over *.replit.app
    const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
    const preferred = domains.find((d) => !d.endsWith(".replit.app")) || domains[0];
    return `https://${preferred}/api/auth/zoho/callback`;
  }
  return "http://localhost:5000/api/auth/zoho/callback";
}

export function buildAuthUrl(region: string = "us"): string {
  const { accounts } = getZohoDomains(region);
  const clientId = process.env.ZOHO_CLIENT_ID;
  if (!clientId) throw new Error("ZOHO_CLIENT_ID not set");

  const state = `region:${region}:${Date.now()}`;
  const params = new URLSearchParams({
    scope: "ZohoInventory.FullAccess.all",
    client_id: clientId,
    response_type: "code",
    redirect_uri: getCallbackUrl(),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://${accounts}/oauth/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string, region: string = "us") {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho credentials not configured");

  // For Multi-DC apps, always use accounts.zoho.com for token exchange.
  // Zoho routes the request to the correct datacenter internally.
  // The region-specific endpoint is only used for the auth URL (login page).
  const tokenEndpoint = "https://accounts.zoho.com/oauth/v2/token";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getCallbackUrl(),
    code,
  });

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Zoho token error: ${data.error}`);
  return data;
}

/**
 * Refresh the Zoho access token.
 *
 * Uses an in-flight promise lock so that when many requests hit an expired
 * token simultaneously, only ONE refresh call is made to Zoho — all other
 * callers wait on the same promise and get the same new token back.
 *
 * Also uses a targeted DB write (only zohoAccessToken + zohoTokenExpiresAt)
 * instead of a full settings spread, which prevents concurrent writes from
 * accidentally overwriting the refresh token or other settings.
 */
export async function refreshAccessToken(region: string = "us"): Promise<string> {
  // If a refresh is already in flight, wait for it instead of making a second call.
  if (_refreshInFlight) {
    return _refreshInFlight;
  }

  _refreshInFlight = _doRefreshAccessToken(region).finally(() => {
    _refreshInFlight = null;
  });

  return _refreshInFlight;
}

async function _doRefreshAccessToken(region: string): Promise<string> {
  // Clear the in-memory cache so no stale token is served while we refresh.
  invalidateAccessTokenCache();

  const settings = await storage.getAdminSettings();
  if (!settings?.zohoInventoryRefreshToken) throw new Error("No Zoho refresh token stored");

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho credentials not configured");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: settings.zohoInventoryRefreshToken,
  });

  // Always use the global endpoint for Multi-DC compatibility
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Zoho refresh error: ${data.error}`);

  // Targeted write: only update the two token columns.
  // Using a full settings spread here risks overwriting newer data written by
  // a concurrent call (e.g. a fresh re-auth that updated the refresh token).
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await storage.updateZohoTokens(data.access_token, expiresAt);

  // Populate the in-memory cache with the new token.
  _cachedToken = data.access_token;
  _cachedTokenExpiresAt = expiresAt;

  return data.access_token;
}

export async function getValidAccessToken(region: string = "us"): Promise<string> {
  // Fast path: return the in-memory cached token if it hasn't expired.
  // This avoids a DB round-trip on every parallel API call within the same
  // token validity window (e.g. during fetchZohoItems enrichment).
  if (_cachedToken && _cachedTokenExpiresAt && _cachedTokenExpiresAt > new Date()) {
    return _cachedToken;
  }

  const settings = await storage.getAdminSettings();
  if (!settings?.zohoInventoryRefreshToken) {
    throw new Error("Zoho Inventory not connected. Please connect in Settings.");
  }

  // Use DB-persisted token if still valid
  if (
    settings.zohoAccessToken &&
    settings.zohoTokenExpiresAt &&
    new Date(settings.zohoTokenExpiresAt) > new Date()
  ) {
    // Populate the in-memory cache from the DB value
    _cachedToken = settings.zohoAccessToken;
    _cachedTokenExpiresAt = new Date(settings.zohoTokenExpiresAt);
    return settings.zohoAccessToken;
  }

  // Token expired or missing — refresh (also repopulates the cache)
  return refreshAccessToken(region);
}

export async function fetchZohoOrganizations(
  accessToken: string,
  apiDomain: string
): Promise<{ organization_id: string; name: string }[]> {
  const domain = apiDomain.replace(/^https?:\/\//, "");
  const res = await fetch(`https://${domain}/inventory/v1/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch orgs: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.organizations || [];
}
