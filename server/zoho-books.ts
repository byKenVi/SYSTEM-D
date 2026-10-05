/**
 * Zoho Books API — commandes produit / Shopify (Inventory reste utilisé pour stock et soumissions).
 */

import { getValidAccessToken, getZohoDomains, refreshAccessToken } from "./zoho-auth";
import { storage } from "./storage";
import { getZohoRegion } from "./zoho-api";

const BOOKS_WEB_DOMAINS: Record<string, string> = {
  us: "books.zoho.com",
  eu: "books.zoho.eu",
  in: "books.zoho.in",
  au: "books.zoho.com.au",
  jp: "books.zoho.jp",
  ca: "books.zohocloud.ca",
};

async function getBooksOrgId(region: string): Promise<string> {
  const settings = await storage.getAdminSettings();
  const orgId = settings?.zohoBooksOrgId || settings?.zohoInventoryOrgId;
  if (!orgId) throw new Error("Zoho Books organization ID not configured");
  return orgId;
}

async function booksRequest(
  method: string,
  path: string,
  body?: unknown,
  region?: string,
): Promise<any> {
  const r = region ?? (await getZohoRegion());
  const token = await getValidAccessToken(r);
  const orgId = await getBooksOrgId(r);
  const { api } = getZohoDomains(r);
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://${api}/books/v3${path}${sep}organization_id=${orgId}`;

  const buildOptions = (accessToken: string): RequestInit => ({
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let res = await fetch(url, buildOptions(token));
  if (res.status === 401) {
    const freshToken = await refreshAccessToken(r);
    res = await fetch(url, buildOptions(freshToken));
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho Books ${method} ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
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
  quantity: number;
  rate: number;
  description?: string;
};

export async function createBooksSalesOrder(params: {
  referenceNumber: string;
  customer: { name: string; email: string; companyName?: string | null };
  lineItems: BooksLineItem[];
  notes?: string;
}): Promise<{ salesorderId: string; salesorderNumber: string }> {
  const region = await getZohoRegion();
  const customerId = await ensureBooksContact(params.customer);

  const line_items = params.lineItems.map((item) => ({
    name: item.name,
    description: item.description ?? (item.sku ? `SKU: ${item.sku}` : undefined),
    quantity: item.quantity,
    rate: item.rate,
  }));

  const data = await booksRequest("POST", "/salesorders", {
    customer_id: customerId,
    reference_number: params.referenceNumber,
    line_items,
    notes: params.notes,
  }, region);

  const so = data.salesorder;
  if (!so?.salesorder_id) throw new Error("Zoho Books returned no salesorder");

  return {
    salesorderId: so.salesorder_id,
    salesorderNumber: so.salesorder_number ?? so.salesorder_id,
  };
}
