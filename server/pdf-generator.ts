import PDFDocument from "pdfkit";
import type { FormSubmission, Contact, FormUpload } from "@shared/schema";
import fs from "fs";
import path from "path";

const BRAND_COLOR = "#1a1a2e";
const ACCENT_COLOR = "#16213e";
const LIGHT_GRAY = "#f0f0f0";
const MEDIUM_GRAY = "#666666";
const TABLE_BORDER = "#cccccc";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Complété",
};

const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Informations globales du TRI",
  inspection: "Instructions d'inspection / Tri / Rework",
  copacking: "Bon de travail / Co-packing",
  livraison: "Formulaire de livraison",
};

function addHeader(doc: PDFKit.PDFDocument, form: FormSubmission, contact?: Contact) {
  doc.rect(0, 0, doc.page.width, 80).fill(BRAND_COLOR);

  doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold")
    .text("SYSTÈME-D", 50, 20, { width: 300 });
  doc.fontSize(9).fillColor("#aaaacc").font("Helvetica")
    .text("Entreposage & Logistique", 50, 48);

  doc.fontSize(14).fillColor("#ffffff").font("Helvetica-Bold")
    .text(form.formNumber, doc.page.width - 200, 20, { width: 150, align: "right" });
  doc.fontSize(9).fillColor("#aaaacc").font("Helvetica")
    .text(STATUS_LABELS[form.status] || form.status, doc.page.width - 200, 42, { width: 150, align: "right" });
  doc.fontSize(8).fillColor("#aaaacc")
    .text(`Rév. ${form.revision}`, doc.page.width - 200, 56, { width: 150, align: "right" });

  doc.fillColor("#333333");
  doc.y = 95;

  doc.fontSize(13).font("Helvetica-Bold").fillColor(ACCENT_COLOR)
    .text(FORM_TYPE_LABELS[form.formType] || form.formType, 50, 95);

  let metaY = 115;
  doc.fontSize(9).font("Helvetica").fillColor(MEDIUM_GRAY);
  if (contact) {
    doc.text(`Client: ${contact.name}${contact.companyName ? ` — ${contact.companyName}` : ""}`, 50, metaY);
    metaY += 14;
  }
  const dateStr = form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("fr-CA") : new Date().toLocaleDateString("fr-CA");
  doc.text(`Date: ${dateStr}`, 50, metaY);
  metaY += 14;
  if (form.submittedByName) {
    doc.text(`Soumis par: ${form.submittedByName}`, 50, metaY);
    metaY += 14;
  }

  doc.moveTo(50, metaY + 4).lineTo(doc.page.width - 50, metaY + 4).strokeColor(TABLE_BORDER).lineWidth(0.5).stroke();
  doc.y = metaY + 14;
}

function addFooter(doc: PDFKit.PDFDocument, form: FormSubmission) {
  const pages = (doc as any).bufferedPageRange?.();
  const pageCount = pages ? pages.count : 1;

  doc.on("pageAdded", () => {
    const bottom = doc.page.height - 30;
    doc.fontSize(7).fillColor(MEDIUM_GRAY).font("Helvetica");
    doc.text(`${form.formNumber}  •  Rév. ${form.revision}`, 50, bottom, { width: doc.page.width - 100, align: "left" });
    doc.text("Système-D  •  Confidentiel", 50, bottom, { width: doc.page.width - 100, align: "right" });
  });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  checkPageBreak(doc, 30);
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(ACCENT_COLOR).text(title, 50);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor(ACCENT_COLOR).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

function fieldRow(doc: PDFKit.PDFDocument, label: string, value: string | number | boolean | null | undefined, options?: { indent?: number }) {
  checkPageBreak(doc, 16);
  const x = options?.indent || 50;
  const valStr = value === true ? "Oui" : value === false ? "Non" : (value != null && value !== "" ? String(value) : "—");
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text(`${label}: `, x, doc.y, { continued: true });
  doc.font("Helvetica").fillColor("#555555").text(valStr);
}

function checkPageBreak(doc: PDFKit.PDFDocument, requiredSpace: number) {
  if (doc.y + requiredSpace > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], colWidths: number[]) {
  const startX = 50;
  const cellPadding = 4;
  const rowHeight = 16;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  checkPageBreak(doc, rowHeight * 2 + 10);

  const headerY = doc.y;
  doc.rect(startX, headerY, tableWidth, rowHeight).fill(BRAND_COLOR);
  let xPos = startX;
  doc.fontSize(7).font("Helvetica-Bold").fillColor("#ffffff");
  headers.forEach((h, i) => {
    doc.text(h, xPos + cellPadding, headerY + cellPadding, { width: colWidths[i] - cellPadding * 2 });
    xPos += colWidths[i];
  });
  doc.y = headerY + rowHeight;
  let currentY = doc.y;

  rows.forEach((row, rowIdx) => {
    checkPageBreak(doc, rowHeight + 2);
    currentY = doc.y;
    if (rowIdx % 2 === 0) {
      doc.rect(startX, currentY, tableWidth, rowHeight).fill(LIGHT_GRAY);
    }
    xPos = startX;
    doc.fontSize(7).font("Helvetica").fillColor("#333333");
    row.forEach((cell, i) => {
      doc.text(cell || "—", xPos + cellPadding, currentY + cellPadding, { width: colWidths[i] - cellPadding * 2 });
      xPos += colWidths[i];
    });
    doc.y = currentY + rowHeight;
  });

  doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).strokeColor(TABLE_BORDER).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function renderTriForm(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  sectionTitle(doc, "Informations générales");
  fieldRow(doc, "Client", data.client);
  fieldRow(doc, "Sous-traitant", data.sousTraitant);
  fieldRow(doc, "Nom du projet", data.nomProjet);
  fieldRow(doc, "Code pièce", data.codePiece);
  fieldRow(doc, "Description", data.description);
  fieldRow(doc, "N° Instructions", data.instructionsNumero);
  fieldRow(doc, "Type de tri", data.typeTri === "nouveau" ? "Nouveau" : data.typeTri === "existant" ? "Existant" : data.typeTri);

  if (data.ncReferences?.length > 0 && data.ncReferences.some((r: string) => r)) {
    sectionTitle(doc, "Références NC");
    data.ncReferences.filter((r: string) => r).forEach((ref: string, i: number) => {
      fieldRow(doc, `Réf. ${i + 1}`, ref);
    });
  }

  if (data.ncItems?.length > 0 && data.ncItems.some((item: any) => item.description)) {
    sectionTitle(doc, "Items non conformes");
    data.ncItems.filter((item: any) => item.description).forEach((item: any, i: number) => {
      fieldRow(doc, `Item ${i + 1}`, item.description);
    });
  }

  sectionTitle(doc, "Paramètres de tri");
  fieldRow(doc, "Méthode de tri", data.methodeTri);
  fieldRow(doc, "Outils requis", data.outils);
  fieldRow(doc, "Unité par boîte", data.uniteParBoite);
  fieldRow(doc, "Besoin quotidien", data.besoinQuotidien);
  fieldRow(doc, "Cycle de tri", data.cycleTri);
  fieldRow(doc, "Type de cycle", data.cycleTriType);
  fieldRow(doc, "Langue échangée", data.langueEchangee);

  if (data.contacts?.length > 0 && data.contacts.some((c: any) => c.nom)) {
    sectionTitle(doc, "Contacts");
    const contactRows = data.contacts.filter((c: any) => c.nom).map((c: any) => [c.nom, c.email, c.role]);
    drawTable(doc, ["Nom", "Email", "Rôle"], contactRows, [160, 200, 100]);
  }
}

function renderInspectionForm(doc: PDFKit.PDFDocument, data: Record<string, any>, uploads: FormUpload[]) {
  sectionTitle(doc, "En-tête");
  fieldRow(doc, "Instruction de travail", data.workInstruction);
  fieldRow(doc, "Client", data.customer);
  fieldRow(doc, "N° Pièce", data.partNumber);
  fieldRow(doc, "Nom pièce", data.partName);
  fieldRow(doc, "Révision", data.revision);

  sectionTitle(doc, "Contrôle");
  fieldRow(doc, "Échantillon de contrôle", data.controlSample);
  if (data.controlSample === "custom") {
    fieldRow(doc, "Pourcentage", data.customSamplePercent);
  }
  if (data.controlMethod?.length) {
    fieldRow(doc, "Méthode de contrôle", data.controlMethod.join(", "));
  }
  fieldRow(doc, "Outil de retouche", data.reworkTool);

  sectionTitle(doc, "Description");
  fieldRow(doc, "Description inspection", data.inspectionDescription);
  fieldRow(doc, "Description retouche", data.reworkDescription);
  fieldRow(doc, "Liste d'outils", data.toolList);
  if (data.ppe?.length) {
    fieldRow(doc, "EPI", data.ppe.join(", "));
    if (data.ppeOther) fieldRow(doc, "EPI autre", data.ppeOther);
  }
  fieldRow(doc, "Référence documentation", data.documentationReference);

  if (data.criteria?.length > 0) {
    sectionTitle(doc, "Critères d'inspection");
    data.criteria.forEach((c: any, i: number) => {
      if (!c.active) return;
      checkPageBreak(doc, 60);
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(ACCENT_COLOR)
        .text(`Critère ${i + 1}: ${c.processTitle || "Sans titre"}`, 50);
      fieldRow(doc, "Description du processus", c.processDescription);
      fieldRow(doc, "Description non conforme", c.nonCompliantDescription);
      fieldRow(doc, "Description conforme", c.compliantDescription);

      const criteriaUploads = uploads.filter(u => u.fieldKey.startsWith(`criteria_${i}_`));
      if (criteriaUploads.length > 0) {
        criteriaUploads.forEach(upload => {
          const ext = path.extname(upload.fileName).toLowerCase();
          if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            try {
              const filename = upload.fileUrl.split('/').pop();
              const filePath = path.join(process.cwd(), 'uploads', filename || '');
              if (fs.existsSync(filePath)) {
                checkPageBreak(doc, 120);
                doc.image(filePath, 60, doc.y, { width: 150, height: 100 });
                doc.y += 105;
                doc.fontSize(7).fillColor(MEDIUM_GRAY).text(upload.fileName, 60);
              }
            } catch {
            }
          }
        });
      }
    });
  }

  sectionTitle(doc, "Approbations");
  fieldRow(doc, "Système-D — Nom", data.approvalSystemeDName);
  fieldRow(doc, "Système-D — Date", data.approvalSystemeDDate);
  fieldRow(doc, "Client — Nom", data.approvalCustomerName);
  fieldRow(doc, "Client — Date", data.approvalCustomerDate);
}

function renderEntreposageForm(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  sectionTitle(doc, "Section A — Produit");
  fieldRow(doc, "Nature du produit", data.natureProduit);
  fieldRow(doc, "Dimensions", `${data.longueur || "—"} × ${data.largeur || "—"} × ${data.hauteur || "—"} ${data.uniteDimension || ""}`);
  fieldRow(doc, "Poids", `${data.poids || "—"} ${data.unitePoids || ""}`);
  fieldRow(doc, "Type d'emballage", data.typeEmballage);

  if (data.typeEmballage === "palette") {
    fieldRow(doc, "Dimensions palette", data.paletteDimensions, { indent: 70 });
    fieldRow(doc, "Nb unités/palette", data.paletteNbUnites, { indent: 70 });
    fieldRow(doc, "Hauteur palette", data.paletteHauteur, { indent: 70 });
    fieldRow(doc, "Type palette", data.paletteType, { indent: 70 });
  } else if (data.typeEmballage === "boite") {
    fieldRow(doc, "Format boîte", data.boiteFormat, { indent: 70 });
    fieldRow(doc, "Nb unités/boîte", data.boiteNbUnites, { indent: 70 });
  } else if (data.typeEmballage === "vrac") {
    fieldRow(doc, "Description vrac", data.vracDescription, { indent: 70 });
  } else if (data.typeEmballage === "sac") {
    fieldRow(doc, "Format sac", data.sacFormat, { indent: 70 });
    fieldRow(doc, "Nb unités/sac", data.sacNbUnites, { indent: 70 });
  }

  fieldRow(doc, "Bin / Rack", data.hasBinRack);
  if (data.hasBinRack) {
    if (data.binSize) fieldRow(doc, "Taille Bin", data.binSize, { indent: 70 });
    if (data.rackSize) fieldRow(doc, "Taille Rack", data.rackSize, { indent: 70 });
  }

  sectionTitle(doc, "Section B — Livraison & Services");
  fieldRow(doc, "Service de livraison", data.hasLivraison);
  if (data.typeMarchandise?.length) {
    fieldRow(doc, "Type de marchandise", data.typeMarchandise.join(", "));
  }
  fieldRow(doc, "Type de destination", data.destinationType === "local" ? "Local" : data.destinationType === "longue_distance" ? "Longue distance" : data.destinationType);
  if (data.destinationType === "longue_distance") {
    fieldRow(doc, "Hayon élévateur", data.hasTailgate);
  }
  fieldRow(doc, "Rendez-vous", data.hasRendezVous);
  if (data.hasRendezVous) {
    fieldRow(doc, "Date RV", data.rvDate, { indent: 70 });
    fieldRow(doc, "Heure RV", data.rvTime, { indent: 70 });
  }

  if (data.adresses?.length > 0 && data.adresses.some((a: any) => a.adresse)) {
    sectionTitle(doc, "Adresses");
    data.adresses.filter((a: any) => a.adresse).forEach((a: any, i: number) => {
      fieldRow(doc, `Adresse ${i + 1}`, a.adresse);
      if (a.notes) fieldRow(doc, "Notes", a.notes, { indent: 70 });
    });
  }

  fieldRow(doc, "Mode de facturation", data.modeBilling === "forfaitaire" ? "Forfaitaire" : data.modeBilling === "horaire" ? "Horaire" : data.modeBilling);
  if (data.documentation?.length) {
    fieldRow(doc, "Documentation", data.documentation.join(", "));
  }
  fieldRow(doc, "Conditionnement", data.hasConditionnement);
  if (data.hasConditionnement && data.conditionnementDescription) {
    fieldRow(doc, "Description", data.conditionnementDescription, { indent: 70 });
  }
  fieldRow(doc, "Kitting", data.hasKitting);
  if (data.hasKitting && data.kittingDescription) {
    fieldRow(doc, "Description", data.kittingDescription, { indent: 70 });
  }
  if (data.notes) {
    fieldRow(doc, "Notes", data.notes);
  }
}

function renderTimeTrackingRows(doc: PDFKit.PDFDocument, title: string, rows: any[]) {
  if (!rows?.length) return;
  const validRows = rows.filter((r: any) => r.date || r.debut || r.fin);
  if (validRows.length === 0) return;

  doc.moveDown(0.3);
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text(title, 50);
  doc.moveDown(0.2);

  const headers = ["Date", "Début", "Fin", "Nb gens", "Noms", "Qté", "Total h"];
  const tableRows = validRows.map((r: any) => [
    r.date || "",
    r.debut || "",
    r.fin || "",
    r.nbGens || "",
    r.noms || "",
    r.qte || "",
    typeof r.totalHeure === "number" ? r.totalHeure.toFixed(2) : "0.00",
  ]);
  drawTable(doc, headers, tableRows, [70, 50, 50, 45, 100, 50, 50]);

  const totalSum = validRows.reduce((sum: number, r: any) => sum + (typeof r.totalHeure === "number" ? r.totalHeure : 0), 0);
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#333333")
    .text(`Total: ${totalSum.toFixed(2)} heures`, 50, doc.y, { align: "right", width: doc.page.width - 100 });
  doc.moveDown(0.3);
}

function renderCopackingForm(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  sectionTitle(doc, "Informations générales");
  fieldRow(doc, "Client", data.client);
  fieldRow(doc, "Projet", data.projet);
  fieldRow(doc, "Date bon de travail", data.dateBonTravail);
  fieldRow(doc, "Référence", data.reference);

  sectionTitle(doc, "1. Détaillée — Vérification");
  renderTimeTrackingRows(doc, "Vérification GAP", data.gapVerificationRows);
  renderTimeTrackingRows(doc, "Approbation photos", data.photoApprovalRows);
  renderTimeTrackingRows(doc, "Préparation montage", data.montagePrepRows);

  fieldRow(doc, "Type de palette", data.paletteType);
  fieldRow(doc, "Nb palettes", data.paletteNb);
  fieldRow(doc, "Description matériaux", data.materiauxDescription);
  fieldRow(doc, "Matériaux disponibles", data.materiauxDisponible);

  sectionTitle(doc, "Performance");
  fieldRow(doc, "Qté totale", data.performanceQteTotal);
  fieldRow(doc, "Qté conforme", data.performanceQteConforme);
  fieldRow(doc, "Qté NC", data.performanceQteNC);

  sectionTitle(doc, "2. Montage");
  renderTimeTrackingRows(doc, "Suivi de temps — Montage", data.montageRows);
  if (data.montageComments) {
    fieldRow(doc, "Commentaires", data.montageComments);
  }

  if (data.workBlocks?.length > 0) {
    sectionTitle(doc, "3. Ajout — Blocs de travail");
    data.workBlocks.forEach((block: any, i: number) => {
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text(`Bloc ${i + 1}: ${block.description || "—"}`, 50);
      renderTimeTrackingRows(doc, "", block.rows);
    });
  }

  sectionTitle(doc, "4. Express Global");

  if (data.picksAvecFacture?.length > 0) {
    const validPicks = data.picksAvecFacture.filter((p: any) => p.date || p.nbPicks || p.nbItems);
    if (validPicks.length > 0) {
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text("Picks avec facture", 50);
      const pickHeaders = ["Date", "Nb Picks", "Nb Items"];
      const pickRows = validPicks.map((p: any) => [p.date || "", p.nbPicks || "", p.nbItems || ""]);
      drawTable(doc, pickHeaders, pickRows, [150, 130, 130]);
      const totalPicks = validPicks.reduce((s: number, p: any) => s + (parseInt(p.nbPicks) || 0), 0);
      const totalItems = validPicks.reduce((s: number, p: any) => s + (parseInt(p.nbItems) || 0), 0);
      doc.fontSize(8).font("Helvetica-Bold").text(`Total: ${totalPicks} picks, ${totalItems} items`, 50);
      doc.moveDown(0.3);
    }
  }

  if (data.picksSansFacture?.length > 0) {
    const validPicks = data.picksSansFacture.filter((p: any) => p.date || p.nbPicks || p.nbItems);
    if (validPicks.length > 0) {
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text("Picks sans facture", 50);
      const pickHeaders = ["Date", "Nb Picks", "Nb Items"];
      const pickRows = validPicks.map((p: any) => [p.date || "", p.nbPicks || "", p.nbItems || ""]);
      drawTable(doc, pickHeaders, pickRows, [150, 130, 130]);
      const totalPicks = validPicks.reduce((s: number, p: any) => s + (parseInt(p.nbPicks) || 0), 0);
      const totalItems = validPicks.reduce((s: number, p: any) => s + (parseInt(p.nbItems) || 0), 0);
      doc.fontSize(8).font("Helvetica-Bold").text(`Total: ${totalPicks} picks, ${totalItems} items`, 50);
      doc.moveDown(0.3);
    }
  }

  if (data.packerRows?.length > 0) {
    const validPackers = data.packerRows.filter((p: any) => p.nom || p.date);
    if (validPackers.length > 0) {
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333").text("Packers", 50);
      const packerHeaders = ["Date", "Nom", "Début", "Fin", "Total h", "Montages", "Rendement"];
      const packerTableRows = validPackers.map((p: any) => [
        p.date || "", p.nom || "", p.debut || "", p.fin || "",
        typeof p.totalHeure === "number" ? p.totalHeure.toFixed(2) : "0",
        p.montages || "",
        typeof p.rendement === "number" ? p.rendement.toFixed(2) : "0",
      ]);
      drawTable(doc, packerHeaders, packerTableRows, [60, 80, 45, 45, 45, 55, 55]);
    }
  }

  if (data.dailyLogs?.length > 0) {
    const validLogs = data.dailyLogs.filter((l: any) => l.nom || l.date);
    if (validLogs.length > 0) {
      sectionTitle(doc, "5. Express Individuel — Journal");
      const logHeaders = ["Date", "Nom", "Début", "Fin", "Montages"];
      const logRows = validLogs.map((l: any) => [l.date || "", l.nom || "", l.debut || "", l.fin || "", l.montages || ""]);
      drawTable(doc, logHeaders, logRows, [80, 100, 70, 70, 80]);
    }
  }
}

function renderLivraisonForm(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  sectionTitle(doc, "Marchandise");
  fieldRow(doc, "Type de marchandise", data.typeMarchandise);
  fieldRow(doc, "Nombre d'unités", data.nbUnites);
  fieldRow(doc, "Poids total", `${data.poidsTotal || "—"} ${data.unitePoids || ""}`);
  fieldRow(doc, "Référence", data.reference);

  sectionTitle(doc, "Destination");
  fieldRow(doc, "Type de destination", data.destinationType === "local" ? "Local" : data.destinationType === "longue_distance" ? "Longue distance" : data.destinationType);
  if (data.destinationType === "longue_distance") {
    fieldRow(doc, "Hayon élévateur", data.hasTailgate);
  }
  fieldRow(doc, "Rendez-vous", data.hasRendezVous);
  if (data.hasRendezVous) {
    fieldRow(doc, "Date RV", data.rvDate, { indent: 70 });
    fieldRow(doc, "Heure RV", data.rvTime, { indent: 70 });
  }

  if (data.destinations?.length > 0 && data.destinations.some((d: any) => d.adresse)) {
    sectionTitle(doc, "Destinations");
    data.destinations.filter((d: any) => d.adresse).forEach((dest: any, i: number) => {
      fieldRow(doc, `Destination ${i + 1}`, dest.adresse);
      if (dest.contact) fieldRow(doc, "Contact", dest.contact, { indent: 70 });
      if (dest.telephone) fieldRow(doc, "Téléphone", dest.telephone, { indent: 70 });
      if (dest.notes) fieldRow(doc, "Notes", dest.notes, { indent: 70 });
    });
  }

  sectionTitle(doc, "Facturation & Documentation");
  fieldRow(doc, "Mode de facturation", data.modeBilling === "forfaitaire" ? "Forfaitaire" : data.modeBilling === "horaire" ? "Horaire" : data.modeBilling);
  if (data.documentation?.length) {
    fieldRow(doc, "Documentation", data.documentation.join(", "));
  }
  if (data.instructionsSpeciales) {
    fieldRow(doc, "Instructions spéciales", data.instructionsSpeciales);
  }
}

function renderRevisionHistory(doc: PDFKit.PDFDocument, history: any[]) {
  if (!history?.length) return;

  // Estimate total space needed for the entire section so we can decide
  // whether to move it entirely to a new page rather than splitting it
  // and leaving a near-empty last page with only a few rows.
  const ROW_H = 25;
  const SECTION_TITLE_H = 36;
  const TABLE_HEADER_H = ROW_H + 10;
  const estimatedHeight = SECTION_TITLE_H + TABLE_HEADER_H + history.length * (ROW_H + 2);
  const availableSpace = doc.page.height - 60 - doc.y; // threshold is height - 60

  // If the full section doesn't fit on the remaining page, start a fresh page upfront.
  // This prevents a situation where the title renders at the bottom of a page and
  // only 1–2 table rows appear before a page break, leaving the last page mostly empty.
  if (availableSpace < estimatedHeight) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  sectionTitle(doc, "Historique des révisions");
  const headers = ["Rév.", "Date", "Description", "Par"];
  const rows = history.map((h: any) => [
    String(h.rev || ""),
    h.date ? new Date(h.date).toLocaleDateString("fr-CA") : "",
    h.description || "",
    h.modifiedBy || "",
  ]);
  drawTable(doc, headers, rows, [40, 80, 220, 100]);
}

export function generateFormPdf(
  form: FormSubmission,
  contact: Contact | undefined,
  uploads: FormUpload[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `${form.formNumber} — ${FORM_TYPE_LABELS[form.formType] || form.formType}`,
        Author: "Système-D",
        Subject: form.formNumber,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    addHeader(doc, form, contact);

    let data: Record<string, any> = {};
    try {
      data = (typeof form.data === "string" ? JSON.parse(form.data) : form.data) as Record<string, any> || {};
    } catch {
      console.error(`Failed to parse form data for ${form.formNumber}`);
    }

    switch (form.formType) {
      case "tri":
        renderTriForm(doc, data);
        break;
      case "inspection":
        renderInspectionForm(doc, data, uploads);
        break;
      case "entreposage":
        renderEntreposageForm(doc, data);
        break;
      case "copacking":
        renderCopackingForm(doc, data);
        break;
      case "livraison":
        renderLivraisonForm(doc, data);
        break;
    }

    const history = Array.isArray(form.revisionHistory) ? form.revisionHistory : [];
    renderRevisionHistory(doc, history as any[]);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Placer le pied de page dans la zone des marges (bottom margin = 50pt)
      // On utilise height - 40 pour rester dans les marges et éviter qu'une
      // page blanche soit générée par PDFKit quand doc.y dépasse la marge basse.
      const bottom = doc.page.height - 40;
      doc.fontSize(7).fillColor(MEDIUM_GRAY).font("Helvetica");
      doc.text(`${form.formNumber}  •  Rév. ${form.revision}`, 50, bottom, { width: 200, align: "left", lineBreak: false });
      doc.text(`Page ${i + 1} / ${range.count}`, doc.page.width - 150, bottom, { width: 100, align: "right", lineBreak: false });
      doc.text("Système-D  •  Confidentiel", 50, bottom, { width: doc.page.width - 100, align: "center", lineBreak: false });
    }

    // Revenir à la dernière page et repositionner le curseur juste au-dessus
    // de la zone de footer pour éviter que PDFKit n'ajoute une page blanche
    // au moment de doc.end() si doc.y dépasse la marge basse.
    // On utilise height - margins.bottom - 20 (= 722 sur LETTER) plutôt que
    // margins.top (= 50) pour exprimer "le contenu est terminé près du bas".
    doc.switchToPage(range.start + range.count - 1);
    (doc as any).y = doc.page.height - doc.page.margins.bottom - 20;

    doc.end();
  });
}
