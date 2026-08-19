---
name: External side-effect serialization
description: Cross-instance rule for preventing duplicate Zoho entities when several routes can trigger the same operation.
---

Every route or status transition that can create the same external Zoho Sales Order or project for a form must use the same transaction-scoped PostgreSQL advisory lock, re-read the form after acquiring it, and persist the external ID before releasing it.

**Why:** An approval transition and a manual creation endpoint can race across application instances. A pre-lock idempotency check is insufficient and can create duplicate billable external records.

**How to apply:** When adding another external-creation path, reuse the form transition lock rather than a process-local flag. Re-check status and external IDs inside the lock; keep the lock transaction-scoped so crashes release it automatically.