import assert from "node:assert/strict";
import test from "node:test";
import { dedupeScopedProducts } from "./portal-product-deduplication";

test("le portail déduplique les produits Zoho répliqués entre les fiches d'un même compte", () => {
  const result = dedupeScopedProducts([
    { id: 1, contactId: 10, zohoItemId: "zoho-9106", shopifyVariantId: "variant-9106" },
    { id: 2, contactId: 11, zohoItemId: "zoho-9106", shopifyVariantId: "variant-9106" },
    { id: 3, contactId: 11, zohoItemId: "zoho-9107", shopifyVariantId: "variant-9107" },
  ], 11);

  assert.deepEqual(result.map((product) => product.id), [2, 3]);
});

test("le portail conserve deux produits avec le même nom apparent mais des identités source différentes", () => {
  const result = dedupeScopedProducts([
    { id: 1, contactId: 10, zohoItemId: "zoho-a", shopifyVariantId: "variant-a" },
    { id: 2, contactId: 11, zohoItemId: "zoho-b", shopifyVariantId: "variant-b" },
  ], 10);

  assert.deepEqual(result.map((product) => product.id), [1, 2]);
});

test("le portail ne fusionne pas les produits sans identifiant source fiable", () => {
  const result = dedupeScopedProducts([
    { id: 1, contactId: 10, zohoItemId: null, shopifyVariantId: null },
    { id: 2, contactId: 11, zohoItemId: null, shopifyVariantId: null },
  ], 10);

  assert.deepEqual(result.map((product) => product.id), [1, 2]);
});