---
name: Production test access
description: Approval-based, browser-bound read-only inspection and limits on production test permissions.
---

Production inspection uses a request created by the tester's own browser and explicitly approved in an existing normal administrator session. A displayed matching code is not a login credential. Requests expire after 10 minutes; approved access expires after 30 minutes and remains revocable.

**Why:** The user chose secure temporary access after automated production browsers could not use the user's personal login cookies. Passwords, session cookies and production OIDC claim overrides are not acceptable substitutes.

**How to apply:** Preserve browser binding and validate approval, expiry, revocation and approver's current role on every API request. Validation must remain read-only, including role lookup: do not bootstrap an admin or link a contact as a side effect. Default-deny endpoints; some GET routes synchronize, reconcile or initiate OAuth, so method checks alone are insufficient.

This permission covers inspection only, not purchases, credit debits, order changes, manual synchronization or integration settings. Purchase/idempotency checklist sections need separate explicit authorization, a designated test account and a budget; temporary read-only access does not authorize them.

**Why:** The agreed production test access explicitly forbids these side effects.

**How to apply:** Do not widen this grant to finish write-related E2E checks. Report such sections as not executed and obtain separate authorization.
