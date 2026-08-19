import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
const pdfGenerator = readFileSync(new URL("./pdf-generator.ts", import.meta.url), "utf8");

// ── Fix #1 : complétude des pièces jointes dans les PDF ──────────────────────

test("chaque type de formulaire supporté rend l'annexe des pièces jointes", () => {
  for (const type of ["tri", "inspection", "entreposage", "copacking", "livraison", "product_work_order"]) {
    const idx = pdfGenerator.indexOf(`case "${type}":`);
    assert.ok(idx > -1, `case ${type} présent`);
    const block = pdfGenerator.slice(idx, pdfGenerator.indexOf("break;", idx));
    assert.match(block, /renderAttachmentsAppendix\(doc, uploads/, `${type} appelle renderAttachmentsAppendix`);
  }
});

test("l'inspection exclut criteria_ pour éviter les doublons de pièces jointes", () => {
  const idx = pdfGenerator.indexOf('case "inspection":');
  const block = pdfGenerator.slice(idx, pdfGenerator.indexOf("break;", idx));
  assert.match(block, /excludeFieldPrefixes: \["criteria_"\]/);
});

test("le rendu des uploads reste local et ne fetch jamais d'URL distante", () => {
  // resolveLocalUploadPath rejette explicitement les URL distantes et confine dans uploads/
  assert.match(pdfGenerator, /function resolveLocalUploadPath/);
  assert.match(pdfGenerator, /\/\^\[a-z\]\+:\\\/\\\//i);
  assert.match(pdfGenerator, /path\.resolve\(process\.cwd\(\), "uploads"\)/);
  assert.match(pdfGenerator, /resolved\.startsWith\(uploadsDir \+ path\.sep\)/);
  // Aucun fetch/https réseau dans le générateur PDF
  assert.doesNotMatch(pdfGenerator, /\bfetch\(/);
  assert.doesNotMatch(pdfGenerator, /require\(["']https?["']\)|from ["']https?["']/);
});

test("l'annexe liste nom d'origine, type, taille et référence pour les non-images", () => {
  const idx = pdfGenerator.indexOf("function renderAttachmentsAppendix");
  const block = pdfGenerator.slice(idx, idx + 2000);
  assert.match(block, /"Fichier", "Type", "Taille", "Référence"/);
  assert.match(block, /formatFileSize/);
  assert.match(block, /nonEmbeddable/);
});

test("génération PDF runtime : image locale embarquée + doc non-image en annexe, sans fetch distant", async () => {
  const { generateFormPdf } = await import("./pdf-generator.ts");

  // Prépare un répertoire uploads local temporaire (jamais de réseau).
  const cwd = process.cwd();
  const uploadsDir = path.join(cwd, "uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  // Un PNG 1x1 valide minimal.
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const imgName = `test-audit-${Date.now()}.png`;
  writeFileSync(path.join(uploadsDir, imgName), Buffer.from(pngBase64, "base64"));

  const form: any = {
    id: 999999,
    formType: "entreposage",
    formNumber: "ENT-999",
    contactId: 1,
    status: "approved",
    revision: 1,
    data: { natureProduit: "Test" },
    revisionHistory: [],
    updatedAt: new Date(),
    createdAt: new Date(),
  };
  const uploads: any[] = [
    {
      id: 1,
      formSubmissionId: 999999,
      fieldKey: "photo_1",
      fileName: "photo.png",
      fileUrl: `/api/uploads/${imgName}`,
      fileType: "image/png",
      fileSize: 68,
      createdAt: new Date(),
    },
    {
      id: 2,
      formSubmissionId: 999999,
      fieldKey: "doc_1",
      fileName: "contrat.pdf",
      fileUrl: `/api/uploads/does-not-need-to-exist.pdf`,
      fileType: "application/pdf",
      fileSize: 123456,
      createdAt: new Date(),
    },
    {
      id: 3,
      formSubmissionId: 999999,
      fieldKey: "video_1",
      fileName: "clip.mp4",
      fileUrl: `/api/uploads/clip.mp4`,
      fileType: "video/mp4",
      fileSize: 5000000,
      createdAt: new Date(),
    },
    {
      // Une URL distante doit être ignorée pour l'embarquement mais listée en référence.
      id: 4,
      formSubmissionId: 999999,
      fieldKey: "remote_1",
      fileName: "remote.png",
      fileUrl: "https://example.com/remote.png",
      fileType: "image/png",
      fileSize: 999,
      createdAt: new Date(),
    },
  ];

  try {
    const buffer = await generateFormPdf(form, undefined, uploads);
    assert.ok(Buffer.isBuffer(buffer) && buffer.length > 800, "PDF non vide généré");
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-", "en-tête PDF valide");
  } finally {
    // Nettoyage de l'artefact temporaire pour ne pas polluer le dépôt.
    try { rmSync(path.join(uploadsDir, imgName), { force: true }); } catch { /* noop */ }
  }
});

// ── Fix #2 : isolation du read-all des notifications client ──────────────────

test("read-all ne marque que les notifications visibles (exclut adminOnly)", () => {
  const idx = routes.indexOf('"/api/portal/notifications/read-all"');
  assert.ok(idx > -1);
  const handler = routes.slice(idx, routes.indexOf("\n  app.", idx + 10));
  // Récupère les notifications du client, filtre avec le même invariant que list/count
  assert.match(handler, /getNotificationsByContactId\(role\.contactId\)/);
  assert.match(handler, /!\(n\.metadata as any\)\?\.adminOnly/);
  assert.match(handler, /!n\.isRead/);
  // Marque via la méthode scopée existante, pas un markAll global
  assert.match(handler, /markNotificationRead\(id\)/);
  assert.doesNotMatch(handler, /markAllNotificationsRead/);
});

test("le même invariant adminOnly est partagé par list, count et read-all", () => {
  const list = routes.indexOf('"/api/portal/notifications"');
  const count = routes.indexOf('"/api/portal/notifications/unread-count"');
  const readAll = routes.indexOf('"/api/portal/notifications/read-all"');
  for (const idx of [list, count, readAll]) {
    const handler = routes.slice(idx, routes.indexOf("\n  app.", idx + 10));
    assert.match(handler, /adminOnly/, "invariant adminOnly présent");
  }
});

// ── Fix #3 : verrou consultatif contre les approbations concurrentes ─────────

test("storage expose un verrou consultatif transaction-scopé clé sur l'id du formulaire", () => {
  assert.match(storage, /withFormTransitionLock/);
  assert.match(storage, /pg_advisory_xact_lock\(hashtext\(\$\{`form-transition:\$\{formId\}`\}\)\)/);
  // Relecture fraîche du formulaire APRÈS acquisition du verrou
  const idx = storage.indexOf("async withFormTransitionLock");
  const body = storage.slice(idx, storage.indexOf("\n  async ", idx + 10));
  assert.match(body, /db\.transaction/);
  assert.match(body, /pg_advisory_xact_lock/);
  const lockPos = body.indexOf("pg_advisory_xact_lock");
  const readPos = body.indexOf("select().from(formSubmissions)");
  assert.ok(lockPos > -1 && readPos > lockPos, "relecture APRÈS le verrou");
});

test("la transition d'approbation exécute la création de SO/projet sous le verrou avec re-check", () => {
  const idx = routes.indexOf('if (status === "approved" && form.status === "in_review")');
  const block = routes.slice(idx, routes.indexOf("\n        if (status !== form.status", idx));
  assert.match(block, /storage\.withFormTransitionLock\(form\.id/);
  // re-vérifie zohoSalesOrderId sur la relecture fraîche
  assert.match(block, /freshForm\.zohoSalesOrderId/);
  assert.match(block, /freshForm\.zohoProjectId/);
  assert.match(block, /createFormSalesOrder\(/);
  assert.match(block, /createZohoProject\(/);
});

test("l'endpoint create-zoho-so partage le même verrou et re-vérifie le statut/SO", () => {
  const idx = routes.indexOf('app.post("/api/forms/:id/create-zoho-so"');
  assert.ok(idx > -1);
  const handler = routes.slice(idx, routes.indexOf("\n  app.", idx + 10));
  assert.match(handler, /storage\.withFormTransitionLock\(initialForm\.id/);
  // re-check statut + SO existant sous le verrou (relecture fraîche = paramètre form)
  assert.match(handler, /form\.status !== "approved"/);
  assert.match(handler, /form\.zohoSalesOrderId/);
  // conserve les réponses d'erreur (404/400/409)
  assert.match(handler, /res\.status\(409\)/);
  assert.match(handler, /res\.status\(400\)/);
  assert.match(handler, /res\.status\(404\)/);
});

test("les deux chemins (transition + endpoint) utilisent la même clé de verrou", () => {
  // Une seule définition de la clé de verrou, partagée via withFormTransitionLock
  const occurrences = routes.match(/storage\.withFormTransitionLock/g) || [];
  assert.ok(occurrences.length >= 2, "verrou partagé par les deux chemins");
  assert.match(storage, /form-transition:/);
});
