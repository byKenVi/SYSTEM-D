/**
 * Zoho Projects API client
 *
 * Réutilise les tokens OAuth de Zoho Inventory (même app OAuth, scopes étendus).
 * Scopes requis : ZohoProjects.portals.READ, ZohoProjects.projects.CREATE,
 *                 ZohoProjects.projects.READ
 *
 * IMPORTANT : après ajout des scopes dans zoho-auth.ts, une reconnexion Zoho
 * est nécessaire depuis Paramètres → Zoho Inventory pour autoriser Zoho Projects.
 */

import { getValidAccessToken } from "./zoho-auth";
import { storage } from "./storage";

// ── Regional base URLs for Zoho Projects API ─────────────────────────────────
const PROJECTS_BASE: Record<string, string> = {
  us: "https://projectsapi.zoho.com/restapi",
  eu: "https://projectsapi.zoho.eu/restapi",
  in: "https://projectsapi.zoho.in/restapi",
  au: "https://projectsapi.zoho.com.au/restapi",
  jp: "https://projectsapi.zoho.jp/restapi",
  ca: "https://projectsapi.zohocloud.ca/restapi",
};

function getProjectsBaseUrl(region = "us"): string {
  return PROJECTS_BASE[region] || PROJECTS_BASE.us;
}

export interface ZohoPortal {
  id: string;
  name: string;
  id_string: string;
  role: string;
}

export interface ZohoProject {
  id: string;
  name: string;
  link?: { self?: { url?: string } };
}

// ── Fetch all portals accessible with the current token ───────────────────────
export async function getZohoProjectsPortals(): Promise<ZohoPortal[]> {
  const settings = await storage.getAdminSettings();
  const region = settings?.zohoRegion || "us";
  const baseUrl = getProjectsBaseUrl(region);

  const token = await getValidAccessToken();
  const res = await fetch(`${baseUrl}/portals/`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoho Projects portals error ${res.status}: ${body}`);
  }

  const data = await res.json();
  // Zoho returns { login_id, portals: [...] }
  return (data.portals || []) as ZohoPortal[];
}

// ── Create a project inside a given portal ────────────────────────────────────
export async function createZohoProject(
  portalId: string,
  payload: {
    name: string;
    description?: string;
  }
): Promise<ZohoProject> {
  const settings = await storage.getAdminSettings();
  const region = settings?.zohoRegion || "us";
  const baseUrl = getProjectsBaseUrl(region);

  const token = await getValidAccessToken();

  const body = new URLSearchParams({ name: payload.name });
  if (payload.description) body.set("description", payload.description);

  const res = await fetch(`${baseUrl}/portal/${portalId}/projects/`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Zoho Projects create error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const project = data.projects?.[0];
  if (!project) throw new Error("Zoho Projects API returned no project in response");
  return project as ZohoProject;
}

// ── Labels for form types ─────────────────────────────────────────────────────
const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "TRI",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

// ── Build project payload from a form submission ──────────────────────────────
export function buildProjectPayload(
  form: {
    formNumber: string;
    formType: string;
    data: unknown;
    price?: string | number | null;
    approvedQuantity?: string | number | null;
    zohoSalesOrderNumber?: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  },
  contact: { name: string; email?: string | null; companyName?: string | null },
  appDomain: string
): { name: string; description: string } {
  const typeLabel = FORM_TYPE_LABELS[form.formType] || form.formType;
  const name = `${typeLabel} ${form.formNumber} — ${contact.name}`;

  const lines: string[] = [
    `Numéro de commande : ${form.formNumber}`,
    `Type de service    : ${typeLabel}`,
    `Client             : ${contact.name}${contact.companyName ? ` — ${contact.companyName}` : ""}`,
  ];
  if (contact.email) lines.push(`Courriel           : ${contact.email}`);

  const dateStr = form.updatedAt
    ? new Date(form.updatedAt).toLocaleDateString("fr-CA")
    : form.createdAt
    ? new Date(form.createdAt).toLocaleDateString("fr-CA")
    : new Date().toLocaleDateString("fr-CA");
  lines.push(`Date approuvée     : ${dateStr}`);

  if (form.price != null && Number(form.price) > 0) {
    lines.push(
      `Montant approuvé   : ${Number(form.price).toLocaleString("fr-CA", { minimumFractionDigits: 2 })} $`
    );
  }
  if (form.approvedQuantity != null && Number(form.approvedQuantity) > 0) {
    lines.push(`Quantité approuvée : ${Number(form.approvedQuantity).toLocaleString("fr-CA")} unités`);
  }
  if (form.zohoSalesOrderNumber) {
    lines.push(`Bon de commande Zoho : ${form.zohoSalesOrderNumber}`);
  }

  // Extract key fields from JSONB data
  const data = (form.data as Record<string, any>) || {};
  const extraFields: string[] = [];
  if (data.client) extraFields.push(`Client formulaire  : ${data.client}`);
  if (data.projet) extraFields.push(`Projet             : ${data.projet}`);
  if (data.reference) extraFields.push(`Référence          : ${data.reference}`);
  if (data.nomProjet) extraFields.push(`Nom du projet      : ${data.nomProjet}`);
  if (data.codePiece) extraFields.push(`Code pièce         : ${data.codePiece}`);
  if (data.workInstruction) extraFields.push(`Instruction travail: ${data.workInstruction}`);
  if (extraFields.length > 0) lines.push("", ...extraFields);

  lines.push(``, `Lien interne : ${appDomain}/admin/forms/`);

  return { name, description: lines.join("\n") };
}
