import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("le catalogue admin distingue les produits de clients différents", () => {
  const boutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");

  assert.match(boutique, /const \[groupBy, setGroupBy\] = useState<boolean>\(true\)/);
  assert.match(boutique, /const getProductOwnerLabel =/);
  assert.match(boutique, /text-product-owner-/);
  assert.match(boutique, /text-card-product-owner-/);
});