---
name: Store-credit checkout idempotency
description: Rules for preventing duplicate in-flight store-credit debits without blocking valid repeat purchases.
---

Only a pending store-credit debit may be treated as an idempotency conflict. Once an order is paid, the customer is free to purchase the same cart again. A pending debit must never be auto-cancelled solely because it is old: an external response may have been lost after Shopify committed the debit.

**Why:** A deterministic cart fingerprint is identical for legitimate repeat purchases. Keeping paid orders in the unique constraint turned a successful purchase into a permanent “payment already in progress” error. Conversely, retrying an ambiguous pending debit can charge the same credit account twice.

**How to apply:** Keep the database uniqueness guard scoped to pending orders. Let only a Shopify mutation rejection proven by a user error release the attempt; network, timeout, API and response-proof failures require reconciliation and retain the reservation until their outcome is resolved.