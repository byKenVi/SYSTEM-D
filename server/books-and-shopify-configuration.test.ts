import test from "node:test";
import assert from "node:assert/strict";
import { shopifyAdminUrl } from "@shared/shopify-urls";
import { chooseBooksOrganization } from "./zoho-books-policy";
import { dedupeOperationalShopifyOrders, buildPaidSystemdShopifyKeys } from "./shopify-order-identity";
import type { ShopifyOrder, SystemdOrder } from "@shared/schema";
import { mock } from "node:test";
import { storage } from "./storage";
import { db, pool } from "./db";
import { ensureBooksSalesOrderForShopifyOrder, ensureBooksSalesOrderForSystemdOrder } from "./order-zoho-integration";
import { fetchBooksOrganizations } from "./zoho-books";
import { invalidateAccessTokenCache } from "./zoho-auth";
import { readFileSync } from "node:fs";

const order = (overrides: Partial<ShopifyOrder>): ShopifyOrder => ({
  id: 1, integrationId: 4, shopifyOrderId: "7174105595993",
  storeUrl: "shop.myshopify.com", operationalFulfillmentStatus: "to_process",
  syncedAt: new Date(1000), financialStatus: "paid", ...overrides,
} as ShopifyOrder);

test("Shopify URLs have exactly one HTTPS scheme across all supported input formats", () => {
  for (const host of ["shop.myshopify.com", "https://shop.myshopify.com", "HTTPS://SHOP.MYSHOPIFY.COM/", "https%3A%2F%2Fshop.myshopify.com%2F"]) {
    assert.equal(shopifyAdminUrl(host, "orders", "123"), "https://shop.myshopify.com/admin/orders/123");
    assert.equal(shopifyAdminUrl(host, "customers", 456), "https://shop.myshopify.com/admin/customers/456");
  }
  assert.equal(shopifyAdminUrl(null, "orders", 123), undefined);
  assert.equal(shopifyAdminUrl("shop.myshopify.com", "orders", "../elsewhere"), undefined);
  assert.equal(shopifyAdminUrl("https://shop.myshopify.com/admin"), "https://shop.myshopify.com/admin");
});

test("operational queue deduplicates reconnects without mixing distinct stores", () => {
  const rows = dedupeOperationalShopifyOrders([
    order({}), order({ integrationId: 5, storeUrl: "https://shop.myshopify.com", syncedAt: new Date(2000) }),
    order({ integrationId: 6, storeUrl: "different.myshopify.com" }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].integrationId, 5);
  assert.equal(rows[1].integrationId, 6);
});

test("a completed or in-progress copy cannot reappear as untreated after reconnection", () => {
  const completed = order({ operationalFulfillmentStatus: "completed" });
  const recent = order({ integrationId: 5, syncedAt: new Date(5000) });
  assert.equal(dedupeOperationalShopifyOrders([completed, recent])[0].operationalFulfillmentStatus, "completed");
  assert.equal(dedupeOperationalShopifyOrders([order({ operationalFulfillmentStatus: "in_progress" }), recent])[0].operationalFulfillmentStatus, "in_progress");
  assert.equal(dedupeOperationalShopifyOrders([order({ operationalFulfillmentStatus: "in_progress" }), { ...recent, financialStatus: "refunded" }])[0].financialStatus, "refunded");
});

test("SystemD-linked Shopify orders are excluded even under another integration for the same store", () => {
  const shopify = [order({}), order({ integrationId: 5, storeUrl: "https://shop.myshopify.com" }), order({ integrationId: 6, storeUrl: "different.myshopify.com" })];
  const keys = buildPaidSystemdShopifyKeys([{ status: "paid", shopifyIntegrationId: 4, shopifyOrderId: "7174105595993" } as SystemdOrder], shopify);
  assert.ok(keys.has("4:7174105595993"));
  assert.ok(keys.has("5:7174105595993"));
  assert.equal(keys.has("6:7174105595993"), false);
});

test("Books picks a verified matching or sole organisation, never an arbitrary one", () => {
  const organizations = [{ organization_id: "123", name: "Inventory match" }, { organization_id: "456", name: "Other" }];
  assert.equal(chooseBooksOrganization(organizations, "123").organization_id, "123");
  assert.equal(chooseBooksOrganization([organizations[1]], "999").organization_id, "456");
  assert.equal(chooseBooksOrganization(organizations, null, "456").organization_id, "456");
  assert.throws(() => chooseBooksOrganization(organizations, "999"), /Plusieurs organisations/);
  assert.throws(() => chooseBooksOrganization([], "123"), /Aucune organisation/);
  assert.throws(() => chooseBooksOrganization(organizations, null, "999"), /pas accessible/);
});

test("OAuth reconnection immediately drops cached tokens with the old Books permissions", () => {
  const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const oauth = source.slice(source.indexOf('app.get("/api/auth/zoho/callback"'), source.indexOf('app.get("/api/zoho/inventory"'));
  assert.equal((oauth.match(/invalidateAccessTokenCache\(\)/g) || []).length, 3);
  assert.doesNotMatch(oauth, /\.\.\.\(existing \|\| \{\}\)/);
});

test("Books shares the existing SO between cached integration aliases after a DB lock", async () => {
  const events: string[] = [];
  const rows = [order({}), order({ integrationId: 5, storeUrl: "https://shop.myshopify.com", zohoBooksSalesOrderId: "987", zohoBooksSalesOrderNumber: "SO-987", zohoBooksSalesOrderUrl: "https://books.zoho.com/app#/salesorders/987" })];
  const transaction = mock.method(db, "transaction", async (callback: any) => callback({ execute: async () => { events.push("lock"); } }));
  const read = mock.method(storage, "getShopifyOrders", async () => { events.push("read"); return rows; });
  const systemd = mock.method(storage, "getSystemdOrders", async () => []);
  let written: any;
  const update = mock.method(storage, "updateShopifyOrderZohoFields", async (_integration: number, _id: string, fields: any) => { written = fields; events.push("persist"); });
  const contact = mock.method(storage, "getContact", async () => { throw new Error("No new contact/SO should be requested."); });
  try {
    await ensureBooksSalesOrderForShopifyOrder(4, "7174105595993");
    assert.deepEqual(events, ["read", "lock", "read", "persist"]);
    assert.equal(written.zohoBooksSalesOrderId, "987");
  } finally {
    for (const method of [transaction, read, systemd, update, contact]) method.mock.restore();
  }
});

test("SystemD SO existence is rechecked after acquiring the lock", async () => {
  const events: string[] = [];
  const transaction = mock.method(db, "transaction", async (callback: any) => callback({ execute: async () => { events.push("lock"); } }));
  const read = mock.method(storage, "getSystemdOrders", async () => { events.push("read"); return [{ id: 21, status: "paid", zohoBooksSalesOrderId: "already-exists" } as SystemdOrder]; });
  try {
    await ensureBooksSalesOrderForSystemdOrder(21);
    assert.deepEqual(events, ["lock", "read"]);
  } finally { transaction.mock.restore(); read.mock.restore(); }
});

test("Books distinguishes missing scopes and rate limits without saving an organization", async () => {
  const settings = mock.method(storage, "getAdminSettings", async () => ({
    zohoInventoryRefreshToken: "unit-test-refresh-not-a-real-token",
    zohoAccessToken: "unit-test-access-not-a-real-token",
    zohoTokenExpiresAt: new Date(Date.now() + 120_000), zohoRegion: "us",
  } as any));
  const save = mock.method(storage, "upsertAdminSettings", async () => { throw new Error("Settings must not be saved."); });
  let mode = "scope";
  const network = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(mode === "scope" ? { code: 57 } : { code: 45 }), { status: mode === "scope" ? 401 : 429 }));
  try {
    invalidateAccessTokenCache();
    await assert.rejects(fetchBooksOrganizations(), (error: any) => error.code === "BOOKS_SCOPE_REQUIRED");
    mode = "limit";
    await assert.rejects(fetchBooksOrganizations(), (error: any) => error.code === "BOOKS_RATE_LIMITED");
    assert.equal(save.mock.callCount(), 0);
    assert.equal(network.mock.callCount(), 2, "A missing scope or rate limit must not force token refresh.");
  } finally {
    for (const method of [settings, save, network]) method.mock.restore();
    invalidateAccessTokenCache();
    await pool.end();
  }
});
