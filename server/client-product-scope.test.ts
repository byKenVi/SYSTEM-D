import assert from "node:assert/strict";
import test from "node:test";

const { resolveClientProductContactIds } = await import(
  new URL("./client-product-scope.ts", import.meta.url).href
);

const contact = (
  id: number,
  companyName: string | null,
  zohoCrmAccountId: string | null,
) => ({ id, companyName, zohoCrmAccountId });

test("shares products across contacts with the same Zoho account", () => {
  const contacts = [
    contact(1, "Mapei", "account-mapei"),
    contact(2, "Mapei Canada", "account-mapei"),
    contact(3, "Other", "account-other"),
  ];

  assert.deepEqual(resolveClientProductContactIds(contacts[0], contacts), [1, 2]);
});

test("includes a legacy company integration owner without an account ID", () => {
  const contacts = [
    contact(10, "Mapei", "account-mapei"),
    contact(11, "  MAPEI  ", null),
    contact(12, "Mapei", "account-other"),
  ];

  assert.deepEqual(resolveClientProductContactIds(contacts[0], contacts), [10, 11]);
});

test("never joins a same-name contact carrying a different Zoho account", () => {
  const contacts = [
    contact(20, "Shared name", "account-a"),
    contact(21, "Shared name", "account-b"),
  ];

  assert.deepEqual(resolveClientProductContactIds(contacts[0], contacts), [20]);
});

test("fails closed when a legacy contact name maps to multiple Zoho accounts", () => {
  const contacts = [
    contact(30, "Shared name", null),
    contact(31, "Shared name", "account-a"),
    contact(32, "Shared name", "account-b"),
  ];

  assert.deepEqual(resolveClientProductContactIds(contacts[0], contacts), [30]);
});

test("keeps contacts without organization metadata isolated", () => {
  const contacts = [contact(40, null, null), contact(41, null, null)];

  assert.deepEqual(resolveClientProductContactIds(contacts[0], contacts), [40]);
});
