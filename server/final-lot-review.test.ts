import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../client/src/pages/admin/settings.tsx", import.meta.url), "utf8");
const portalBoutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const adminBoutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
const adminRep = readFileSync(new URL("../client/src/pages/admin/customer-detail.tsx", import.meta.url), "utf8");
const portalRep = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
const portalNotifications = readFileSync(new URL("../client/src/pages/portal/notifications.tsx", import.meta.url), "utf8");

test("déconnecter une boutique conserve l'intégration et ses données", () => {
  assert.match(routes, /connectionStatus: "disconnected"/);
  assert.match(routes, /Produits, reps, commandes et historique conservés/);
  assert.doesNotMatch(routes.slice(routes.indexOf('app.delete("\/api\/shopify-integrations\/:id"'), routes.indexOf("Test connexion Shopify")), /deleteShopifyIntegration/);
});

test("les paramètres préparent plusieurs plateformes et plusieurs boutiques par client", () => {
  assert.match(settings, /Ajouter une boutique/);
  assert.match(settings, /Autre \/ à configurer/);
  assert.match(settings, /availableClients = contacts \?\? \[\]/);
  assert.match(settings, /Synchroniser les reps/);
});

test("Zoho Projects se déconnecte indépendamment de Zoho Inventory", () => {
  assert.match(settings, /Déconnecter Zoho Projects/);
  assert.match(routes, /zoho-projects\/disconnect/);
  assert.match(routes, /Zoho Inventory et les identifiants de projets historiques sont conservés/);
});

test("les dépenses reps agrègent les commandes Shopify et Système D", () => {
  assert.match(routes, /Number\(rep\.amountSpent \?\? 0\) \+ repSystemdOrders\.reduce/);
  assert.match(routes, /Number\(c\.total_spent \?\? 0\) \+ localOrders\.reduce/);
});

test("aucun ajustement manuel de crédit n'est exposé sur les fiches reps actives", () => {
  assert.doesNotMatch(adminRep, /button-credit-rep|button-confirm-credit/);
  assert.doesNotMatch(portalRep, /button-credit-rep|button-submit-credit/);
  assert.match(adminRep, /Les crédits reps se gèrent dans Shopify/);
  assert.match(portalRep, /Paiement commande Système D/);
  assert.match(routes, /Système D est en lecture et synchronisation uniquement/);
  assert.match(routes, /Les ajustements de crédit reps se gèrent dans Shopify/);
});

test("les commandes client utilisent des tableaux cohérents pour les deux sources", () => {
  assert.match(portalBoutique, /min-w-\[920px\]/);
  assert.match(portalBoutique, /<TableHead>Source<\/TableHead>/);
  assert.match(portalBoutique, /client_product" \? "Produit client · Shopify" : "Commande Système D locale"/);
  assert.match(portalBoutique, /<Badge variant="outline">Shopify<\/Badge>/);
  assert.doesNotMatch(adminBoutique, />Clients Shopify</);
});

test("ouvrir Notifications ne marque plus tout comme lu", () => {
  assert.doesNotMatch(portalNotifications, /markAllReadSilent|Auto-marquer comme lu/);
  assert.match(portalNotifications, /if \(!n\.isRead\) markRead\.mutate\(n\.id\)/);
  assert.match(portalNotifications, /Tout marquer comme lu/);
});
