import assert from "node:assert/strict";
import test from "node:test";
import {
  isShopifyCreditSufficient,
  normalizeShopifyStoreUrl,
  shopifyCreditHttpStatus,
} from "./shopify-credit-policy.ts";

test("normalise toutes les formes de l'URL de la boutique Mapei", () => {
  assert.equal(normalizeShopifyStoreUrl("HTTPS://TNT5AR-KI.MYSHOPIFY.COM/"), "tnt5ar-ki.myshopify.com");
});

test("un crédit insuffisant bloque le checkout", () => {
  assert.equal(isShopifyCreditSufficient("99.99", "100.00"), false);
  assert.equal(shopifyCreditHttpStatus("Crédit insuffisant."), 400);
});

test("un crédit égal ou supérieur autorise le checkout", () => {
  assert.equal(isShopifyCreditSufficient("100.00", "100.00"), true);
  assert.equal(isShopifyCreditSufficient("125.00", "100.00"), true);
});

test("une indisponibilité Shopify reste une erreur de service", () => {
  assert.equal(shopifyCreditHttpStatus("Crédit Shopify indisponible."), 503);
  assert.equal(shopifyCreditHttpStatus("Connexion Shopify requise."), 503);
});
