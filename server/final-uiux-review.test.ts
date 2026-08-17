import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../client/src/pages/landing.tsx", import.meta.url), "utf8");
const adminBoutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
const adminSystemdDetail = readFileSync(new URL("../client/src/pages/admin/systemd-product-detail.tsx", import.meta.url), "utf8");
const portalBoutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const portalSystemdDetail = readFileSync(new URL("../client/src/pages/portal/systemd-product-detail.tsx", import.meta.url), "utf8");
const portalDeliveries = readFileSync(new URL("../client/src/pages/portal/livraisons.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("la fiche produit Système D admin reste dans le layout admin", () => {
  assert.match(app, /\/admin\/boutique\/systemd\/:zohoItemId/);
  assert.match(adminBoutique, /navigate\(`\/admin\/boutique\/systemd\//);
  assert.doesNotMatch(adminBoutique, /window\.open\(`\/portal\/systemd/);
  assert.match(adminSystemdDetail, /Vue administrateur en lecture seule/);
  assert.match(adminSystemdDetail, /Voir côté client/);
});

test("les commandes Système D sont visibles et traitables dans Boutique", () => {
  assert.match(adminBoutique, /Commandes Système D à traiter/);
  assert.match(adminBoutique, /Marquer en traitement/);
  assert.match(adminBoutique, /Marquer traitée/);
  assert.match(adminBoutique, /\/api\/admin\/systemd-orders/);
});

test("les KPI boutique agrègent Shopify et les commandes Système D payées", () => {
  assert.match(routes, /const allSystemdOrders = await storage\.getSystemdOrders\(\)/);
  assert.match(routes, /paidSystemdOrders/);
  assert.match(routes, /kpis\.ordersThisMonth \+= systemdThisMonth\.length/);
  assert.match(routes, /kpis\.valueThisMonth \+= systemdValue\(systemdThisMonth\)/);
});

test("la landing reste courte et centrée sur les trois actions du portail", () => {
  assert.match(landing, /Gérez vos demandes, commandes et livraisons au même endroit/);
  assert.match(landing, /Demander un service/);
  assert.match(landing, /Commander des produits/);
  assert.match(landing, /Suivre vos opérations/);
  assert.doesNotMatch(landing, /FORM_TYPES|ADMIN_FEATURES|CLIENT_FEATURES/);
});

test("le portail conserve le contexte produit et utilise un feedback panier discret", () => {
  assert.match(portalBoutique, /systemdSearch/);
  assert.match(portalBoutique, /systemdView/);
  assert.match(portalBoutique, /ClipboardList/);
  assert.match(portalSystemdDetail, /requestedReturnTo/);
  assert.match(portalSystemdDetail, /object-contain/);
  assert.match(portalSystemdDetail, /Le panier a été mis à jour/);
  assert.doesNotMatch(portalSystemdDetail, /toast\(/);
});

test("le flow livraison est expliqué sans inventer de transporteur", () => {
  assert.match(portalDeliveries, /Comment une livraison apparaît ici/);
  assert.match(portalDeliveries, /aucune intégration transporteur n’est simulée/);
  assert.match(portalDeliveries, /Les livraisons apparaîtront lorsqu’une demande de livraison sera soumise/);
});
