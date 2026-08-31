import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  createPaidShopifyOrder,
  ShopifyOrderCreateError,
} from "./shopify-api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const input = {
  storeUrl: "example.myshopify.com",
  accessToken: "test-token",
  customerId: "1",
  variantId: "2",
  quantity: 2,
  unitAmount: "12.50",
  amount: "25.00",
  currencyCode: "CAD" as const,
  systemdOrderId: 42,
  storeCreditTransactionId: "gid://shopify/StoreCreditAccountDebitTransaction/9",
};

test("orderCreate associe la preuve Store Credit et décrémente le stock", async () => {
  let requestBody: any;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      data: {
        orderCreate: {
          userErrors: [],
          order: {
            id: "gid://shopify/Order/1007",
            legacyResourceId: "1007",
            name: "#1007",
            displayFinancialStatus: "PAID",
            displayFulfillmentStatus: "UNFULFILLED",
            totalPriceSet: { shopMoney: { amount: "25.00", currencyCode: "CAD" } },
          },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const order = await createPaidShopifyOrder(input);

  assert.equal(order.legacyResourceId, "1007");
  assert.equal(requestBody.variables.order.financialStatus, "PAID");
  assert.equal(requestBody.variables.order.lineItems[0].priceSet.shopMoney.amount, "12.50");
  assert.equal(requestBody.variables.order.transactions[0].amountSet.shopMoney.amount, "25.00");
  assert.equal(requestBody.variables.order.transactions[0].authorizationCode, input.storeCreditTransactionId);
  assert.deepEqual(requestBody.variables.order.tags, ["systeme-d", "client-product", "systemd-order-42"]);
  assert.equal(requestBody.variables.options.inventoryBehaviour, "DECREMENT_OBEYING_POLICY");
});

test("un userError orderCreate est un refus déterministe compensable", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      orderCreate: {
        order: null,
        userErrors: [{ field: ["order", "lineItems"], message: "Insufficient inventory" }],
      },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  await assert.rejects(
    createPaidShopifyOrder(input),
    (error: unknown) => error instanceof ShopifyOrderCreateError && error.outcome === "rejected",
  );
});

test("une coupure réseau orderCreate reste ambiguë et ne doit pas déclencher de second débit", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };

  await assert.rejects(
    createPaidShopifyOrder(input),
    (error: unknown) => error instanceof ShopifyOrderCreateError && error.outcome === "unknown",
  );
});
