import test from "node:test";
import assert from "node:assert/strict";
import { mapCrmItemsToBooksLines } from "./crm-planned-orders";
import { planCrmProductSync } from "./crm-product-sync";

const catalog = [
  { zohoItemId: "INV-1", sku: "MK10", name: "Mortier MK10" },
  { zohoItemId: "INV-2", sku: null, name: "Seau vide" },
];

test("CRM lines are linked to Books items by SKU, then by exact name", () => {
  const codes = new Map([
    ["p1", { code: "mk10 ", name: "Mortier MK10 (CRM)" }],
    ["p2", { code: null, name: "seau VIDE" }],
  ]);
  const { lines, unmatched } = mapCrmItemsToBooksLines(
    [
      { productId: "p1", productName: "x", quantity: 2, listPrice: 5, description: null },
      { productId: "p2", productName: "x", quantity: 1, listPrice: 0, description: null },
    ],
    codes,
    catalog,
  );
  assert.deepEqual(lines.map((l) => l.itemId), ["INV-1", "INV-2"]);
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[0].rate, 5, "the original price is kept: the 100% discount is applied by Books");
  assert.deepEqual(unmatched, []);
});

test("Unknown products stay as free-text lines and are reported", () => {
  const { lines, unmatched } = mapCrmItemsToBooksLines(
    [{ productId: "p9", productName: "Inconnu", quantity: 1, listPrice: 3, description: null }],
    new Map([["p9", { code: "ZZ-9", name: "Inconnu" }]]),
    catalog,
  );
  assert.equal(lines[0].itemId, null);
  assert.equal(lines[0].name, "Inconnu");
  assert.deepEqual(unmatched, ["Inconnu (ZZ-9)"]);
});

test("Product sync creates missing items, updates changed ones, never touches inactive catalog items", () => {
  const plan = planCrmProductSync(
    [
      { name: "Mortier MK10", sku: "MK10", price: "12.5000", status: "active" },
      { name: "Colle C2", sku: "C2", price: "8.0000", status: "active" },
      { name: "Seau vide", sku: null, price: null, status: "active" },
      { name: "Ancien", sku: "OLD", price: "1", status: "inactive" },
    ],
    [
      { id: "1", name: "Mortier MK10", code: "MK10", unitPrice: 10, active: true },
      { id: "2", name: "Seau vide", code: null, unitPrice: null, active: false },
      { id: "3", name: "Colle C2", code: "OTHER", unitPrice: 8, active: true },
    ],
  );
  assert.deepEqual(plan.updates, [
    { id: "1", Unit_Price: 12.5 },
    { id: "2", Product_Active: true },
  ]);
  // "Colle C2" exists by name but with a different code: it is another product, not a match.
  assert.deepEqual(plan.creates, [{ Product_Name: "Colle C2", Product_Active: true, Product_Code: "C2", Unit_Price: 8 }]);
  assert.equal(plan.unchanged, 0);
});

test("A zero catalog price never overwrites a real CRM price", () => {
  const plan = planCrmProductSync(
    [
      { name: "Mortier MK10", sku: "MK10", price: "0.0000", status: "active" },
      { name: "Nouveau", sku: "NEW", price: "0", status: "active" },
    ],
    [{ id: "1", name: "Mortier MK10", code: "MK10", unitPrice: 24.99, active: true }],
  );
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.creates, [{ Product_Name: "Nouveau", Product_Active: true, Product_Code: "NEW" }]);
});

test("Re-running the product sync on an aligned CRM changes nothing", () => {
  const plan = planCrmProductSync(
    [{ name: "Mortier MK10", sku: "MK10", price: "12.5", status: "active" }],
    [{ id: "1", name: "Mortier MK10", code: "MK10", unitPrice: 12.5, active: true }],
  );
  assert.deepEqual(plan, { creates: [], updates: [], unchanged: 1 });
});
