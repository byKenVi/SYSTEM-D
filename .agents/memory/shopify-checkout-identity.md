---
name: Shopify checkout identity
description: Safe identity resolution for a store-credit checkout without redundant Shopify customer listings.
---

A store-credit checkout may reuse a recent server-synced rep identity that matches the authenticated email, rather than re-listing Shopify customers immediately before payment. The account balance must still be read live before attempting the debit, and live again after it.

**Why:** The cart already needs a live rep list to display its owner and credit. Repeating the same paginated query at checkout can fail transiently despite a valid visible balance, incorrectly blocking a purchase.

**How to apply:** Use only a short-lived, active cached identity with an exact normalized email match and a valid Shopify Customer GID. Fall back to a live lookup when the cache is absent or stale; never use the cache as proof of funds. Select the intended CAD account explicitly, require the returned transaction to name that account and the expected *negative* debit amount, then require an exact cent-level before/after balance change before marking an order paid.