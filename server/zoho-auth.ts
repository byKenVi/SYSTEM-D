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

export async function refreshAccessToken(region: string = "us"): Promise<string> {
  // Always clear the in-memory cache before refreshing so subsequent calls
  // don't serve the old (about-to-be-replaced) token.
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

  // Persist the new access token and expiry
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await storage.upsertAdminSettings({
    ...settings,
    zohoAccessToken: data.access_token,
    zohoTokenExpiresAt: expiresAt,
  });

  // Populate the in-memory cache with the new token
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
