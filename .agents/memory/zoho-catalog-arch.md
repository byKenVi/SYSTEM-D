---
name: Zoho catalog cache architecture
description: zoho_catalog table replaces all live Zoho catalog calls — routes fully switched (Étape 5 complète).
---

## Status : DÉPLOIEMENT COMPLET (Étape 5 terminée)

All three live-Zoho routes now read from `zoho_catalog`. No Zoho API call is triggered
by page loads on the Inventory or Boutique pages.

## Tables
- `zoho_sync_runs`: audit log for every sync cycle (status, counts, timestamps, error_message).
- `zoho_catalog`: local cache of all Zoho items with `assignment_state` + `cf_client_field_present`.

## Routes basculées vers zoho_catalog
| Route | Avant | Après |
|---|---|---|
| `GET /api/zoho/inventory` | `fetchZohoItems()` live | `storage.getZohoCatalogItems()` |
| `GET /api/portal/systemd-products` | `fetchZohoItems()` + in-memory cache 90s | `storage.getZohoCatalogByAssignmentState("systemd")` |
| `GET /api/portal/systemd-products/:id` | `fetchZohoItemDetail()` per-item live | `storage.getZohoCatalogItem(id)` |
| `POST /api/portal/systemd-checkout` | `fetchZohoItems()` full catalog | `storage.getZohoCatalogItem()` per cart item only |

## Filtres de sécurité appliqués côté routes
- Boutique : `assignment_state = 'systemd' AND status = 'active' AND is_deleted = false`
- Checkout : vérifie `assignmentState === 'systemd'` par item du panier, jamais le catalogue entier
- Produits `unresolved` → 503 (jamais exposés côté client)
- Produits `client` → 403 (jamais exposés dans la boutique SystemD)

## Cache in-memory supprimé
`systemdProductsCache` + `SYSTEMD_CACHE_TTL_MS` retirés — le cache DB est suffisant,
plus aucun quota Zoho à protéger.

## Assignment_state rule (confirmed by product owner)
- `cfClientFieldPresent = TRUE` AND cf_client empty/null → **'systemd'**
- `cfClientFieldPresent = TRUE` AND cf_client resolved to local contact → **'client'**
- `cfClientFieldPresent = TRUE` AND cf_client non-empty but unresolved → **'unresolved'**
- `cfClientFieldPresent = FALSE` (any error/fallback) → **always 'unresolved'**

## Advisory lock
- Key: `20260804` — session-scoped, crash-safe.

## Sync scheduler
- `server/zoho-sync.ts`: 60s check loop calling `syncFullZohoCatalog("scheduler")`.
- First successful manual sync: run #4, 2026-08-05, 202 items, 9.7s.
- Quota: ~404 Zoho calls per full-sync (202 list + 202 per-item).

## Webhook setup (pending)
- URL: `https://{DOMAIN}/api/webhooks/zoho-inventory`
- Header: `X-Zoho-Webhook-Secret: {ZOHO_INVENTORY_WEBHOOK_SECRET}` (env var not yet set)
- Events: Item Created, Item Edited, Item Deleted.

**Why:** Zoho Workflow Webhooks require paid tier — confirm before enabling.
