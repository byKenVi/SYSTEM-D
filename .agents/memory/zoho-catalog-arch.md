---
name: Zoho catalog cache architecture
description: Two new tables + full sync function that replaces lite stock sync; progressive deployment — routes not yet switched.
---

## What was built (Étapes 1–3)

### New tables (server/index.ts migrations + shared/schema.ts Drizzle definitions)
- `zoho_sync_runs`: audit log for every sync cycle (status, counts, timestamps, error_message).
- `zoho_catalog`: local cache of all Zoho items with `assignment_state` ('systemd' | 'client' | 'unresolved') and `cf_client_field_present` boolean.

### New files
- `server/zoho-catalog.ts`: `syncFullZohoCatalog()`, `toZohoCatalogRow()`, `upsertZohoCatalogItemFromWebhook()`, image cache (module-level Map, 24h TTL).
- `server/zoho-sync.ts`: replaced entirely — 60s check loop calling `syncFullZohoCatalog("scheduler")` instead of the old lite stock sync.

### Modified files
- `shared/schema.ts`: zohoSyncRuns + zohoCatalog table definitions + inferred types.
- `server/storage.ts`: IStorage interface + DatabaseStorage implementations for sync runs and catalog CRUD.
- `server/zoho-api.ts`: added `fetchZohoItemsListAll()` (paginated list, no enrichment) and `fetchZohoItemDetail(itemId)` (single item with custom_fields).
- `server/routes.ts`:
  - `POST /api/zoho/full-sync` — manual trigger (admin only).
  - `GET /api/zoho/sync-runs` — list 20 most recent runs (admin only).
  - `GET /api/zoho/catalog-stats` — counts by assignment_state for validation.
  - `POST /api/webhooks/zoho-inventory` — inbound webhook; secured by `X-Zoho-Webhook-Secret` header (`ZOHO_INVENTORY_WEBHOOK_SECRET` env var); deduplication via `last_modified_time`.
  - `GET /api/zoho/item-image/:itemId` — now reads from module-level image cache before calling Zoho; versioned URLs (`?v={imageDocumentId}`) get 7-day browser cache.

### Routes NOT yet switched (Étape 5 — awaits user data validation)
- `GET /api/zoho/inventory` — still calls Zoho live.
- `GET /api/portal/systemd-products` — still calls Zoho live.
- `POST /api/portal/systemd-checkout` — still calls Zoho live.

## Assignment_state rule (confirmed by product owner)
- `fetchedViaPerItem = TRUE` AND cf_client empty/null → **'systemd'**
- `fetchedViaPerItem = TRUE` AND cf_client resolved to local contact → **'client'**
- `fetchedViaPerItem = TRUE` AND cf_client non-empty but unresolved → **'unresolved'**
- `fetchedViaPerItem = FALSE` (any error/fallback) → **always 'unresolved'** (never infer SystemD from incomplete data)

## Advisory lock
- Key: `20260804` (integer, unique to this sync).
- Uses a dedicated `pool.connect()` connection distinct from the Drizzle pool.
- Session-scoped: auto-released if the connection drops (crash-safe).

## Sync failure state
- First manual sync run (#1) failed with 429 — Zoho API quota was exhausted today.
- Catalog is empty (0 rows) until the first successful sync (trigger after midnight).
- All existing pages still work: they call Zoho live as before (no regression).

## Next step (Étape 3 → 5)
After midnight:
1. Trigger `POST /api/zoho/full-sync` from Settings (or the API).
2. Validate counts via `GET /api/zoho/catalog-stats` vs. Zoho portal.
3. Only then switch the three routes to read from `zoho_catalog`.

## Webhook setup (manual, post-validation)
- URL: `https://{DOMAIN}/api/webhooks/zoho-inventory`
- Header: `X-Zoho-Webhook-Secret: {ZOHO_INVENTORY_WEBHOOK_SECRET}`
- Set `ZOHO_INVENTORY_WEBHOOK_SECRET` env var in Replit Secrets before enabling.
- Events: Item Created, Item Edited, Item Deleted (in Zoho Inventory → Automatisations → Webhooks).

**Why:** Zoho plan assumed to be paid (Workflow Webhooks require paid tier). Must verify before enabling.
