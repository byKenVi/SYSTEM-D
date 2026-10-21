/**
 * Zoho CRM API — "devis" du pipeline (module Deals / Opportunités).
 *
 * Réutilise les tokens OAuth de Zoho Inventory (même app OAuth, scopes étendus).
 * Scopes requis : ZohoCRM.modules.ALL, ZohoCRM.settings.fields.READ
 *
 * IMPORTANT : après ajout des scopes dans zoho-auth.ts, une reconnexion Zoho
 * est nécessaire depuis Paramètres → Zoho Inventory pour autoriser le CRM.
 */

import { getValidAccessToken, getZohoDomains, refreshAccessToken } from "./zoho-auth";
import { getZohoRegion } from "./zoho-api";

// Domaines web du CRM (pour construire des liens cliquables vers un devis).
const CRM_WEB_DOMAINS: Record<string, string> = {
  us: "crm.zoho.com",
  eu: "crm.zoho.eu",
  in: "crm.zoho.in",
  au: "crm.zoho.com.au",
  jp: "crm.zoho.jp",
  ca: "crm.zohocloud.ca",
};

// ── Cible CRM configurable (sans redeploy) ───────────────────────────────────
// Le module "Pipelines" affiché dans le CRM est l'étiquette du module dont le
// nom API reste "Deals". Si l'org utilise un nom API différent, le surcharger ici.
/** Nom API du module (par défaut "Deals"; l'org SystemD peut l'afficher "Pipelines"). */
export const ORDER_DEAL_MODULE = process.env.ZOHO_CRM_ORDER_MODULE || "Deals";
/** Pipeline (layout) cible si multi-pipelines; vide = pipeline par défaut. */
export const ORDER_DEAL_PIPELINE = process.env.ZOHO_CRM_ORDER_PIPELINE || "";
/** Étape où atterrissent les commandes. */
export const ORDER_DEAL_STAGE = process.env.ZOHO_CRM_ORDER_STAGE || "Commande reçue";

export class CrmError extends Error {
  constructor(message: string, readonly scopeIssue = false) {
    super(message);
    this.name = "CrmError";
  }
}

function crmApiBase(region: string): string {
  const { api } = getZohoDomains(region);
  return `https://${api}/crm/v7`;
}

export function getCrmDealUrl(region: string, dealId: string): string {
  const domain = CRM_WEB_DOMAINS[region] || CRM_WEB_DOMAINS.us;
  // Deep link vers l'enregistrement. Le module Deals utilise l'onglet legacy
  // "Potentials"; pour un module custom on retombe sur son nom API.
  const tab = ORDER_DEAL_MODULE === "Deals" ? "Potentials" : ORDER_DEAL_MODULE;
  return `https://${domain}/crm/tab/${tab}/${dealId}`;
}

function isScopeError(status: number, body: any): boolean {
  if (status === 401 || status === 403) return true;
  const code = body?.code ?? body?.data?.[0]?.code;
  return code === "OAUTH_SCOPE_MISMATCH" || code === "INVALID_TOKEN" || String(code).includes("SCOPE");
}

/**
 * Requête JSON vers le CRM avec un seul retry de refresh de token.
 * Les erreurs de scope ne sont PAS retentées (un refresh ne les corrige pas).
 */
async function crmRequest(
  method: string,
  path: string,
  body: unknown,
  region: string,
): Promise<any> {
  const base = crmApiBase(region);
  const buildOptions = (token: string): RequestInit => ({
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let token = await getValidAccessToken(region);
  let response = await fetch(`${base}${path}`, buildOptions(token));
  let data = await response.json().catch(() => ({}));

  // 401 sans mismatch de scope => token expiré : on refresh une fois.
  if (response.status === 401 && !isScopeError(response.status, data)) {
    token = await refreshAccessToken(region);
    response = await fetch(`${base}${path}`, buildOptions(token));
    data = await response.json().catch(() => ({}));
  }

  if (isScopeError(response.status, data)) {
    throw new CrmError(
      "Reconnectez Zoho depuis Paramètres et autorisez l’accès au CRM, puis réessayez.",
      true,
    );
  }
  return { status: response.status, data };
}

export interface CrmContactInput {
  firstName?: string | null;
  lastName: string;
  email?: string | null;
  /** Compte CRM auquel rattacher le contact (ex. le compte de la boutique). */
  accountId?: string | null;
}

/** Recherche un contact CRM par email exact. Renvoie son id, ou null si absent. */
async function findCrmContactByEmail(region: string, email: string): Promise<string | null> {
  try {
    const { status, data } = await crmRequest(
      "GET",
      `/Contacts/search?email=${encodeURIComponent(email)}`,
      undefined,
      region,
    );
    if (status === 204) return null;
    const id = data?.data?.[0]?.id;
    return id ? String(id) : null;
  } catch {
    // Une recherche en échec ne doit pas bloquer la création du devis.
    return null;
  }
}

/**
 * Trouve (par email) ou crée un contact CRM pour la personne qui a passé la
 * commande, puis renvoie son id. Renvoie null si impossible (ex. pas de nom).
 * Idempotent : un re-run retrouve le contact créé précédemment via l'email.
 */
export async function findOrCreateCrmContact(input: CrmContactInput): Promise<string | null> {
  const region = await getZohoRegion();
  const lastName = (input.lastName ?? "").trim();
  if (!lastName) return null;

  if (input.email) {
    const existing = await findCrmContactByEmail(region, input.email.trim());
    if (existing) return existing;
  }

  const record: Record<string, unknown> = { Last_Name: lastName };
  if (input.firstName?.trim()) record.First_Name = input.firstName.trim();
  if (input.email?.trim()) record.Email = input.email.trim();
  if (input.accountId) record.Account_Name = { id: input.accountId };

  try {
    const { data } = await crmRequest("POST", `/Contacts`, { data: [record] }, region);
    const first = data?.data?.[0];
    if (first?.code === "SUCCESS" && first?.details?.id) return String(first.details.id);
  } catch {
    // Ignorer : on retombera sur le contact d'intégration par défaut.
  }
  return null;
}

// ── Commande client (module Sales_Orders) ───────────────────────────────────
// Cible réelle demandée : les commandes payées vont dans « Commandes client »
// (module standard Sales_Orders), pas dans le pipeline Deals.
/** Nom API du module « Commandes client » (standard Zoho = Sales_Orders). */
export const ORDER_SO_MODULE = process.env.ZOHO_CRM_ORDER_MODULE || "Sales_Orders";
/** Valeur du champ Status posée à la création (« Nouvelle commande »). */
export const ORDER_SO_STATUS = process.env.ZOHO_CRM_ORDER_STATUS || "Nouvelle commande";

export function getCrmSalesOrderUrl(region: string, soId: string): string {
  const domain = CRM_WEB_DOMAINS[region] || CRM_WEB_DOMAINS.us;
  return `https://${domain}/crm/tab/SalesOrders/${soId}`;
}

/** Recherche un produit CRM par code (SKU) puis par nom. Renvoie {id, active}. */
async function findCrmProduct(
  region: string,
  input: { code?: string; name?: string },
): Promise<{ id: string; active: boolean } | null> {
  const tryCriteria = async (criteria: string): Promise<{ id: string; active: boolean } | null> => {
    try {
      const { status, data } = await crmRequest(
        "GET",
        `/Products/search?criteria=${encodeURIComponent(criteria)}`,
        undefined,
        region,
      );
      if (status === 204) return null;
      const rec = data?.data?.[0];
      if (!rec?.id) return null;
      // Product_Active absent => on suppose actif (ne pas bloquer inutilement).
      return { id: String(rec.id), active: rec.Product_Active !== false };
    } catch {
      return null;
    }
  };
  if (input.code) {
    const r = await tryCriteria(`(Product_Code:equals:${input.code})`);
    if (r) return r;
  }
  // Recherche par nom seulement si pas de caractères qui cassent le critère.
  if (input.name && !/[()]/.test(input.name)) {
    const r = await tryCriteria(`(Product_Name:equals:${input.name})`);
    if (r) return r;
  }
  return null;
}

/** Réactive un produit (Zoho refuse d'ajouter un produit inactif à une commande). */
async function reactivateCrmProduct(region: string, id: string): Promise<void> {
  try {
    await crmRequest("PUT", `/Products`, { data: [{ id, Product_Active: true }] }, region);
  } catch {
    /* best-effort */
  }
}

// Cache process (utile au backfill) : évite recherches/créations redondantes.
const productCache = new Map<string, string | null>();

export class ProductResolveError extends Error {}

/**
 * Trouve (par code/nom) ou crée un produit CRM pour une ligne de commande, et
 * renvoie son id. Les lignes d'une commande client DOIVENT référencer un
 * produit ACTIF du module Products : un produit trouvé mais inactif est
 * réactivé. Idempotent via recherche-d'abord + cache. Lève ProductResolveError
 * si la création échoue (pour remonter la raison exacte à l'appelant).
 */
export async function findOrCreateCrmProduct(input: {
  name?: string | null;
  code?: string | null;
  unitPrice?: number | null;
}): Promise<string | null> {
  const name = (input.name ?? "").trim();
  const code = (input.code ?? "").trim();
  const cacheKey = code ? `c:${code}` : name ? `n:${name.toLowerCase()}` : "";
  if (!cacheKey) return null;
  if (productCache.has(cacheKey)) return productCache.get(cacheKey) ?? null;

  const region = await getZohoRegion();
  const found = await findCrmProduct(region, { code, name });
  let id: string | null = null;
  if (found) {
    id = found.id;
    if (!found.active) await reactivateCrmProduct(region, id);
  } else {
    const record: Record<string, unknown> = {
      Product_Name: name || code || "Article",
      Product_Active: true,
    };
    if (code) record.Product_Code = code;
    if (Number.isFinite(input.unitPrice) && (input.unitPrice as number) > 0) {
      record.Unit_Price = input.unitPrice;
    }
    const { data } = await crmRequest("POST", `/Products`, { data: [record] }, region);
    const first = data?.data?.[0];
    if (first?.code === "SUCCESS" && first?.details?.id) {
      id = String(first.details.id);
    } else {
      const reason = first?.message || data?.message || "réponse inattendue";
      const detail = first?.details ? ` (${JSON.stringify(first.details)})` : "";
      throw new ProductResolveError(`produit « ${name || code} » non créé : ${reason}${detail}`);
    }
  }
  productCache.set(cacheKey, id);
  return id;
}

export interface CrmSalesOrderLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  description?: string | null;
}

export interface CrmSalesOrderParams {
  /** Objet de la commande, ex. "Mapei #1014". */
  subject: string;
  status?: string;
  description?: string;
  accountId?: string | null;
  contactId?: string | null;
  lines: CrmSalesOrderLine[];
}

/** Crée une commande client (Sales_Orders) et renvoie son id + URL. */
export async function createCrmSalesOrder(
  params: CrmSalesOrderParams,
): Promise<{ soId: string; soUrl: string }> {
  const region = await getZohoRegion();
  const record: Record<string, unknown> = {
    Subject: params.subject,
    Status: params.status || ORDER_SO_STATUS,
  };
  if (params.description) record.Description = params.description;
  if (params.accountId) record.Account_Name = { id: params.accountId };
  if (params.contactId) record.Contact_Name = { id: params.contactId };
  record.Ordered_Items = params.lines.map((l) => {
    const item: Record<string, unknown> = {
      Product_Name: { id: l.productId },
      Quantity: Number.isFinite(l.quantity) ? l.quantity : 1,
      List_Price: Number.isFinite(l.unitPrice) ? l.unitPrice : 0,
    };
    if (l.description) item.Description = l.description;
    return item;
  });

  const { data } = await crmRequest("POST", `/${ORDER_SO_MODULE}`, { data: [record] }, region);
  const first = data?.data?.[0];
  if (first?.code !== "SUCCESS" || !first?.details?.id) {
    const detail = first?.details ? ` (${JSON.stringify(first.details)})` : "";
    const reason = first?.message || data?.message || "réponse inattendue";
    throw new CrmError(`Création de la commande client refusée : ${reason}${detail}`);
  }
  const soId = String(first.details.id);
  return { soId, soUrl: getCrmSalesOrderUrl(region, soId) };
}

/** Met à jour des champs d'une commande client existante. */
export async function updateCrmSalesOrder(
  soId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const region = await getZohoRegion();
  const { data } = await crmRequest("PUT", `/${ORDER_SO_MODULE}`, { data: [{ id: soId, ...fields }] }, region);
  const first = data?.data?.[0];
  if (first && first.code !== "SUCCESS") {
    throw new CrmError(`Mise à jour de la commande client refusée : ${first.message || "erreur inconnue"}`);
  }
}

/** Joint un PDF à une commande client (related list Attachments). */
export async function uploadSalesOrderAttachment(
  soId: string,
  filename: string,
  pdf: Buffer,
): Promise<void> {
  const region = await getZohoRegion();
  const base = crmApiBase(region);
  const url = `${base}/${ORDER_SO_MODULE}/${soId}/Attachments`;

  const send = async (token: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
    return fetch(url, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  };

  let token = await getValidAccessToken(region);
  let response = await send(token);
  let data = await response.json().catch(() => ({}));
  if (response.status === 401 && !isScopeError(response.status, data)) {
    token = await refreshAccessToken(region);
    response = await send(token);
    data = await response.json().catch(() => ({}));
  }
  if (isScopeError(response.status, data)) {
    throw new CrmError("Reconnectez Zoho et autorisez l’accès au CRM pour joindre le PDF.", true);
  }
  const first = data?.data?.[0];
  if (first && first.code !== "SUCCESS") {
    throw new CrmError(`Pièce jointe refusée par le CRM : ${first.message || "erreur inconnue"}`);
  }
}

export interface CrmDealParams {
  /** Nom de l'opportunité, ex. "Mapei #1234". */
  dealName: string;
  /** Montant total (dollars). */
  amount: number;
  stage?: string;
  description?: string;
  /** Account CRM à rattacher (zohoCrmAccountId du contact). */
  accountId?: string | null;
  /** Contact CRM à rattacher (zohoCrmContactId du contact). */
  contactId?: string | null;
  /** Date de clôture ISO (yyyy-mm-dd); défaut = aujourd'hui. */
  closingDate?: string;
}

/** Crée un devis (Deal) dans le pipeline et renvoie son id + URL. */
export async function createCrmDeal(
  params: CrmDealParams,
): Promise<{ dealId: string; dealUrl: string }> {
  const region = await getZohoRegion();
  const closing = params.closingDate || new Date().toISOString().slice(0, 10);

  const record: Record<string, unknown> = {
    Deal_Name: params.dealName,
    Stage: params.stage || ORDER_DEAL_STAGE,
    Amount: Number.isFinite(params.amount) ? params.amount : 0,
    Closing_Date: closing,
  };
  if (ORDER_DEAL_PIPELINE) record.Pipeline = ORDER_DEAL_PIPELINE;
  if (params.description) record.Description = params.description;
  if (params.accountId) record.Account_Name = { id: params.accountId };
  if (params.contactId) record.Contact_Name = { id: params.contactId };

  const { data } = await crmRequest("POST", `/${ORDER_DEAL_MODULE}`, { data: [record] }, region);
  const first = data?.data?.[0];
  if (first?.code !== "SUCCESS" || !first?.details?.id) {
    const reason = first?.message || data?.message || "réponse inattendue";
    throw new CrmError(`Création du devis CRM refusée : ${reason}`);
  }
  const dealId = String(first.details.id);
  return { dealId, dealUrl: getCrmDealUrl(region, dealId) };
}

/** Met à jour des champs d'un devis existant (ex. lien vers le projet). */
export async function updateCrmDeal(
  dealId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const region = await getZohoRegion();
  const { data } = await crmRequest("PUT", `/${ORDER_DEAL_MODULE}`, { data: [{ id: dealId, ...fields }] }, region);
  const first = data?.data?.[0];
  if (first && first.code !== "SUCCESS") {
    throw new CrmError(`Mise à jour du devis CRM refusée : ${first.message || "erreur inconnue"}`);
  }
}

/** Joint un PDF à un devis existant (related list Attachments). */
export async function uploadDealAttachment(
  dealId: string,
  filename: string,
  pdf: Buffer,
): Promise<void> {
  const region = await getZohoRegion();
  const base = crmApiBase(region);
  const url = `${base}/${ORDER_DEAL_MODULE}/${dealId}/Attachments`;

  const send = async (token: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
    return fetch(url, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  };

  let token = await getValidAccessToken(region);
  let response = await send(token);
  let data = await response.json().catch(() => ({}));
  if (response.status === 401 && !isScopeError(response.status, data)) {
    token = await refreshAccessToken(region);
    response = await send(token);
    data = await response.json().catch(() => ({}));
  }
  if (isScopeError(response.status, data)) {
    throw new CrmError("Reconnectez Zoho et autorisez l’accès au CRM pour joindre le PDF.", true);
  }
  const first = data?.data?.[0];
  if (first && first.code !== "SUCCESS") {
    throw new CrmError(`Pièce jointe refusée par le CRM : ${first.message || "erreur inconnue"}`);
  }
}
