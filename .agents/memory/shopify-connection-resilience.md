---
name: Shopify connection resilience
description: Classification rules for Shopify integration health and automatic sync failures.
---

Only a Shopify HTTP 401 means the stored token is invalid. A 403 usually indicates missing app scope, while 429, 5xx, and network failures are transient and must not disconnect or invalidate the integration.

**Why:** Marking all failures as token problems repeatedly made healthy integrations appear disconnected, even though a retry could succeed without any credential change.

**How to apply:** Preserve the active connection on recoverable errors, back off scheduled syncs, and surface the specific issue without requiring a token reconnect. New OAuth authorizations must include the scopes needed by features, including order reads.