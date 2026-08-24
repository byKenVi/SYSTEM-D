import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildShopifyAuthUrl,
  classifyShopifyFailure,
  getShopIdentityGraphQL,
  requestShopifyClientCredentialsToken,
  ShopifyClientCredentialsError,
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
    "read_store_credit_account_transactions",
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

test("le callback consomme atomiquement son état avant tout échange de code", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const consumeIndex = routes.indexOf("const wasConsumed = await storage.consumeShopifyOAuthState");
  const exchangeIndex = routes.indexOf("const oauth = await exchangeShopifyCode");
  assert.ok(consumeIndex >= 0, "le callback doit réclamer l'état dans le stockage serveur");
  assert.ok(exchangeIndex > consumeIndex, "l'état doit être consommé avant l'échange du code");
  assert.match(routes, /hasRequiredShopifyScopes\(oauth\.scope\)/);
});

test("client_credentials envoie un formulaire et retourne un token temporaire", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ access_token: "test-token", expires_in: 86399, scope: "read_customers" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await requestShopifyClientCredentialsToken("example-store.myshopify.com", "id", "secret");
    assert.equal(result.accessToken, "test-token");
    assert.equal(result.expiresIn, 86399);
    assert.equal(captured?.headers && (captured.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(captured?.body));
    assert.equal(body.get("grant_type"), "client_credentials");
    assert.equal(body.get("client_id"), "id");
    assert.equal(body.get("client_secret"), "secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shop_not_permitted est distingué pour autoriser le fallback OAuth", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "shop_not_permitted" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
  try {
    await assert.rejects(
      requestShopifyClientCredentialsToken("example-store.myshopify.com", "id", "secret"),
      (error: unknown) => error instanceof ShopifyClientCredentialsError && error.code === "shop_not_permitted",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("le test de connexion utilise bien la requête GraphQL shop", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ data: { shop: { name: "Mapei", myshopifyDomain: "example-store.myshopify.com" } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const shop = await getShopIdentityGraphQL("example-store.myshopify.com", "test-token");
    assert.equal(shop.domain, "example-store.myshopify.com");
    assert.match(requestBody, /myshopifyDomain/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
