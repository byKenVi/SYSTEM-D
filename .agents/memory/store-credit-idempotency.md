---
name: Store-credit checkout idempotency
description: Rules for preventing duplicate in-flight store-credit debits without blocking valid repeat purchases.
---

Only a pending store-credit debit may be treated as an idempotency conflict. Once an order is paid, the customer is free to purchase the same cart again.

**Why:** A deterministic cart fingerprint is identical for legitimate repeat purchases. Keeping paid orders in the unique constraint turned a successful purchase into a permanent “payment already in progress” error.

**How to apply:** Keep the database uniqueness guard scoped to pending orders, cancel abandoned pending attempts after a short safety window, and ensure retries do not create a second debit while the first request is active.