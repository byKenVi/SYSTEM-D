import test from "node:test";
import assert from "node:assert/strict";
import { generateOrderPdf, type OrderPdfData } from "./pdf-generator";

const sample: OrderPdfData = {
  reference: "Mapei #1234",
  storeName: "Mapei",
  sourceLabel: "Shopify direct",
  date: new Date("2026-10-20T12:00:00Z"),
  currency: "CAD",
  total: 345.5,
  lineItems: [
    { name: "Mortier colle premium", sku: "MAP-001", quantity: 10, unitPrice: 25 },
    { name: "Joint époxy", sku: "MAP-002", quantity: 2, unitPrice: 47.75 },
  ],
  salesOrderNumber: "SO-0001",
  dealUrl: "https://crm.zoho.com/crm/org/tab/Potentials/123",
  projectUrl: "https://projects.zoho.com/portal/x#project/456",
};

test("generateOrderPdf produit un buffer PDF valide", async () => {
  const buf = await generateOrderPdf(sample, {
    name: "Jean Tremblay",
    email: "jean@exemple.ca",
    companyName: "Construction Québec",
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 500, "le PDF doit avoir un contenu substantiel");
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-", "signature PDF attendue");
});

test("generateOrderPdf tolère une commande sans articles ni contact", async () => {
  const buf = await generateOrderPdf({
    reference: "Mapei #0",
    sourceLabel: "Système D",
    currency: "cad",
    total: 0,
    lineItems: [],
  });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 300);
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
});
