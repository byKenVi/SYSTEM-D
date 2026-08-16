import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const adminBoutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
const portalBoutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const adminOrder = readFileSync(new URL("../client/src/pages/admin/order-detail.tsx", import.meta.url), "utf8");
const portalCustomer = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");

test("les détails Shopify utilisent integrationId et conservent un fallback local", () => {
  assert.match(routes, /function findShopifyIntegration/);
  assert.match(routes, /cachedOrderAsShopify/);
  assert.match(routes, /liveUnavailable: true/);
  assert.match(adminOrder, /integrationId/);
  assert.match(portalCustomer, /Dernières données synchronisées affichées/);
});

test("les onglets et retours boutique sont conservés dans l'URL", () => {
  assert.match(adminBoutique, /\/admin\/boutique\?tab=/);
  assert.match(portalBoutique, /next\.set\("tab", tab\)/);
  assert.match(adminOrder, /returnTo/);
});

test("les commandes Système D ont une vue et un workflow admin dédiés", () => {
  assert.match(app, /path="\/admin\/orders" component=\{AdminOrders\}/);
  assert.match(routes, /\/api\/admin\/systemd-orders\/:id\/fulfillment/);
  assert.match(routes, /"processing", "completed"/);
  assert.match(routes, /systemd_order_fulfillment/);
  assert.doesNotMatch(routes, /systemd_order[\s\S]{0,300}createZohoProject/);
});

test("reconnecter Shopify réutilise l'intégration normalisée", () => {
  assert.match(routes, /normalizeShopifyStoreUrl\(integration\.storeUrl\) === normalizedStore/);
  assert.match(routes, /reconnected: Boolean\(existing\)/);
  assert.match(routes, /updateShopifyIntegration\(existing\.id/);
});
