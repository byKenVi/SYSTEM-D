import assert from "node:assert/strict";
import test from "node:test";
import {
  assertShopifyDebitProof,
  isShopifyDebitDefinitelyRejected,
  isShopifyDebitOutcomeUnknown,
} from "./mapi-rep-budget.ts";

const validProof = {
  beforeBalance: "125.00",
  afterBalance: "100.00",
  expectedAmount: "25.00",
  expectedCurrency: "CAD",
  expectedAccountId: "gid://shopify/StoreCreditAccount/1",
  transaction: {
    transactionId: "gid://shopify/StoreCreditAccountTransaction/1",
    accountId: "gid://shopify/StoreCreditAccount/1",
    amount: "-25.00",
    currencyCode: "CAD",
  },
};

test("une preuve de débit Shopify exige le compte, le montant, la devise et le solde final exacts", () => {
  assert.doesNotThrow(() => assertShopifyDebitProof(validProof));
  assert.doesNotThrow(() => assertShopifyDebitProof({
    ...validProof,
    transaction: { ...validProof.transaction, amount: "-25" },
  }));
  assert.doesNotThrow(() => assertShopifyDebitProof({
    ...validProof,
    transaction: { ...validProof.transaction, amount: "-25.0" },
  }));

  const wrongBalance = { ...validProof, afterBalance: "100.01" };
  assert.throws(
    () => assertShopifyDebitProof(wrongBalance),
    (error: unknown) => isShopifyDebitOutcomeUnknown(error),
  );

  const wrongAccount = {
    ...validProof,
    transaction: { ...validProof.transaction, accountId: "gid://shopify/StoreCreditAccount/2" },
  };
  assert.throws(
    () => assertShopifyDebitProof(wrongAccount),
    (error: unknown) => isShopifyDebitOutcomeUnknown(error),
  );

  const wrongAmount = {
    ...validProof,
    transaction: { ...validProof.transaction, amount: "-25.01" },
  };
  assert.throws(
    () => assertShopifyDebitProof(wrongAmount),
    (error: unknown) => isShopifyDebitOutcomeUnknown(error),
  );
});

test("seuls les userErrors Shopify autorisent l'annulation sans réconciliation", () => {
  const rejected = Object.assign(new Error("Crédit insuffisant."), { code: "SHOPIFY_DEBIT_REJECTED" });
  assert.equal(isShopifyDebitDefinitelyRejected(rejected), true);
  assert.equal(isShopifyDebitDefinitelyRejected(new Error("fetch failed")), false);
  assert.equal(isShopifyDebitOutcomeUnknown(new Error("fetch failed")), false);
});