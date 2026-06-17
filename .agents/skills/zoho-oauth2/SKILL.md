---
name: zoho-oauth2
description: Integrate Zoho APIs using OAuth 2.0 Authorization Code flow with Multi-DC (multi-datacenter) support. Use when the user asks to connect to any Zoho service (Inventory, CRM, Books, etc.), set up Zoho OAuth, or integrate with the Zoho ecosystem. Covers app setup, regional domains, token exchange, refresh, token caching, DB storage, Inventory operations, contacts, sales orders, and settings UI pattern.
---

# Zoho OAuth 2.0 + Inventory Integration

Complete guide for integrating with Zoho APIs using OAuth 2.0 Authorization Code flow. Proven in production with Zoho Inventory. The OAuth pattern applies to all Zoho services; the Inventory operations section covers the most common use cases.

## Prerequisites

1. A **Zoho API Console** app at [https://api-console.zoho.com](https://api-console.zoho.com)
   - App type: **Server-based Applications**
   - Set the **Authorized Redirect URI** to: `https://{your-domain}/api/auth/zoho/callback`
2. Two environment secrets:
   - `ZOHO_CLIENT_ID` — from the Zoho API Console app
   - `ZOHO_CLIENT_SECRET` — from the Zoho API Console app

---

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

- **Auth URL (login page)**: Use the **region-specific** accounts domain.
- **Token exchange & refresh**: **Always** use `accounts.zoho.com` (the global US endpoint). This is the #1 source of bugs — using a regional endpoint for token exchange will fail.
- **API calls**: Use the **region-specific** API domain.

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

---

## Callback URL (Replit-specific)

`REPLIT_DOMAINS` may be comma-separated (custom domain + `.replit.app`). Prefer the custom domain when present.

```typescript
export function getCallbackUrl(): string {
  const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
  if (raw) {
    const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
    // Prefer custom domain over *.replit.app
    const preferred = domains.find((d) => !d.endsWith(".replit.app")) || domains[0];
    return `https://${preferred}/api/auth/zoho/callback`;
  }
  return "http://localhost:5000/api/auth/zoho/callback";
}
```

This URL must exactly match what's registered in the Zoho API Console.

---

## OAuth Flow

### Step 1: Build the Authorization URL

```typescript
function buildAuthUrl(region: string = "us"): string {
  const { accounts } = REGION_DOMAINS[region] || REGION_DOMAINS.us;
  const clientId = process.env.ZOHO_CLIENT_ID;
  if (!clientId) throw new Error("ZOHO_CLIENT_ID not set");

  const state = `region:${region}:${Date.now()}`; // encode region in state

  const params = new URLSearchParams({
    scope: "ZohoInventory.FullAccess.all",  // change per Zoho service
    client_id: clientId,
    response_type: "code",
    redirect_uri: getCallbackUrl(),
    access_type: "offline",   // required to get a refresh token
    prompt: "consent",        // forces consent screen so refresh token is always returned
    state,
  });

  return `https://${accounts}/oauth/v2/auth?${params}`;
}
```

**Key parameters:**
- `access_type: "offline"` — Required to receive a refresh token.
- `prompt: "consent"` — Forces the consent screen every time. Without this, Zoho only returns the refresh token on the very first authorization.
- `state` — Encode the region here so the callback can read it back.

### Step 2: Exchange Code for Tokens (Callback Handler)

**Always use `accounts.zoho.com`** for token exchange, regardless of region.

```typescript
async function exchangeCodeForTokens(code: string, region: string = "us") {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho credentials not configured");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getCallbackUrl(),
    code,
  });

  // CRITICAL: Always use accounts.zoho.com — not the regional endpoint
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (data.error) throw new Error(`Zoho token error: ${data.error}`);
  return data;
  // Returns: { access_token, refresh_token, expires_in, api_domain, token_type }
}
```

**`invalid_code` error**: Region mismatch between auth URL and the DC where the API Console app was created. Try a different region.

### Step 3: Store Tokens

Store these in your database (single-row admin settings table works well):

| Column | Value |
|--------|-------|
| `zohoRefreshToken` | `tokens.refresh_token` — long-lived |
| `zohoAccessToken` | `tokens.access_token` — short-lived (~1h) |
| `zohoTokenExpiresAt` | `new Date(Date.now() + (tokens.expires_in - 60) * 1000)` |
| `zohoRegion` | the `region` string from state |
| `zohoOrgId` | selected `organization_id` |
| `zohoOrgName` | selected org name (for display) |

### Step 4: Refresh Token

```typescript
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: refreshToken,
  });

  // CRITICAL: Always use the global endpoint
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (data.error) throw new Error(`Zoho refresh error: ${data.error}`);

  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  // Persist data.access_token and expiresAt to DB
  return data.access_token;
}
```

### Step 5: Token Cache Helper

Call this before every API request instead of calling `refreshAccessToken` directly:

```typescript
async function getValidAccessToken(region: string = "us"): Promise<string> {
  const settings = await storage.getAdminSettings();
  if (!settings?.zohoRefreshToken) {
    throw new Error("Zoho not connected. Please connect in Settings.");
  }

  // Use cached token if still valid
  if (
    settings.zohoAccessToken &&
    settings.zohoTokenExpiresAt &&
    new Date(settings.zohoTokenExpiresAt) > new Date()
  ) {
    return settings.zohoAccessToken;
  }

  // Expired or missing — refresh
  return refreshAccessToken(settings.zohoRefreshToken);
}
```

---

## Organization Selection

After OAuth, fetch orgs and let the user pick (or auto-select if only one):

```typescript
async function fetchOrganizations(accessToken: string, apiDomain: string) {
  const domain = apiDomain.replace(/^https?:\/\//, "");
  const res = await fetch(`https://${domain}/inventory/v1/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  return data.organizations || [];
  // Each org: { organization_id: string, name: string }
}
```

If there are multiple orgs, store them in `global` temporarily and redirect the user to a picker UI. The `organization_id` must be passed as a query parameter on every subsequent API call.

---

## API Request Wrapper

Use this central wrapper for all Zoho Inventory API calls:

```typescript
async function zohoRequest(
  method: string,
  path: string,
  body?: any,
  region: string = "us"
): Promise<any> {
  const token = await getValidAccessToken(region);
  const settings = await storage.getAdminSettings();
  const orgId = settings?.zohoOrgId;
  if (!orgId) throw new Error("Zoho Organization ID not configured");

  const { api } = REGION_DOMAINS[region] || REGION_DOMAINS.us;
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://${api}/inventory/v1${path}${sep}organization_id=${orgId}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
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

---

## Common Inventory Operations

### Paginated Item Fetch

```typescript
async function fetchAllItems(): Promise<any[]> {
  const items: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const data = await zohoRequest("GET", `/items?per_page=200&page=${page}&filter_by=Status.All`);
    if (data.items?.length > 0) items.push(...data.items);
    hasMore = data.page_context?.has_more_page === true;
    page++;
  }
  // Note: list endpoint omits custom_fields — fetch each item individually if you need them
  return items;
}
```

### Create Item

```typescript
const data = await zohoRequest("POST", "/items", {
  name: "Product Name",
  sku: "SKU-001",
  rate: 29.99,
  product_type: "goods",       // "goods" or "service"
  initial_stock: 100,
  initial_stock_rate: 29.99,
  custom_fields: [{ api_name: "cf_client", value: "client-id" }],
});
const itemId = data.item.item_id;
```

### Inventory Adjustment (set stock to exact quantity)

Zoho doesn't have a "set stock" endpoint — compute a delta from current stock:

```typescript
async function setItemStock(itemId: string, targetQty: number): Promise<void> {
  const detail = await zohoRequest("GET", `/items/${itemId}`);
  const currentQty = Math.round(detail.item?.stock_on_hand ?? 0);
  const delta = targetQty - currentQty;
  if (delta === 0) return;

  const today = new Date().toISOString().split("T")[0];
  await zohoRequest("POST", "/inventoryadjustments", {
    date: today,
    reason: "Stock sync",
    adjustment_type: "quantity",
    line_items: [{ item_id: itemId, quantity_adjusted: delta }],
  });
}
```

### Create or Find Contact (ensureZohoContact)

Zoho Inventory does not support an `?email=` filter. Use `search_text` and exact-match locally. Race-condition safe: retry search after a failed create.

```typescript
async function ensureZohoContact(contact: {
  name: string;
  email: string;
  companyName?: string | null;
}): Promise<string> {
  async function findByEmail(): Promise<string | null> {
    const data = await zohoRequest(
      "GET",
      `/contacts?search_text=${encodeURIComponent(contact.email)}&contact_type=customer`
    );
    const match = (data.contacts ?? []).find(
      (c: any) => c.email?.toLowerCase() === contact.email.toLowerCase()
    );
    return match?.contact_id ?? null;
  }

  const existingId = await findByEmail();
  if (existingId) return existingId;

  try {
    const createData = await zohoRequest("POST", "/contacts", {
      contact_name: contact.companyName || contact.name,
      contact_type: "customer",
      email: contact.email,
      tax_preference: "taxable",
    });
    const newId = createData.contact?.contact_id;
    if (!newId) throw new Error("No contact_id in response");
    return newId;
  } catch (err: any) {
    // Race: Zoho may reject if email was created concurrently — retry search
    const retryId = await findByEmail();
    if (retryId) return retryId;
    throw err;
  }
}
```

### Create Sales Order

```typescript
async function createSalesOrder(params: {
  contactId: string; // Zoho contact_id from ensureZohoContact
  items: { item_id: string; name: string; quantity: number; rate: number }[];
  notes?: string;
}): Promise<{ salesOrderId: string; salesOrderNumber: string }> {
  const data = await zohoRequest("POST", "/salesorders", {
    customer_id: params.contactId,
    line_items: params.items,
    notes: params.notes,
  });
  const so = data.salesorder;
  return { salesOrderId: so.salesorder_id, salesOrderNumber: so.salesorder_number };
}
```

### Image Upload (Multipart)

Zoho uses multipart/form-data for images — not JSON:

```typescript
async function uploadItemImage(itemId: string, imageUrl: string, region: string = "us") {
  const imgRes = await fetch(imageUrl);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  const boundary = `----FormBoundary${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="product.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipartBody = Buffer.concat([header, buffer, footer]);

  const token = await getValidAccessToken(region);
  const orgId = "your_stored_org_id";
  const { api } = REGION_DOMAINS[region];
  await fetch(`https://${api}/inventory/v1/items/${itemId}/image?organization_id=${orgId}`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  });
}
```

---

## Express Route Pattern

```
POST /api/auth/zoho/connect        → Build auth URL, return to frontend for redirect
GET  /api/auth/zoho/callback       → Exchange code, store tokens, redirect to settings
POST /api/auth/zoho/disconnect     → Clear stored tokens from DB
GET  /api/auth/zoho/test           → Call a lightweight API endpoint to verify connection
GET  /api/auth/zoho/callback-url   → Return the callback URL for display in settings UI
```

**Callback route specifics:**
- Extract `region` from `state` query param (`state.split(":")[1]`)
- On single org: save tokens + org directly, redirect to `/admin/settings?zoho_connected=true`
- On multiple orgs: store in `global.__zoho_pending_orgs` / `global.__zoho_pending_tokens`, redirect to `/admin/settings?zoho_select_org=true`, provide a separate `POST /api/auth/zoho/select-org` route

---

## Zoho Web URL Builder

For linking directly to records in the Zoho web interface:

```typescript
const ZOHO_WEB_DOMAINS: Record<string, string> = {
  us: "inventory.zoho.com",
  eu: "inventory.zoho.eu",
  in: "inventory.zoho.in",
  au: "inventory.zoho.com.au",
  jp: "inventory.zoho.jp",
  ca: "inventory.zohocloud.ca",
};

function getSalesOrderUrl(region: string, salesOrderId: string): string {
  const domain = ZOHO_WEB_DOMAINS[region] || ZOHO_WEB_DOMAINS.us;
  return `https://${domain}/app#/salesorders/${salesOrderId}`;
}
```

---

## Common Scopes by Zoho Service

| Service | Scope |
|---------|-------|
| Zoho Inventory | `ZohoInventory.FullAccess.all` |
| Zoho CRM | `ZohoCRM.modules.ALL` |
| Zoho Books | `ZohoBooks.fullaccess.all` |
| Zoho Invoice | `ZohoInvoice.fullaccess.all` |

Multiple scopes: comma-separated in the `scope` param.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_code` | Region mismatch between auth URL and API Console app's DC | Try a different region |
| `invalid_client` | Wrong client ID/secret or using regional endpoint for token exchange | Verify secrets; always use `accounts.zoho.com` for tokens |
| `access_denied` | User denied consent | Retry auth flow |
| No `refresh_token` in response | Missing `access_type=offline` or `prompt=consent` | Add both params to auth URL |
| `invalid_oauthtoken` | Access token expired | Refresh before the API call |
| Item list missing `custom_fields` | List endpoint never returns custom fields | Fetch each item individually via `GET /items/{id}` |
| Duplicate contact on create | Race condition or prior partial create | Use the `ensureZohoContact` create-then-retry-search pattern |
