import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
const customerDetail = readFileSync(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("le portail expose Mes reps et un seul onglet Mes commandes", () => {
  assert.match(boutique, /Mes reps/);
  assert.match(boutique, /Mes commandes/);
  assert.match(boutique, />Soumission</);
  assert.doesNotMatch(boutique, /TabsTrigger value="systemd-orders"/);
});

test("le checkout sélectionne un rep et envoie son identifiant au backend", () => {
  assert.match(boutique, /Rep à débiter/);
  assert.match(boutique, /JSON\.stringify\(\{ items: payload, shopifyCustomerId \}\)/);
  assert.match(routes, /paymentMethod: "shopify_credit"/);
});

test("la fiche rep utilise les routes crédit sécurisées du portail", () => {
  assert.match(customerDetail, /\/api\/portal\/mapi\/reps\/by-shopify-customer/);
  assert.match(customerDetail, /Crédit Shopify du rep/);
});

test("les opérations Shopify sensibles sont journalisées", () => {
  for (const eventType of [
    "shopify_reps_sync",
    "shopify_credit_read",
    "shopify_credit_add",
    "shopify_credit_checkout",
    "shopify_token_invalid",
    "shopify_permission_insufficient",
  ]) {
    assert.match(routes, new RegExp(eventType));
  }
});
