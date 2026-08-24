import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const customerDetail = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
const forms = readFileSync(new URL("../client/src/pages/portal/forms.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("le portail expose Mes reps et un seul onglet Mes commandes", () => {
  assert.match(boutique, /Mes reps/);
  assert.match(boutique, /Mes commandes/);
  assert.match(forms, /Mes Soumissions/);
  assert.doesNotMatch(boutique, /row-order-submission/);
  assert.doesNotMatch(boutique, /TabsTrigger value="systemd-orders"/);
});

test("le checkout résout automatiquement le rep par l'email authentifié", () => {
  assert.match(boutique, /Rep à débiter/);
  assert.match(boutique, /JSON\.stringify\(\{ items: payload \}\)/);
  assert.doesNotMatch(boutique, /data-testid="select-checkout-rep"/);
  assert.match(routes, /findMapiRepByEmail\(authenticatedEmail\)/);
  assert.match(routes, /Aucun compte crédit Shopify n’est associé à votre utilisateur/);
  assert.match(routes, /paymentMethod: "shopify_credit"/);
});

test("le checkout réutilise le rep fraîchement synchronisé avant une recherche Shopify de secours", () => {
  assert.match(routes, /MAPI_CHECKOUT_CACHE_MAX_AGE_MS = 10 \* 60 \* 1000/);
  assert.match(routes, /findFreshCachedMapiRepByEmail/);
  const checkout = routes.slice(
    routes.indexOf('app.post("/api/portal/systemd-checkout"'),
    routes.indexOf('app.get("/api/admin/systemd-orders"', routes.indexOf('app.post("/api/portal/systemd-checkout"')),
  );
  const cacheLookup = checkout.indexOf("findFreshCachedMapiRepByEmail(authenticatedEmail)");
  const liveLookup = checkout.indexOf("findMapiRepByEmail(authenticatedEmail)");
  assert.ok(cacheLookup > -1 && liveLookup > cacheLookup, "le cache récent est préféré à une seconde liste Shopify");
  assert.match(checkout, /getRepBalance\(shopifyCustomerGid\)/, "le solde reste relu en direct avant le débit");
  assert.match(checkout, /res\.status\(creditErrorStatus\(error\.message\)\)/, "une indisponibilité de recherche reste un 503, pas un faux 400");
});

test("Mes reps lit les soldes Mapei et identifie le compte de l'utilisateur", () => {
  assert.match(boutique, /\/api\/portal\/mapi\/reps/);
  assert.match(boutique, /Crédit disponible/);
  assert.match(routes, /isCurrentContact: !!authenticatedEmail/);
});

test("la fiche rep lit le crédit Shopify sans proposer d'ajustement manuel", () => {
  assert.match(customerDetail, /\/api\/portal\/mapi\/reps\/by-shopify-customer/);
  assert.match(customerDetail, /Crédit Shopify du rep/);
  assert.match(customerDetail, /Les crédits reps se gèrent dans Shopify/);
  assert.doesNotMatch(customerDetail, /button-credit-rep|button-submit-credit/);
  assert.match(routes, /Système D est en lecture et synchronisation uniquement/);
});

test("les opérations Shopify sensibles sont journalisées", () => {
  for (const eventType of [
    "shopify_reps_sync",
    "shopify_credit_read",
    "shopify_credit_checkout",
    "shopify_token_invalid",
    "shopify_permission_insufficient",
  ]) {
    assert.match(routes, new RegExp(eventType));
  }
});

test("le checkout ne réserve le stock et ne marque paid qu'après preuve du débit Shopify", () => {
  const checkout = routes.slice(
    routes.indexOf('app.post("/api/portal/systemd-checkout"'),
    routes.indexOf('app.get("/api/admin/systemd-orders"', routes.indexOf('app.post("/api/portal/systemd-checkout"')),
  );
  const proof = checkout.indexOf("assertShopifyDebitProof");
  const reserve = checkout.indexOf("reserveSystemdOrderStock(order.id)");
  const paid = checkout.indexOf("markSystemdOrderPaidIfPending");
  assert.ok(proof > -1 && reserve > proof, "la réservation locale doit suivre la preuve Shopify");
  assert.ok(paid > reserve, "paid doit suivre la preuve Shopify et la réservation locale");
  assert.match(checkout, /Le crédit Shopify n’a pas pu être débité\. Aucune commande payée n’a été créée\./);
});
