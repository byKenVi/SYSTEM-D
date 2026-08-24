import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const product = readFileSync(new URL("../client/src/pages/portal/product-detail.tsx", import.meta.url), "utf8");
const rep = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../client/src/pages/admin/settings.tsx", import.meta.url), "utf8");
const portalNotifications = readFileSync(new URL("../client/src/pages/portal/notifications.tsx", import.meta.url), "utf8");
const adminNotifications = readFileSync(new URL("../client/src/pages/admin/notifications.tsx", import.meta.url), "utf8");

test("un produit client se paie par Store Credit sans créer de bon de travail", () => {
  assert.match(product, /\/api\/portal\/product-checkout/);
  assert.match(product, /Payer avec Store Credit/);
  assert.match(product, /Aucun Bon de Travail ne sera créé/);
  const checkout = routes.slice(routes.indexOf('app.post("/api/portal/product-checkout"'), routes.indexOf('app.post("/api/portal/systemd-checkout"'));
  const proof = checkout.indexOf("assertShopifyDebitProof");
  const paid = checkout.indexOf("markSystemdOrderPaidIfPending");
  assert.ok(proof > -1 && paid > proof);
  assert.match(checkout, /source: "client_product"/);
  assert.match(checkout, /action: "product_purchase_debit"/);
});

test("les stats rep additionnent Shopify et les commandes locales payées", () => {
  assert.match(routes, /localOrderCount: localPaidOrders\.length/);
  assert.match(rep, /combinedOrderCount/);
  assert.match(rep, /combinedAmountSpent/);
  assert.match(rep, /Paiement produit client/);
  assert.match(rep, /Débit Store Credit Shopify/);
});

test("chaque commande locale et notification ouvre une page de détail dédiée", () => {
  assert.match(app, /\/admin\/orders\/systemd\/:id/);
  assert.match(app, /\/portal\/orders\/systemd\/:id/);
  assert.match(routes, /\/api\/admin\/systemd-orders\/:id/);
  assert.match(routes, /\/api\/portal\/systemd-orders\/:id/);
  assert.match(portalNotifications, /`\/portal\/orders\/systemd\/\$\{meta\.systemdOrderId\}`/);
  assert.match(adminNotifications, /`\/admin\/orders\/systemd\/\$\{meta\.systemdOrderId\}`/);
});

test("l'ajout multi-boutique réserve client_credentials à Mapei et n'expose aucun secret marchand", () => {
  assert.match(routes, /storeUrl === "tnt5ar-ki\.myshopify\.com"/);
  assert.match(routes, /authMode: "oauth_offline"/);
  assert.match(settings, /WooCommerce — à venir/);
  assert.doesNotMatch(settings, /Consumer Secret|input-woo-consumer-secret|wooConsumerSecret/);
});
