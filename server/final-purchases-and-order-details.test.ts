import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const product = readFileSync(new URL("../client/src/pages/portal/product-detail.tsx", import.meta.url), "utf8");
const rep = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../client/src/pages/admin/settings.tsx", import.meta.url), "utf8");
const boutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const formEditor = readFileSync(new URL("../client/src/pages/form-editor.tsx", import.meta.url), "utf8");
const localOrderDetail = readFileSync(new URL("../client/src/pages/local-order-detail.tsx", import.meta.url), "utf8");
const portalNotifications = readFileSync(new URL("../client/src/pages/portal/notifications.tsx", import.meta.url), "utf8");
const adminNotifications = readFileSync(new URL("../client/src/pages/admin/notifications.tsx", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("./shopify-client-order-reconciliation.ts", import.meta.url), "utf8");
const shopifyApi = readFileSync(new URL("./shopify-api.ts", import.meta.url), "utf8");

test("un produit client passe par le checkout Shopify sans faux paiement local", () => {
  assert.match(product, /\/api\/portal\/product-checkout/);
  assert.match(product, /Continuer dans Shopify/);
  assert.match(product, /Aucun Bon de Travail ne sera créé/);
  const checkout = routes.slice(routes.indexOf('app.post("/api/portal/product-checkout"'), routes.indexOf('app.post("/api/portal/systemd-checkout"'));
  assert.match(checkout, /createShopifyDraftCheckout/);
  assert.match(checkout, /status: "pending_shopify"/);
  assert.doesNotMatch(checkout, /debitRep\(|markSystemdOrderPaidIfPending/);
  assert.match(checkout, /source: "client_product"/);
  assert.match(shopifyApi, /draftOrderCreate/);
  assert.match(reconciliation, /displayFinancialStatus !== "PAID"/);
  assert.match(reconciliation, /originOrderTransactionId/);
  assert.match(reconciliation, /markSystemdOrderPaidIfShopifyConfirmed/);
});

test("les stats rep additionnent Shopify et les commandes locales payées", () => {
  assert.match(routes, /localOrderCount: localPaidOrders\.length/);
  assert.match(rep, /combinedOrderCount/);
  assert.match(rep, /combinedAmountSpent/);
  assert.match(rep, /Paiement produit client/);
  assert.match(rep, /Débit Store Credit Shopify/);
  assert.match(routes, /localOrders: localPaidOrders\.map/);
  assert.match(rep, /row-local-order-/);
  assert.match(rep, /Produit client/);
});

test("Commander et Bon de Travail restent deux flux sans contournement de paiement", () => {
  assert.match(product, /Commander avec crédit/);
  assert.match(product, /Crédit insuffisant pour commander/);
  assert.match(product, /Produit en rupture/);
  assert.match(product, /Aucun Bon de Travail ne sera créé/);
  assert.match(formEditor, /paiement non applicable/);
  const workOrderStart = routes.indexOf('app.post("/api/portal/product-work-orders"');
  const workOrder = routes.slice(workOrderStart, routes.indexOf('app.get("/api/activity-logs"', workOrderStart));
  assert.doesNotMatch(workOrder, /debitRep|product-checkout|markSystemdOrderPaidIfPending/);
});

test("chaque commande locale et notification ouvre une page de détail dédiée", () => {
  assert.match(app, /\/admin\/orders\/systemd\/:id/);
  assert.match(app, /\/portal\/orders\/systemd\/:id/);
  assert.match(routes, /\/api\/admin\/systemd-orders\/:id/);
  assert.match(routes, /\/api\/portal\/systemd-orders\/:id/);
  assert.match(portalNotifications, /`\/portal\/orders\/systemd\/\$\{meta\.systemdOrderId\}`/);
  assert.match(adminNotifications, /`\/admin\/orders\/systemd\/\$\{meta\.systemdOrderId\}`/);
  assert.match(localOrderDetail, /Historique/);
  assert.match(routes, /getSystemdOrderLogs/);
});

test("l'ajout multi-boutique réserve client_credentials à Mapei et n'expose aucun secret marchand", () => {
  assert.match(routes, /storeUrl === "tnt5ar-ki\.myshopify\.com"/);
  assert.match(routes, /authMode: "oauth_offline"/);
  assert.match(settings, /WooCommerce — à venir/);
  assert.match(settings, /Les données restent isolées par client/);
  assert.doesNotMatch(settings, /Consumer Secret|input-woo-consumer-secret|wooConsumerSecret/);
});
