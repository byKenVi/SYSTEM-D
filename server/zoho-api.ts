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

async function zohoUploadImage(
  itemId: string,
  imageUrl: string,
  region: string = "us"
): Promise<void> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

  const token = await getValidAccessToken(region);
  const settings = await storage.getAdminSettings();
  const orgId = settings?.zohoInventoryOrgId;
  if (!orgId) throw new Error("Zoho Organization ID not configured");

  const { api } = getZohoDomains(region);
  const url = `https://${api}/inventory/v1/items/${itemId}/image?organization_id=${orgId}`;

  const boundary = `----FormBoundary${Date.now()}`;
  const fieldName = "image";
  const fileName = `product.${ext}`;

  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipartBody = Buffer.concat([header, buffer, footer]);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho image upload failed: ${res.status} ${text}`);
  }
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
      `/items?per_page=200&page=${page}&filter_by=Status.All`,
      undefined,
      region
    );
    if (data.items && data.items.length > 0) {
      items.push(...data.items);
    }
    hasMore = data.page_context?.has_more_page === true;
    page++;
  }

  // The list endpoint doesn't return custom_fields — fetch each item individually to get them
  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const detail = await zohoRequest("GET", `/items/${item.item_id}`, undefined, region);
        return detail.item ?? item;
      } catch {
        return item;
      }
    })
  );

  return enriched;
}

// Push a single item to Zoho Inventory
export async function pushItemToZoho(item: {
  name: string;
  sku?: string | null;
  description?: string | null;
  rate?: number;
  opening_stock?: number;
  imageUrl?: string | null;
  clientName?: string | null;
}): Promise<{ item_id: string }> {
  const region = await getZohoRegion();
  const body: Record<string, any> = {
    name: item.name,
    sku: item.sku || undefined,
    description: item.description || undefined,
    rate: item.rate || 0,
    product_type: "goods",
  };
  if (item.opening_stock != null && item.opening_stock > 0) {
    body.opening_stock = item.opening_stock;
    body.opening_stock_rate_per_unit = item.rate || 0;
  }
  if (item.clientName) {
    body.custom_fields = [{ api_name: "cf_client", value: item.clientName }];
  }
  const data = await zohoRequest("POST", "/items", body, region);
  const itemId = data.item?.item_id;

  if (itemId && item.imageUrl) {
    try {
      await zohoUploadImage(itemId, item.imageUrl, region);
    } catch (err: any) {
      console.error(`Failed to upload image for Zoho item ${itemId}: ${err.message}`);
    }
  }

  return { item_id: itemId };
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
export async function fetchZohoContactsMap(): Promise<Map<string, { name: string; email: string | null }>> {
  const region = await getZohoRegion();
  const map = new Map<string, { name: string; email: string | null }>();
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const data = await zohoRequest("GET", `/contacts?per_page=200&page=${page}&contact_type=customer`, undefined, region);
    if (data.contacts && data.contacts.length > 0) {
      for (const c of data.contacts) {
        map.set(String(c.contact_id), { name: c.contact_name || c.display_name || "", email: c.email || null });
      }
    }
    hasMore = data.page_context?.has_more_page === true;
    page++;
  }
  return map;
}

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

export async function updateZohoItemClient(itemId: string, clientName: string): Promise<void> {
  const region = await getZohoRegion();
  await zohoRequest("PUT", `/items/${itemId}`, {
    custom_fields: [{ api_name: "cf_client", value: clientName }],
  }, region);
}

export async function deleteZohoItem(zohoItemId: string): Promise<void> {
  const region = await getZohoRegion();
  await zohoRequest("DELETE", `/items/${zohoItemId}`, undefined, region);
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

const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

const ZOHO_WEB_DOMAINS: Record<string, string> = {
  us: "inventory.zoho.com",
  eu: "inventory.zoho.eu",
  in: "inventory.zoho.in",
  au: "inventory.zoho.com.au",
  jp: "inventory.zoho.jp",
  ca: "inventory.zohocloud.ca",
};

export function getZohoSOUrl(region: string, salesOrderId: string): string {
  const domain = ZOHO_WEB_DOMAINS[region] || ZOHO_WEB_DOMAINS.us;
  return `https://${domain}/app#/salesorders/${salesOrderId}`;
}

function buildFormDescription(formType: string, formData: any): string {
  const d = formData || {};
  switch (formType) {
    case "entreposage": {
      const parts: string[] = [];
      if (d.natureProduit) parts.push(`Produit: ${d.natureProduit}`);
      if (d.typeEmballage) parts.push(`Emballage: ${d.typeEmballage}`);
      if (d.hasBinRack) parts.push("Bin/Rack requis");
      if (d.hasKitting) parts.push("Kitting");
      if (d.hasConditionnement) parts.push("Conditionnement");
      return parts.length ? parts.join(" | ") : "Entreposage";
    }
    case "tri": {
      const nc = Array.isArray(d.ncItems) ? d.ncItems.length : 0;
      return `Tri et inspection${nc ? ` - ${nc} article(s) NC` : ""}`;
    }
    case "inspection": {
      const crit = Array.isArray(d.criteria) ? d.criteria.length : 0;
      return `Inspection${crit ? ` - ${crit} critère(s)` : ""}`;
    }
    case "copacking": {
      const parts: string[] = ["Co-packing"];
      if (d.paletteNb) parts.push(`${d.paletteNb} palette(s)`);
      return parts.join(" - ");
    }
    case "livraison": {
      const dist = d.destinationType === "longue_distance" ? "Longue distance" : "Local";
      return `Livraison ${dist}`;
    }
    default:
      return formType;
  }
}

// Create a service item + sales order in Zoho Inventory for an approved service request form
export async function createFormSalesOrder(params: {
  formNumber: string;
  formType: string;
  formData: any;
  quantity: number;
  rate: number;
  contact: { name: string; email: string; companyName?: string | null };
}): Promise<{ salesOrderId: string; salesOrderNumber: string }> {
  const region = await getZohoRegion();

  // 1. Ensure customer exists in Zoho
  const customerId = await ensureZohoContact(params.contact);

  // 2. Create a service-type item for this form
  const itemName = `${params.formNumber} - ${FORM_TYPE_LABELS[params.formType] || params.formType}`;
  const description = buildFormDescription(params.formType, params.formData);

  const itemData = await zohoRequest("POST", "/items", {
    name: itemName,
    description,
    rate: params.rate,
    product_type: "service",
    item_type: "sales",
    unit: "qty",
  }, region);

  const itemId = itemData.item?.item_id;
  if (!itemId) throw new Error("Failed to create Zoho service item");

  // 3. Create the sales order
  const soData = await zohoRequest("POST", "/salesorders", {
    customer_id: customerId,
    line_items: [{
      item_id: itemId,
      name: itemName,
      description,
      quantity: params.quantity,
      rate: params.rate,
    }],
    notes: `Demande de service ${params.formNumber} approuvée via Système D`,
  }, region);

  const so = soData.salesorder;
  if (!so) throw new Error("Failed to create Zoho sales order");

  return {
    salesOrderId: so.salesorder_id,
    salesOrderNumber: so.salesorder_number,
  };
}
