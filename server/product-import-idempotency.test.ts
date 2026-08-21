import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("l'import Shopify délègue l'unicité des variants à la base de données", () => {
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");

  assert.match(schema, /products_contact_variant_unique/);
  assert.match(schema, /shopifyVariantId\} IS NOT NULL/);
  assert.match(storage, /onConflictDoUpdate/);
  assert.match(storage, /target: \[products\.contactId, products\.shopifyVariantId\]/);
  assert.match(storage, /targetWhere: sql`\$\{products\.shopifyVariantId\} IS NOT NULL`/);
});