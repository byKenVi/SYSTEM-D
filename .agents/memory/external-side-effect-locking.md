---
name: External side-effect serialization
description: Cross-instance rule for preventing duplicate Zoho entities when several routes can trigger the same operation.
---

Every route or status transition that can create the same external Zoho Sales Order or project for a form must use the same transaction-scoped PostgreSQL advisory lock, re-read the form after acquiring it, and persist the external ID before releasing it.

**Why:** An approval transition and a manual creation endpoint can race across application instances. A pre-lock idempotency check is insufficient and can create duplicate billable external records.

**How to apply:** When adding another external-creation path, reuse the form transition lock rather than a process-local flag. Re-check status and external IDs inside the lock; keep the lock transaction-scoped so crashes release it automatically.

Shopify order identity must survive integration reconnection: use the normalized store plus the vendor order ID, not an integration record ID, when serializing Books creation and recognizing existing external records.

**Why:** Reconnecting the same store can leave cached copies under both bare-host and HTTPS-prefixed integrations. Treating them as separate orders duplicates operational work and can create two Books sales orders.

**How to apply:** Keep different stores isolated, preserve completed/in-progress work across aliases, and reuse a previously stored external sales-order ID before creating anything.