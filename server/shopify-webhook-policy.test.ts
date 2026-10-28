import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import {
  ORDER_WEBHOOK_TOPICS,
  isValidShopifyWebhook,
  missingWebhookTopics,
  orderWebhookAddress,
} from "./shopify-webhook-policy";

test("webhook address uses the public HTTPS origin only", () => {
  assert.equal(orderWebhookAddress("https://servicessystemed.app/"), "https://servicessystemed.app/api/webhooks/shopify/orders");
  assert.equal(orderWebhookAddress("https://servicessystemed.app/admin?x=1"), "https://servicessystemed.app/api/webhooks/shopify/orders");
  assert.equal(orderWebhookAddress("http://servicessystemed.app"), null);
  assert.equal(orderWebhookAddress(""), null);
  assert.equal(orderWebhookAddress(undefined), null);
  assert.equal(orderWebhookAddress("not a url"), null);
});

test("HMAC is accepted for any configured secret and rejected otherwise", () => {
  const body = Buffer.from(JSON.stringify({ id: 1014 }));
  const hmac = createHmac("sha256", "app-secret").update(body).digest("base64");
  assert.equal(isValidShopifyWebhook(body, hmac, ["", "other", "app-secret"]), true);
  assert.equal(isValidShopifyWebhook(body, hmac, ["other"]), false);
  assert.equal(isValidShopifyWebhook(Buffer.from("tampered"), hmac, ["app-secret"]), false);
  assert.equal(isValidShopifyWebhook(body, undefined, ["app-secret"]), false);
  assert.equal(isValidShopifyWebhook(undefined, hmac, ["app-secret"]), false);
  assert.equal(isValidShopifyWebhook(body, "short", ["app-secret"]), false);
});

test("only topics missing at our address are (re)created", () => {
  const address = "https://servicessystemed.app/api/webhooks/shopify/orders";
  const existing = [
    { topic: "orders/create", address },
    { topic: "orders/paid", address: "https://old-dev.replit.dev/api/webhooks/shopify/orders" },
  ];
  assert.deepEqual(missingWebhookTopics(existing, address), ["orders/paid", "orders/cancelled"]);
  assert.deepEqual(
    missingWebhookTopics(ORDER_WEBHOOK_TOPICS.map((topic) => ({ topic, address })), address),
    [],
  );
});
