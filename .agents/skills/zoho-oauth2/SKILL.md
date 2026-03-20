---
name: zoho-oauth2
description: Integrate Zoho APIs using OAuth 2.0 Authorization Code flow with Multi-DC (multi-datacenter) support. Use when the user asks to connect to any Zoho service (Inventory, CRM, Books, etc.), set up Zoho OAuth, or integrate with the Zoho ecosystem. Covers app setup, regional domains, token exchange, refresh, and API calls.
---

# Zoho OAuth 2.0 Integration

Complete guide for integrating with Zoho APIs using OAuth 2.0 Authorization Code flow. Tested and proven in production with Zoho Inventory, but the OAuth pattern works for all Zoho services.

## Prerequisites

1. A **Zoho API Console** app at [https://api-console.zoho.com](https://api-console.zoho.com)
   - App type: **Server-based Applications**
   - Set the **Authorized Redirect URI** to: `https://{your-domain}/api/auth/zoho/callback`
2. Two environment secrets:
   - `ZOHO_CLIENT_ID` — from the Zoho API Console app
   - `ZOHO_CLIENT_SECRET` — from the Zoho API Console app

## Critical: Multi-Datacenter (Multi-DC) Rules

Zoho operates across multiple regional datacenters. Getting this wrong causes `invalid_code` or `invalid_client` errors.

### Regional Domains

| Region | Accounts Domain (Auth URL) | API Domain |
|--------|---------------------------|------------|
| US | `accounts.zoho.com` | `www.zohoapis.com` |
| EU | `accounts.zoho.eu` | `www.zohoapis.eu` |
| IN | `accounts.zoho.in` | `www.zohoapis.in` |
| AU | `accounts.zoho.com.au` | `www.zohoapis.com.au` |
| JP | `accounts.zoho.jp` | `www.zohoapis.jp` |
| CA | `accounts.zohocloud.ca` | `www.zohoapis.ca` |

### The Golden Rule

- **Auth URL (login page)**: Use the **region-specific** accounts domain so the user sees the correct login page.
- **Token exchange & refresh**: **Always** use `accounts.zoho.com` (the global US endpoint). Zoho routes internally to the correct DC. This is the single most common source of bugs — using a regional endpoint for token exchange will fail.
- **API calls**: Use the **region-specific** API domain from the table above.

```typescript
const REGION_DOMAINS: Record<string, { accounts: string; api: string }> = {
  us: { accounts: "accounts.zoho.com", api: "www.zohoapis.com" },
  eu: { accounts: "accounts.zoho.eu", api: "www.zohoapis.eu" },
  in: { accounts: "accounts.zoho.in", api: "www.zohoapis.in" },
  au: { accounts: "accounts.zoho.com.au", api: "www.zohoapis.com.au" },
  jp: { accounts: "accounts.zoho.jp", api: "www.zohoapis.jp" },
  ca: { accounts: "accounts.zohocloud.ca", api: "www.zohoapis.ca" },
};
```

## OAuth Flow

### Step 1: Build the Authorization URL

Redirect the user to Zoho's login page. Use the **region-specific** accounts domain.

```typescript
function buildAuthUrl(region: string = "us"): string {
  const { accounts } = REGION_DOMAINS[region] || REGION_DOMAINS.us;
  const clientId = process.env.ZOHO_CLIENT_ID;
  if (!clientId) throw new Error("ZOHO_CLIENT_ID not set");

  const callbackUrl = `https://${process.env.REPLIT_DOMAINS}/api/auth/zoho/callback`;
  const state = `region:${region}:${Date.now()}`;

  const params = new URLSearchParams({
    scope: "ZohoInventory.FullAccess.all",  // Change scope per Zoho service
    client_id: clientId,
    response_type: "code",
    redirect_uri: callbackUrl,
    access_type: "offline",   // Required to get a refresh token
    prompt: "consent",        // Forces consent screen so refresh token is always returned
    state,
  });

  return `https://${accounts}/oauth/v2/auth?${params}`;
}
```

**Key parameters:**
- `access_type: "offline"` — Required to receive a refresh token.
- `prompt: "consent"` — Forces the consent screen every time, ensuring a refresh token is always returned (Zoho only returns the refresh token on the first authorization unless you force consent).
- `state` — Encode the region here so the callback knows which DC to use for API calls.

### Step 2: Handle the Callback — Exchange Code for Tokens

**Always use `accounts.zoho.com`** for token exchange, regardless of the user's region.

```typescript
async function exchangeCodeForTokens(code: string, region: string = "us") {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho credentials not configured");

  // CRITICAL: Always use accounts.zoho.com for Multi-DC compatibility
  const tokenEndpoint = "https://accounts.zoho.com/oauth/v2/token";
  const callbackUrl = `https://${process.env.REPLIT_DOMAINS}/api/auth/zoho/callback`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
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
  // Returns: { access_token, refresh_token, expires_in, api_domain, token_type }
}
```

**Common error: `invalid_code`**
This usually means the region selected by the user doesn't match the datacenter where their Zoho API Console app was created. Prompt them to try a different region.

### Step 3: Store Tokens

Store these values persistently (database recommended):
- `refresh_token` — Long-lived, used to get new access tokens
- `access_token` — Short-lived (~1 hour), used for API calls
- `token_expires_at` — Calculate from `expires_in` (subtract 60s buffer)
- `region` — Needed for API calls
- `org_id` — Required for most Zoho API calls (passed as query param)

### Step 4: Refresh the Access Token

Access tokens expire after ~1 hour. Refresh before every API call if expired.

```typescript
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  // CRITICAL: Always use the global endpoint for Multi-DC compatibility
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (data.error) throw new Error(`Zoho refresh error: ${data.error}`);

  // Store the new access token and expiry, then return it
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  // Save access_token and expiresAt to your database...

  return data.access_token;
}
```

### Step 5: Make Authenticated API Calls

Use the **region-specific** API domain and pass the `organization_id` as a query parameter.

```typescript
async function zohoRequest(method: string, path: string, body?: any, region: string = "us") {
  const accessToken = await getValidAccessToken(region); // handles refresh if needed
  const { api } = REGION_DOMAINS[region] || REGION_DOMAINS.us;
  const orgId = "your_stored_org_id";
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://${api}/inventory/v1${path}${sep}organization_id=${orgId}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}
```

## Organization Selection

After the OAuth flow, fetch available organizations and let the user pick one (or auto-select if only one exists):

```typescript
async function fetchOrganizations(accessToken: string, apiDomain: string) {
  const res = await fetch(`https://${apiDomain}/inventory/v1/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  return data.organizations || [];
  // Each org: { organization_id: string, name: string, ... }
}
```

The `organization_id` must be passed as a query parameter on every subsequent API call.

## Uploading Images (Multipart)

Zoho uses multipart/form-data for image uploads (not JSON). Example for uploading a product image:

```typescript
async function uploadImage(itemId: string, imageUrl: string, region: string = "us") {
  // Download the image
  const imgRes = await fetch(imageUrl);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  // Build multipart body manually
  const boundary = `----FormBoundary${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="product.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipartBody = Buffer.concat([header, buffer, footer]);

  const accessToken = await getValidAccessToken(region);
  const { api } = REGION_DOMAINS[region];
  const url = `https://${api}/inventory/v1/items/${itemId}/image?organization_id=${orgId}`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  });
}
```

## Express Route Pattern

Recommended route structure for an Express app:

```
POST /api/auth/zoho/connect       → Build auth URL, return to frontend for redirect
GET  /api/auth/zoho/callback      → Exchange code, store tokens, redirect to settings page
POST /api/auth/zoho/disconnect    → Clear stored tokens
GET  /api/auth/zoho/test          → Verify connection is working
```

## Common Scopes by Zoho Service

| Service | Scope |
|---------|-------|
| Zoho Inventory | `ZohoInventory.FullAccess.all` |
| Zoho CRM | `ZohoCRM.modules.ALL` |
| Zoho Books | `ZohoBooks.fullaccess.all` |
| Zoho Invoice | `ZohoInvoice.fullaccess.all` |

Multiple scopes can be comma-separated: `ZohoInventory.FullAccess.all,ZohoCRM.modules.ALL`

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_code` | Region mismatch between auth URL and API Console app | Try a different region; the app's DC must match |
| `invalid_client` | Wrong client ID/secret or using regional endpoint for token exchange | Verify secrets; always use `accounts.zoho.com` for tokens |
| `access_denied` | User denied consent | Retry the auth flow |
| No `refresh_token` in response | Missing `access_type=offline` or `prompt=consent` | Add both parameters to the auth URL |
| `invalid_oauthtoken` | Access token expired | Refresh the token before the API call |
