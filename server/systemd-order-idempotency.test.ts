import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const startup = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const adminBoutique = readFileSync(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");

test("une réconciliation Shopify bloque la même intention de checkout", () => {
  assert.match(
    startup,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_systemd_orders_intent_active[\s\S]*status IN \('pending', 'payment_reconciliation_required'\)/,
  );
  assert.match(storage, /inArray\(systemdOrders\.status, \["pending", "payment_reconciliation_required"\]\)/);
  assert.match(routes, /previousOrder\?\.status === "pending" \|\| previousOrder\?\.status === "payment_reconciliation_required"/);
});

test("une réconciliation admin doit confirmer une transaction Shopify exacte ou libérer le stock", () => {
  assert.match(routes, /app\.get\("\/api\/admin\/systemd-orders\/:id\/reconciliation"/);
  assert.match(routes, /app\.post\("\/api\/admin\/systemd-orders\/:id\/reconciliation"/);
  assert.match(routes, /getRepTransactionHistory\(order\.shopifyCustomerGid, 100\)/);
  assert.match(routes, /transaction\.accountId === order\.shopifyCreditAccountId/);
  assert.match(routes, /storage\.resolveSystemdOrderReconciliation\(orderId, \{/);
  assert.match(routes, /await storage\.releaseSystemdOrderStock\(orderId\)/);
  assert.match(adminBoutique, /Débits Shopify à réconcilier/);
  assert.match(adminBoutique, /button-reconcile-systemd-/);
});