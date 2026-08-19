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
const fileUpload = readFileSync(new URL("../client/src/components/forms/file-upload.tsx", import.meta.url), "utf8");

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
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /createZohoProject\(/);
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /zoho_project_create_error/);
  assert.doesNotMatch(routes.slice(isolatedBranch, legacyNumericUpdate), /createFormSalesOrder\(/);
  assert.match(routes, /\/api\/portal\/restock-requests/);
});

test("le projet BTP possède un nom et une description opérationnels", () => {
  const projects = readFileSync(new URL("./zoho-projects.ts", import.meta.url), "utf8");
  assert.match(projects, /product_work_order: "BTP"/);
  assert.match(projects, /sourceProductName/);
  assert.match(projects, /sourceProductSku/);
  assert.match(projects, /requestedQuantity/);
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

test("la réservation de stock précède toujours le débit Shopify", () => {
  const pendingInsert = routes.indexOf("storage.tryInsertSystemdOrder");
  const reservation = routes.indexOf("storage.reserveSystemdOrderStock(order.id)", pendingInsert);
  const debit = routes.indexOf("debitRep({", pendingInsert);
  assert.ok(pendingInsert > -1);
  assert.ok(reservation > pendingInsert);
  assert.ok(debit > reservation);
  assert.match(storage, /notInArray\(systemdOrders\.status, \["cancelled", "expired"\]\)/);
});

test("la création de formulaire utilise une séquence atomique", () => {
  assert.match(storage, /createFormSubmissionWithNextNumber/);
  assert.match(storage, /pg_advisory_xact_lock\(hashtext/);
  assert.doesNotMatch(routes, /storage\.getNextFormNumber\(/);
});

test("le bootstrap admin et les réponses sensibles sont durcis", () => {
  assert.match(routes, /ADMIN_BOOTSTRAP_USER_ID/);
  assert.match(routes, /storage\.claimAdminUserId/);
  assert.match(storage, /pg_advisory_xact_lock\(731946215\)/);
  assert.match(routes, /sanitizeAdminSettingsForResponse/);
  assert.match(routes, /sanitizeIntegrationForResponse/);
});

// ── Audit fix #1 : doublons dans le panier SystemD ───────────────────────────

test("le checkout SystemD agrège les doublons de zohoItemId avant validation et persistance", () => {
  // Route: normalisation par Map avant la boucle de résolution catalogue
  assert.match(routes, /itemOrderMap\.set\(key, itemOrderMap\.size\)/);
  assert.match(routes, /const quantity = \(itemQtyMap\.get\(key\) \?\? 0\) \+ raw\.quantity/);
  assert.match(routes, /Number\.isSafeInteger\(quantity\)/);
  assert.match(routes, /itemQtyMap\.set\(key, quantity\)/);
  assert.match(routes, /const items = \[\.\.\.itemOrderMap\.keys\(\)\]/);

  // Storage: agrégation défensive dans reserveSystemdOrderStock
  const start = storage.indexOf("async reserveSystemdOrderStock");
  const end = storage.indexOf("\n  async ", start + 10);
  const reservationMethod = storage.slice(start, end);
  assert.match(reservationMethod, /aggregatedQty\.set\(key, \(aggregatedQty\.get\(key\) \?\? 0\)/);
  assert.match(reservationMethod, /aggregatedMeta\.set\(key, item\)/);
});

test("les quantités dupliquées sont bien agrégées (logique inline)", () => {
  // Simulate the aggregation logic from the checkout route
  type CartItem = { zohoItemId: string; quantity: number };
  const rawItems: CartItem[] = [
    { zohoItemId: "A", quantity: 2 },
    { zohoItemId: "B", quantity: 1 },
    { zohoItemId: "A", quantity: 3 }, // duplicate
  ];
  const itemOrderMap = new Map<string, number>();
  const itemQtyMap = new Map<string, number>();
  for (const raw of rawItems) {
    const key = raw.zohoItemId;
    if (!itemOrderMap.has(key)) itemOrderMap.set(key, itemOrderMap.size);
    itemQtyMap.set(key, (itemQtyMap.get(key) ?? 0) + raw.quantity);
  }
  const items = [...itemOrderMap.keys()]
    .sort((a, b) => itemOrderMap.get(a)! - itemOrderMap.get(b)!)
    .map((key) => ({ zohoItemId: key, quantity: itemQtyMap.get(key)! }));
  assert.equal(items.length, 2, "doublons éliminés");
  assert.equal(items[0].zohoItemId, "A");
  assert.equal(items[0].quantity, 5, "quantités agrégées");
  assert.equal(items[1].zohoItemId, "B");
  assert.equal(items[1].quantity, 1);
});

// ── Audit fix #2 : sync-frequency renvoie la réponse sanitisée ───────────────

test("PATCH sync-frequency et order-sync-frequency retournent sanitizeIntegrationForResponse", () => {
  // Find the sync-frequency patch handler and confirm it calls sanitize
  const syncFreqIdx = routes.indexOf('"/api/shopify-integrations/:id/sync-frequency"');
  const orderFreqIdx = routes.indexOf('"/api/shopify-integrations/:id/order-sync-frequency"');
  assert.ok(syncFreqIdx > -1);
  assert.ok(orderFreqIdx > -1);

  // Extract the handler body for each route (up to the next app. definition)
  const syncHandler = routes.slice(syncFreqIdx, routes.indexOf("\n  app.", syncFreqIdx + 10));
  const orderHandler = routes.slice(orderFreqIdx, routes.indexOf("\n  app.", orderFreqIdx + 10));
  assert.match(syncHandler, /sanitizeIntegrationForResponse\(updated\)/);
  assert.match(orderHandler, /sanitizeIntegrationForResponse\(updated\)/);
});

// ── Audit fix #3 : protection de l'historique financier à la suppression ─────

test("la suppression d'un contact est rejetée si des commandes SystemD existent", () => {
  // Single delete
  const singleDelete = routes.indexOf('"/api/contacts/:id"');
  // Find the DELETE handler (not the GET ones)
  const deleteContactIdx = routes.indexOf("app.delete(\"/api/contacts/:id\"");
  assert.ok(deleteContactIdx > -1);
  const deleteHandler = routes.slice(deleteContactIdx, routes.indexOf("\n  app.", deleteContactIdx + 10));
  assert.match(deleteHandler, /getSystemdOrders\(\{ contactId: contact\.id \}\)/);
  assert.match(deleteHandler, /res\.status\(409\)/);
  assert.match(deleteHandler, /commande.*Système D|Système D.*commande/);

  // Bulk delete
  const bulkDeleteIdx = routes.indexOf("app.delete(\"/api/contacts/bulk\"");
  assert.ok(bulkDeleteIdx > -1);
  const bulkDeleteHandler = routes.slice(bulkDeleteIdx, routes.indexOf("\n  app.", bulkDeleteIdx + 10));
  assert.match(bulkDeleteHandler, /getSystemdOrders\(\{ contactId: id \}\)/);
  assert.match(bulkDeleteHandler, /res\.status\(409\)/);
});

// ── Audit fix #4 : suppression réelle des pièces jointes en mode brouillon ───

test("FileUpload retient l'id du serveur et appelle DELETE /api/form-uploads/:id", () => {
  assert.match(fileUpload, /id\?: number/);
  assert.match(fileUpload, /id: typeof data\.id === "number" \? data\.id : undefined/);
  assert.match(fileUpload, /\/api\/form-uploads\/\$\{file\.id\}/);
  assert.match(fileUpload, /method: "DELETE"/);
});

test("la route DELETE /api/form-uploads/:id supprime le fichier physique et autorise les clients sur brouillon", () => {
  const deleteRouteIdx = routes.indexOf("app.delete(\"/api/form-uploads/:id\"");
  assert.ok(deleteRouteIdx > -1);
  const deleteHandler = routes.slice(deleteRouteIdx, routes.indexOf("\n  app.", deleteRouteIdx + 10));
  // Must fetch the upload record to authorize and get path
  assert.match(deleteHandler, /storage\.getFormUpload\(uploadId\)/);
  // Client authorization: own form, draft only
  assert.match(deleteHandler, /form\.contactId !== role\.contactId/);
  assert.match(deleteHandler, /form\.status !== "draft"/);
  // Physical file deletion with path containment
  assert.match(deleteHandler, /resolvedPath\.startsWith\(resolvedDir/);
  assert.match(deleteHandler, /await fs\.promises\.unlink\(resolvedPath\)/);
  // Admin still passes without form check
  assert.match(deleteHandler, /role\.role !== "admin"/);
});

test("storage expose getFormUpload(id) pour récupérer un upload par identifiant", () => {
  assert.match(storage, /async getFormUpload\(id: number\)/);
  assert.match(storage, /db\.select\(\)\.from\(formUploads\)\.where\(eq\(formUploads\.id, id\)\)/);
});
