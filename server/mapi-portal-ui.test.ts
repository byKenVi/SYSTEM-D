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
