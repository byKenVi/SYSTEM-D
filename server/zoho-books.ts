/**
 * Zoho Books API — commandes produit / Shopify (Inventory reste utilisé pour stock et soumissions).
 */

import { getValidAccessToken, getZohoDomains, refreshAccessToken } from "./zoho-auth";
import { storage } from "./storage";
import { getZohoRegion } from "./zoho-api";
import { BooksConfigurationError, chooseBooksOrganization, type BooksOrganization } from "./zoho-books-policy";

const BOOKS_WEB_DOMAINS: Record<string, string> = {
  us: "books.zoho.com",
  eu: "books.zoho.eu",
  in: "books.zoho.in",
  au: "books.zoho.com.au",
  jp: "books.zoho.jp",
  ca: "books.zohocloud.ca",
};

async function getBooksOrgId(): Promise<string> {
  const settings = await storage.getAdminSettings();
  const orgId = settings?.zohoBooksOrgId;
  if (!orgId) throw new BooksConfigurationError("BOOKS_ORGANIZATION_REQUIRED", "Configurez l’organisation Zoho Books dans Paramètres avant de créer un bon de commande.");
  return orgId;
}

function booksApiError(status: number, code: unknown, zohoMessage?: unknown): BooksConfigurationError {
  if (status === 429) return new BooksConfigurationError("BOOKS_RATE_LIMITED", "Zoho limite temporairement les requêtes. Réessayez plus tard.", 429);
  if (status === 401 || status === 403 || code === 57 || String(code).includes("SCOPE")) {
    return new BooksConfigurationError("BOOKS_SCOPE_REQUIRED", "Reconnectez Zoho depuis Paramètres et autorisez l’accès à Zoho Books, puis réessayez.", 403);
  }
  const detail = typeof zohoMessage === "string" && zohoMessage ? ` (Zoho : ${zohoMessage})` : "";
  return new BooksConfigurationError("BOOKS_API_ERROR", `Zoho Books n’a pas accepté la requête. Vérifiez l’organisation sélectionnée ou réessayez plus tard.${detail}`, 502);
}

async function requestBooksData(path: string, region: string, token: string, method = "GET", body?: unknown) {
  const { api } = getZohoDomains(region);
  const options = (accessToken: string): RequestInit => ({
    method, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let response = await fetch(`https://${api}/books/v3${path}`, options(token));
  let data = await response.json().catch(() => ({}));
  // Missing scopes cannot be fixed by a refresh; never misclassify rate limits.
  if (response.status === 401 && data.code !== 57 && !String(data.code).includes("SCOPE")) {
    response = await fetch(`https://${api}/books/v3${path}`, options(await refreshAccessToken(region)));
    data = await response.json().catch(() => ({}));
  }
  if (!response.ok || data.code !== 0) throw booksApiError(response.status, data.code, data.message);
  return data;
}

export async function fetchBooksOrganizations(): Promise<BooksOrganization[]> {
  const settings = await storage.getAdminSettings();
  if (!settings?.zohoInventoryRefreshToken) {
    throw new BooksConfigurationError("BOOKS_NOT_CONNECTED", "Connectez d’abord Zoho dans Paramètres.", 409);
  }
  const region = settings.zohoRegion || "us";
  const data = await requestBooksData("/organizations", region, await getValidAccessToken(region));
  return (Array.isArray(data.organizations) ? data.organizations : [])
    .filter((org: any) => org.is_active !== false && /^\d+$/.test(String(org.organization_id)))
    .map((org: any) => ({ organization_id: String(org.organization_id), name: String(org.name || org.organization_id), currency_code: org.currency_code }));
}

async function validateBooksReads(organizationId: string): Promise<void> {
  const region = await getZohoRegion();
  const token = await getValidAccessToken(region);
  for (const path of ["/salesorders", "/contacts"]) {
    await requestBooksData(`${path}?organization_id=${encodeURIComponent(organizationId)}&per_page=1`, region, token);
  }
}

export async function configureBooksOrganization(requestedId?: string) {
  const settings = await storage.getAdminSettings();
  const organizations = await fetchBooksOrganizations();
  const organization = chooseBooksOrganization(organizations, settings?.zohoInventoryOrgId, requestedId);
  await validateBooksReads(organization.organization_id);
  // Targeted write only: never restore a stale OAuth token from a settings snapshot.
  await storage.upsertAdminSettings({ zohoBooksOrgId: organization.organization_id });
  await storage.createActivityLog({
    type: "zoho_books_configured", status: "success",
    message: `Zoho Books configuré pour ${organization.name}; accès en lecture vérifié, aucune commande créée.`,
  });
  return { organizationId: organization.organization_id, organizationName: organization.name, message: "Zoho Books configuré. L’accès aux contacts et bons de commande a été vérifié en lecture seule." };
}

export async function testBooksConnection() {
  const organizationId = await getBooksOrgId();
  const organizations = await fetchBooksOrganizations();
  chooseBooksOrganization(organizations, null, organizationId);
  await validateBooksReads(organizationId);
  return { ok: true, organizationId, message: "Connexion Zoho Books vérifiée en lecture seule. Aucune commande créée." };
}

async function booksRequest(
  method: string,
  path: string,
  body?: unknown,
  region?: string,
): Promise<any> {
  const r = region ?? (await getZohoRegion());
  const orgId = await getBooksOrgId();
  const token = await getValidAccessToken(r);
  const sep = path.includes("?") ? "&" : "?";
  return requestBooksData(`${path}${sep}organization_id=${encodeURIComponent(orgId)}`, r, token, method, body);
}

export function getZohoBooksSalesOrderUrl(region: string, salesorderId: string): string {
  const domain = BOOKS_WEB_DOMAINS[region] || BOOKS_WEB_DOMAINS.us;
  return `https://${domain}/app#/salesorders/${salesorderId}`;
}

async function ensureBooksContact(contact: {
  name: string;
  email: string;
  companyName?: string | null;
}): Promise<string> {
  const region = await getZohoRegion();

  async function findByEmail(): Promise<string | null> {
    const data = await booksRequest(
      "GET",
      `/contacts?search_text=${encodeURIComponent(contact.email)}`,
      undefined,
      region,
    );
    const match = (data.contacts ?? []).find(
      (c: any) => c.email?.toLowerCase() === contact.email.toLowerCase(),
    );
    return match?.contact_id ?? null;
  }

  const existingId = await findByEmail();
  if (existingId) return existingId;

  try {
    const createData = await booksRequest("POST", "/contacts", {
      contact_name: contact.companyName || contact.name,
      contact_type: "customer",
      email: contact.email,
    }, region);
    const newId = createData.contact?.contact_id;
    if (!newId) throw new Error(`No contact_id in Zoho Books create response for ${contact.email}`);
    return newId;
  } catch (createErr: any) {
    const retryId = await findByEmail();
    if (retryId) return retryId;
    throw createErr;
  }
}

export type BooksLineItem = {
  name: string;
  sku?: string | null;
  /** Article Books/Inventory : sans lui, la ligne est du texte libre (pas de mouvement de stock). */
  itemId?: string | null;
  quantity: number;
  rate: number;
  description?: string;
};

export type BooksCustomField = { customfield_id: string; value: string };

function toBooksLineItems(items: BooksLineItem[]) {
  return items.map((item) => item.itemId
    ? { item_id: item.itemId, quantity: item.quantity, rate: item.rate, ...(item.description ? { description: item.description } : {}) }
    : {
        name: item.name,
        description: item.description ?? (item.sku ? `SKU: ${item.sku}` : undefined),
        quantity: item.quantity,
        rate: item.rate,
      });
}

export async function createBooksSalesOrder(params: {
  referenceNumber: string;
  customer: { name: string; email: string; companyName?: string | null };
  lineItems: BooksLineItem[];
  notes?: string;
  customFields?: BooksCustomField[];
}): Promise<{ salesorderId: string; salesorderNumber: string }> {
  const region = await getZohoRegion();
  const customerId = await ensureBooksContact(params.customer);

  const data = await booksRequest("POST", "/salesorders", {
    customer_id: customerId,
    reference_number: params.referenceNumber,
    line_items: toBooksLineItems(params.lineItems),
    notes: params.notes,
    ...(params.customFields?.length ? { custom_fields: params.customFields } : {}),
  }, region);

  const so = data.salesorder;
  if (!so?.salesorder_id) throw new Error("Zoho Books returned no salesorder");

  return {
    salesorderId: so.salesorder_id,
    salesorderNumber: so.salesorder_number ?? so.salesorder_id,
  };
}

/** Remplace les lignes (et le tag) d'un bon de commande existant. Échoue s'il est déjà facturé/expédié. */
export async function updateBooksSalesOrder(salesorderId: string, params: {
  referenceNumber: string;
  lineItems: BooksLineItem[];
  notes?: string;
  customFields?: BooksCustomField[];
}): Promise<void> {
  await booksRequest("PUT", `/salesorders/${encodeURIComponent(salesorderId)}`, {
    reference_number: params.referenceNumber,
    line_items: toBooksLineItems(params.lineItems),
    ...(params.notes ? { notes: params.notes } : {}),
    ...(params.customFields?.length ? { custom_fields: params.customFields } : {}),
  });
}

/** « Confirmer » dans l'interface Books = statut API « open ». */
export async function confirmBooksSalesOrder(salesorderId: string): Promise<void> {
  await booksRequest("POST", `/salesorders/${encodeURIComponent(salesorderId)}/status/open`);
}

/** Bon de commande Books portant exactement cette référence, ou null. */
export async function findBooksSalesOrderByReference(
  referenceNumber: string,
): Promise<{ salesorderId: string; salesorderNumber: string } | null> {
  const data = await booksRequest("GET", `/salesorders?reference_number=${encodeURIComponent(referenceNumber)}`);
  const match = (data.salesorders ?? []).find((so: any) => so.reference_number === referenceNumber);
  return match ? { salesorderId: String(match.salesorder_id), salesorderNumber: String(match.salesorder_number ?? match.salesorder_id) } : null;
}
