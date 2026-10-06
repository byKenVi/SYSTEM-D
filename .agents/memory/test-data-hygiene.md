---
name: Test data hygiene
description: Publication readiness and the user's conservative scope for removing test data.
---

The user wants this site free of test/demo records before publication and selected “Uniquement les tests certains” for cleanup.

**Why:** Some records with test-like names are mixed with paid orders and Zoho-linked forms. A test marker alone does not prove that deleting the record or its linked history is safe.

**How to apply:** Remove only proven fixtures and inspection traces. Preserve ambiguous clients, products, paid orders, forms, balances, and external Shopify/Zoho records unless the user explicitly identifies them for deletion. Do not automatically generate demo business data on startup. Automated tests must clean up their own records.
