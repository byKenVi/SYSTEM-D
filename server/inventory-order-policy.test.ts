import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPicklistLines,
  resolvePickLocation,
  storeNameFromSubject,
  zohoToday,
  type InventoryLocation,
} from "./inventory-order-policy";

// Configuration réelle de l'organisation (2026-10-27).
const org: InventoryLocation[] = [
  { locationId: "L-ORG", name: "Organization Address", type: "general", status: "active", parentLocationId: null },
  { locationId: "L-Q1", name: "Q1 Mapei", type: "line_item_only", status: "active", parentLocationId: "L-ORG" },
  { locationId: "L-SD", name: "Les Services Système D inc.", type: "general", status: "inactive", parentLocationId: null },
];

test("the client's own warehouse is chosen from its name", () => {
  assert.equal(resolvePickLocation(org, ["Mapei"])?.locationId, "L-Q1");
  assert.equal(resolvePickLocation(org, [null, "MAPEI Inc."])?.locationId, "L-Q1");
});

test("a single active warehouse is used when no name matches", () => {
  assert.equal(resolvePickLocation(org, ["Autre client"])?.locationId, "L-Q1");
});

test("ambiguity is refused instead of guessed", () => {
  const two = [...org, { locationId: "L-Q2", name: "Q2 Mapei", type: "line_item_only", status: "active", parentLocationId: "L-ORG" }];
  assert.equal(resolvePickLocation(two, ["Mapei"]), null);
  const none = [...org, { locationId: "L-X", name: "Entrepôt Sud", type: "line_item_only", status: "active", parentLocationId: null }];
  assert.equal(resolvePickLocation(none, ["Inconnu"]), null);
});

test("a forced location wins, even if it is not a warehouse", () => {
  assert.equal(resolvePickLocation(org, ["Mapei"], "L-ORG")?.locationId, "L-ORG");
  assert.equal(resolvePickLocation(org, ["Mapei"], "missing"), null);
});

test("only inventory items with a quantity go to the picklist", () => {
  assert.deepEqual(
    buildPicklistLines("SO-1", [
      { lineItemId: "a", itemId: "I-1", quantity: 2 },
      { lineItemId: "b", itemId: null, quantity: 1 },
      { lineItemId: "c", itemId: "I-2", quantity: 0 },
    ]),
    [{ salesorder_id: "SO-1", parent_entity_id: "SO-1", so_line_item_id: "a", parent_line_item_id: "a", quantity_to_be_picked: 2 }],
  );
});

test("store name and Zoho date helpers", () => {
  assert.equal(storeNameFromSubject("Mapei #1014"), "Mapei");
  assert.equal(storeNameFromSubject("#1014"), null);
  assert.equal(storeNameFromSubject(null), null);
  // 23 h 30 à Montréal le 27 = 03 h 30 UTC le 28 : la date Zoho reste le 27.
  assert.equal(zohoToday(new Date("2026-10-28T03:30:00Z")), "2026-10-27");
});
