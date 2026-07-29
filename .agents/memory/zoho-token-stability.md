---
name: Zoho token stability fixes
description: Root causes and fixes for the "invalid token / need to re-login" problem with Zoho Inventory OAuth.
---

## Root causes

### 1. Rate limit (429) masquerading as token errors
The auto-sync scheduler called `fetchZohoItems()` which does O(N) individual item fetches (one per item to get `custom_fields`). With ~100+ products this burns through Zoho's 7,500 API calls/day limit, causing every subsequent call to fail with 429 — which the app surfaced as an unhelpful 500 / "not connected" error.

### 2. No refresh lock (concurrent refreshes)
When many requests hit an expired token simultaneously, they all called `refreshAccessToken` in parallel, firing multiple Zoho token exchange requests at the same time.

### 3. Settings spread on token write
`refreshAccessToken` read full settings, spread them, and wrote back only overriding the two token fields. Any concurrent write (e.g. re-auth) between the read and write would be silently overwritten.

## Fixes applied

- **`fetchZohoItemsMapLite`** in `server/zoho-api.ts` — list-only fetch (O(pages) not O(items)), used by the sync scheduler. The full `fetchZohoItems` (with per-item enrichment for `custom_fields`) is still used by the admin inventory page where custom fields are needed.
- **Refresh lock** (`_refreshInFlight` promise) in `server/zoho-auth.ts` — concurrent callers wait on the same in-flight promise.
- **`storage.updateZohoTokens(accessToken, expiresAt)`** — targeted DB update touching only the two token columns; `refreshAccessToken` now uses this instead of spreading full settings.
- **`storage.updateZohoLastSyncAt(syncedAt)`** — same targeted-write pattern for the sync scheduler.
- **429 handling** in `/api/zoho/inventory` and `/api/portal/systemd-products` routes — returns HTTP 429 with a French user-friendly message instead of 500.
- **Frontend 429 state** in admin inventaire and portal boutique — shows a clear "daily limit reached, try tomorrow" message instead of blank/error state.
- **`zohoUploadImage` 401 retry** — added the same force-refresh-and-retry pattern that `zohoRequest` already had.

**Why:** Zoho's daily 7,500-call limit is shared across all API calls for the org. Enriching 100+ items individually on every sync cycle (every 15 min) = 100+ calls/sync × 4 syncs/hr = rate limit exhausted in < 1 hour of usage.

**How to apply:** Use `fetchZohoItemsMapLite` (or any list-endpoint-only approach) whenever you only need stock/rate. Only use `fetchZohoItems` when you actually need `custom_fields`.
