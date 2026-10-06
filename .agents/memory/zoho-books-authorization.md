---
name: Zoho Books authorization
description: Books consent and organization selection must be checked independently from Inventory.
---

Adding Books to the OAuth authorization URL does not add Books permissions to an existing refresh-token grant. Missing Books permissions need renewed user consent, not repeated token refreshes.

**Why:** Books organization discovery was refused by the existing connection even though Inventory worked and the authorization URL already requested Books access.

**How to apply:** Distinguish rejected access/scopes from rate limits and temporary outages. Invalidate the in-memory access token after successful OAuth reconnection so old permissions are not retained.

Configure Books only after discovering accessible Books organizations and verifying the selected organization in read-only Books endpoints. Do not assume an Inventory organization ID proves Books access.

**Why:** Inventory connectivity and a stored organization ID are not evidence that the Books account or grant can access that organization.

**How to apply:** Auto-select an exact verified Inventory match or a sole accessible Books organization; require explicit selection for ambiguous results. Activation and testing must not create sales orders or initiate historical backfills.
