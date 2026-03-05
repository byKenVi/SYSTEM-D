import { getValidAccessToken, getZohoDomains } from "./zoho-auth";
import { storage } from "./storage";

async function zohoRequest(
  method: string,
  path: string,
  body?: any,
  region: string = "us"
): Promise<any> {
  const token = await getValidAccessToken(region);
  const settings = await storage.getAdminSettings();
  const orgId = settings?.zohoInventoryOrgId;
  if (!orgId) throw new Error("Zoho Organization ID not configured");

  const { api } = getZohoDomains(region);
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://${api}/inventory/v1${path}${sep}organization_id=${orgId}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho API ${method} ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getZohoRegion(): Promise<string> {
  const settings = await storage.getAdminSettings();
  return settings?.zohoRegion || "us";
}

// Fetch all items from Zoho Inventory (handles pagination)
export async function fetchZohoItems(): Promise<any[]> {
  const region = await getZohoRegion();
  const items: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await zohoRequest(
      "GET",
      `/items?per_page=200&page=${page}`,
      undefined,
      region
    );
    if (data.items && data.items.length > 0) {
      items.push(...data.items);
    }
    hasMore = data.page_context?.has_more_page === true;
    page++;
  }

  return items;
}

// Push a single item to Zoho Inventory
export async function pushItemToZoho(item: {
  name: string;
  sku?: string | null;
  description?: string | null;
  rate?: number;
}): Promise<{ item_id: string }> {
  const region = await getZohoRegion();
  const data = await zohoRequest(
    "POST",
    "/items",
    {
      name: item.name,
      sku: item.sku || undefined,
      description: item.description || undefined,
      rate: item.rate || 0,
      product_type: "goods",
    },
    region
  );
  return { item_id: data.item?.item_id };
}

// Sync items from Zoho into the app (for a specific contact)
export async function syncZohoItemsForContact(contactId: number): Promise<{
  added: number;
  updated: number;
}> {
  const zohoItems = await fetchZohoItems();
  let added = 0;
  let updated = 0;

  const existingProducts = await storage.getProductsByContactId(contactId);
  const byZohoId = new Map(existingProducts.filter(p => p.zohoItemId).map(p => [p.zohoItemId!, p]));
  const bySku = new Map(existingProducts.filter(p => p.sku).map(p => [p.sku!, p]));

  for (const item of zohoItems) {
    const zohoItemId = item.item_id;
    const sku = item.sku || null;
    const existing = byZohoId.get(zohoItemId) || (sku ? bySku.get(sku) : undefined);

    const qty = item.stock_on_hand != null ? Math.round(item.stock_on_hand) : 0;
    const price = item.rate != null ? String(item.rate) : null;

    if (existing) {
      await storage.updateProduct(existing.id, {
        name: item.name || existing.name,
        sku: sku || existing.sku,
        inventoryQuantity: qty,
        price: price as any,
        zohoItemId,
        pushedToZoho: true,
        lastSyncedAt: new Date(),
      });
      updated++;
    } else {
      await storage.createProduct({
        contactId,
        name: item.name,
        sku,
        description: item.description || null,
        imageUrl: null,
        price: price as any,
        inventoryQuantity: qty,
        pushedToZoho: true,
        zohoItemId,
        shopifyProductId: null,
        lastSyncedAt: new Date(),
      });
      added++;
    }
  }

  return { added, updated };
}

// Create or find a contact in Zoho Inventory
export async function ensureZohoContact(contact: {
  name: string;
  email: string;
  companyName?: string | null;
}): Promise<string> {
  const region = await getZohoRegion();

  // Search by email
  const searchData = await zohoRequest(
    "GET",
    `/contacts?email=${encodeURIComponent(contact.email)}&contact_type=customer`,
    undefined,
    region
  );

  if (searchData.contacts && searchData.contacts.length > 0) {
    const existing = searchData.contacts[0];
    // Ensure tax_preference is set
    await zohoRequest("PUT", `/contacts/${existing.contact_id}`, {
      contact_name: contact.companyName || contact.name,
      email: contact.email,
      tax_preference: "taxable",
    }, region);
    return existing.contact_id;
  }

  // Create new
  const createData = await zohoRequest("POST", "/contacts", {
    contact_name: contact.companyName || contact.name,
    contact_type: "customer",
    email: contact.email,
    tax_preference: "taxable",
  }, region);

  return createData.contact?.contact_id;
}

// Create a sales order in Zoho Inventory (for restock requests)
export async function createZohoSalesOrder(params: {
  contactName: string;
  contactEmail: string;
  companyName?: string | null;
  items: { zohoItemId: string; quantity: number; rate: number; name: string }[];
}): Promise<{ salesOrderId: string; salesOrderNumber: string }> {
  const region = await getZohoRegion();
  const contactId = await ensureZohoContact({
    name: params.contactName,
    email: params.contactEmail,
    companyName: params.companyName,
  });

  const lineItems = params.items.map((item) => ({
    item_id: item.zohoItemId,
    name: item.name,
    quantity: item.quantity,
    rate: item.rate,
  }));

  const data = await zohoRequest("POST", "/salesorders", {
    customer_id: contactId,
    line_items: lineItems,
  }, region);

  const so = data.salesorder;
  return {
    salesOrderId: so.salesorder_id,
    salesOrderNumber: so.salesorder_number,
  };
}

export async function getZohoItemStock(zohoItemId: string): Promise<number | null> {
  try {
    const region = await getZohoRegion();
    const data = await zohoRequest("GET", `/items/${zohoItemId}`, undefined, region);
    if (data.item) {
      return data.item.stock_on_hand != null ? Math.round(data.item.stock_on_hand) : 0;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchZohoItemsMap(): Promise<Map<string, { stock: number; rate: number | null }>> {
  const items = await fetchZohoItems();
  const map = new Map<string, { stock: number; rate: number | null }>();
  for (const item of items) {
    map.set(item.item_id, {
      stock: item.stock_on_hand != null ? Math.round(item.stock_on_hand) : 0,
      rate: item.rate != null ? item.rate : null,
    });
  }
  return map;
}

// Test that the connection works
export async function testZohoConnection(): Promise<{ ok: boolean; orgName?: string }> {
  try {
    const region = await getZohoRegion();
    const data = await zohoRequest("GET", "/items?per_page=1", undefined, region);
    return { ok: true, orgName: data.organization?.name };
  } catch (err: any) {
    return { ok: false };
  }
}
