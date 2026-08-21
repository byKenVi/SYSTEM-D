import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dedupeScopedProducts } from "./portal-product-deduplication";

test("le portail déduplique les produits Zoho répliqués entre les fiches d'un même compte", () => {
  const result = dedupeScopedProducts([
    { id: 1, contactId: 10, zohoItemId: "zoho-9106", shopifyVariantId: "variant-9106" },
    { id: 2, contactId: 11, zohoItemId: null, shopifyVariantId: "variant-9106" },
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

test("les clés de secours dédoublonnent par produit Shopify puis par boutique, SKU, nom et prix", () => {
  const result = dedupeScopedProducts([
    { id: 8, contactId: 1, shopifyProductId: "product-8", sku: "MK10", name: "Boîte MK10", price: "8.50" },
    { id: 9, contactId: 2, shopifyProductId: "product-8", sku: "mk10", name: "Autre titre", price: "9.00" },
    { id: 10, contactId: 1, shopifyStoreUrl: "https://example.myshopify.com/", sku: "MK11", name: "Boîte MK11", price: "3.80" },
    { id: 11, contactId: 2, shopifyStoreUrl: "example.myshopify.com", sku: "mk11", name: " boîte  mk11 ", price: 3.8 },
  ], 1);

  assert.deepEqual(result.map((product) => product.id), [8, 10]);
});

test("le choix du produit visible est déterministe", () => {
  const result = dedupeScopedProducts([
    { id: 9, contactId: 2, zohoItemId: "zoho-1", lastSyncedAt: "2026-01-02T00:00:00.000Z" },
    { id: 4, contactId: 3, zohoItemId: "zoho-1", lastSyncedAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, contactId: 4, zohoItemId: "zoho-1", lastSyncedAt: "2026-01-02T00:00:00.000Z" },
  ]);

  assert.deepEqual(result.map((product) => product.id), [2]);
});

test("les réponses et écrans catalogue dédoublonnent côté client comme côté admin", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const portalBoutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
  const portalDashboard = readFileSync(new URL("../client/src/pages/portal/dashboard.tsx", import.meta.url), "utf8");
  const adminBoutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");

  assert.match(routes, /app\.get\("\/api\/products"[\s\S]{0,400}dedupeScopedProducts\(products\)/);
  assert.match(routes, /const deduped = dedupeScopedProductsWithStats\(rawProducts, role\.contactId\)/);
  assert.match(routes, /X-Catalog-Final-Count/);
  assert.match(portalBoutique, /dedupeCatalogProducts\(rawProducts, viewAsContactId\)/);
  assert.match(portalDashboard, /dedupeCatalogProducts\(rawProducts, viewAsContactId\)/);
  assert.match(adminBoutique, /dedupeCatalogProducts\(rawProducts\)/);
});