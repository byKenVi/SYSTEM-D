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

/** Nom de l'étape du pipeline où atterrissent les commandes. Surchargable sans redeploy. */
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
  // Deep link vers l'enregistrement; le module Deals utilise l'onglet Potentials.
  return `https://${domain}/crm/tab/Potentials/${dealId}`;
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
  if (params.description) record.Description = params.description;
  if (params.accountId) record.Account_Name = { id: params.accountId };
  if (params.contactId) record.Contact_Name = { id: params.contactId };

  const { data } = await crmRequest("POST", "/Deals", { data: [record] }, region);
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
  const { data } = await crmRequest("PUT", "/Deals", { data: [{ id: dealId, ...fields }] }, region);
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
  const url = `${base}/Deals/${dealId}/Attachments`;

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
