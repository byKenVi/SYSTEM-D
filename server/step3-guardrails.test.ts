import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const formEditor = readFileSync(new URL("../client/src/pages/form-editor.tsx", import.meta.url), "utf8");
const portalForms = readFileSync(new URL("../client/src/pages/portal/forms.tsx", import.meta.url), "utf8");
const adminForms = readFileSync(new URL("../client/src/pages/admin/forms.tsx", import.meta.url), "utf8");
const boutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");

test("les cinq formulaires historiques, leurs brouillons et leurs validations restent branchés", () => {
  for (const type of ["entreposage", "copacking", "inspection", "livraison", "tri"]) {
    assert.match(formEditor, new RegExp(`${type}:`));
  }
  assert.match(formEditor, /form\.status === "draft"/);
  assert.match(formEditor, /validateBeforeSubmit/);
  assert.match(routes, /approvedQuantity/);
  assert.match(routes, /generateFormPdf\(form, contact, uploads\)/);
  assert.match(routes, /createFormSalesOrder\(/);
  assert.match(routes, /createZohoProject\(/);
});

test("le bon de travail produit est créé par une route et un type dédiés", () => {
  assert.match(routes, /\/api\/portal\/product-work-orders/);
  assert.match(routes, /formType: "product_work_order"/);
  assert.match(routes, /sourceProductId: product\.id/);
  assert.match(routes, /sourceProductName: product\.name/);
  assert.match(routes, /storage\.createFormSubmission/);
  assert.match(portalForms, /product_work_order: "Bon de travail produit"/);
  assert.match(adminForms, /product_work_order: "Bon de travail produit"/);
  assert.match(boutique, /\/api\/portal\/product-work-orders/);
  assert.doesNotMatch(portalForms, /SelectItem value="product_work_order"/);
});

test("le type produit sort avant les validations et automatisations historiques", () => {
  const isolatedBranch = routes.indexOf('if (form.formType === "product_work_order")');
  const legacyNumericUpdate = routes.indexOf("if (approvedQuantity !== undefined", isolatedBranch);
  const legacySalesOrder = routes.indexOf("createFormSalesOrder({", isolatedBranch);
  assert.ok(isolatedBranch > -1);
  assert.ok(legacyNumericUpdate > isolatedBranch);
  assert.ok(legacySalesOrder > isolatedBranch);
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /return res\.json\(updated\)/);
  assert.match(routes, /\/api\/portal\/restock-requests/);
});

test("la réservation locale est idempotente et ne décrémente pas Zoho", () => {
  const start = storage.indexOf("async reserveSystemdOrderStock");
  const end = storage.indexOf("\n  async ", start + 10);
  const reservationMethod = storage.slice(start, end);
  assert.match(schema, /stock_reservation_status/);
  assert.match(schema, /stock_reserved_at/);
  assert.match(reservationMethod, /stockReservationStatus === "reserved"/);
  assert.match(reservationMethod, /already_reserved/);
  assert.match(reservationMethod, /\.for\("update"\)/);
  assert.match(reservationMethod, /stock_to_reserve/);
  assert.doesNotMatch(reservationMethod, /setZohoItemStock|pushItemToZoho|updateZohoItemClient/);
});

test("un retry payé réutilise la commande et la réservation existantes", () => {
  const retry = routes.indexOf('previousOrder?.status === "paid"');
  const pendingInsert = routes.indexOf("storage.tryInsertSystemdOrder", retry);
  assert.ok(retry > -1);
  assert.ok(pendingInsert > retry);
  assert.match(routes.slice(retry, pendingInsert), /reserveSystemdOrderStock\(previousOrder\.id\)/);
});
