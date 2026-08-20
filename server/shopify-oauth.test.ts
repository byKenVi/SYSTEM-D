import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  buildShopifyAuthUrl,
  classifyShopifyFailure,
  verifyShopifyCallbackHmac,
} from "./shopify-api";

test("le flux OAuth Shopify demande un token offline avec toutes les portées requises", () => {
  const url = new URL(buildShopifyAuthUrl(
    "example-store.myshopify.com",
    "client-id",
    "https://portal.example.com/api/auth/shopify/callback",
    "safe-state",
  ));

  assert.equal(url.hostname, "example-store.myshopify.com");
  assert.equal(url.searchParams.get("state"), "safe-state");
  assert.equal(url.searchParams.has("grant_options[]"), false, "absence = token offline Shopify");
  const scopes = new Set((url.searchParams.get("scope") ?? "").split(","));
  for (const scope of [
    "read_products",
    "read_inventory",
    "write_inventory",
    "read_locations",
    "read_customers",
    "read_orders",
    "read_store_credit_accounts",
    "write_store_credit_account_transactions",
  ]) {
    assert.ok(scopes.has(scope), `portée OAuth absente : ${scope}`);
  }
});

test("le callback OAuth Shopify vérifie la signature brute et rejette une altération", () => {
  const secret = "shopify-test-secret";
  const signedQuery = "code=one-time-code&host=YWRtaW4&shop=example-store.myshopify.com&state=nonce&timestamp=1700000000";
  const hmac = createHmac("sha256", secret).update(signedQuery).digest("hex");

  assert.equal(verifyShopifyCallbackHmac(`${signedQuery}&hmac=${hmac}`, secret), true);
  assert.equal(verifyShopifyCallbackHmac(`${signedQuery.replace("nonce", "other")}&hmac=${hmac}`, secret), false);
  assert.equal(verifyShopifyCallbackHmac(signedQuery, secret), false);
});

test("seul un 401 invalide une installation Shopify", () => {
  assert.equal(classifyShopifyFailure(new Error("Shopify API error 401: Unauthorized")), "invalid_token");
  assert.equal(classifyShopifyFailure(new Error("Shopify API error 403: Forbidden")), "permission_insufficient");
  assert.equal(classifyShopifyFailure(new Error("Shopify API error 429: Too Many Requests")), "throttled");
  assert.equal(classifyShopifyFailure(new Error("fetch failed")), "transient");
});