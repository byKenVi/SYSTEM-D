import { log } from "./index";

function wooAuthHeader(consumerKey: string, consumerSecret: string): string {
  return "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
}

function normalizeStoreUrl(raw: string): string {
  const url = raw.trim().replace(/\/$/, "");
  return url.startsWith("http") ? url : `https://${url}`;
}

async function wooRequest<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  method = "GET",
  body?: object
): Promise<T> {
  const base = normalizeStoreUrl(storeUrl);
  const url = `${base}/wp-json/wc/v3${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: wooAuthHeader(consumerKey, consumerSecret),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WooCommerce API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface NormalizedProduct {
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string | null;
  weight: string | null;
  weightUnit: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  shopifyStatus: string | null;
  shopifyHandle: string | null;
}

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  status: string;
  type: string;
  sku: string;
  description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  images: { src: string }[];
  tags: { name: string }[];
  categories: { name: string }[];
  weight: string;
  dimensions: { length: string; width: string; height: string };
}

interface WooVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  image: { src: string } | null;
  weight: string;
  attributes: { name: string; option: string }[];
}

interface WooOrder {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  billing: {
    email: string;
    first_name: string;
    last_name: string;
  };
  line_items: {
    id: number;
    name: string;
    product_id: number;
    quantity: number;
    total: string;
    sku: string;
  }[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function mapWooStatus(status: string): string {
  switch (status) {
    case "processing": return "paid";
    case "completed": return "paid";
    case "cancelled": return "voided";
    case "refunded": return "refunded";
    case "pending":
    case "on-hold":
    default: return "pending";
  }
}

async function fetchAllWooPages<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  endpoint: string
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  while (true) {
    const results = await wooRequest<T[]>(
      storeUrl, consumerKey, consumerSecret,
      `${endpoint}?per_page=100&page=${page}`
    );
    all.push(...results);
    if (results.length < 100) break;
    page++;
  }
  return all;
}

export async function fetchWooProducts(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<NormalizedProduct[]> {
  const products = await fetchAllWooPages<WooProduct>(storeUrl, consumerKey, consumerSecret, "/products");
  const normalized: NormalizedProduct[] = [];

  for (const p of products) {
    if (p.type === "variable") {
      try {
        const variations = await fetchAllWooPages<WooVariation>(
          storeUrl, consumerKey, consumerSecret, `/products/${p.id}/variations`
        );
        for (const v of variations) {
          const variantLabel = v.attributes.map((a) => a.option).join(" / ");
          normalized.push({
            shopifyProductId: `woo-${p.id}`,
            shopifyVariantId: `woo-${p.id}-${v.id}`,
            shopifyInventoryItemId: `woo-${p.id}-${v.id}`,
            name: variantLabel ? `${p.name} - ${variantLabel}` : p.name,
            sku: v.sku || p.sku || "",
            barcode: null,
            description: p.description ? stripHtml(p.description) : null,
            imageUrl: v.image?.src || p.images[0]?.src || null,
            vendor: null,
            productType: p.categories[0]?.name || null,
            tags: p.tags.map((t) => t.name).join(", ") || null,
            weight: v.weight || p.weight || null,
            weightUnit: v.weight || p.weight ? "kg" : null,
            price: v.price || p.price || "0",
            compareAtPrice: v.regular_price || p.regular_price || null,
            inventoryQuantity: v.manage_stock ? (v.stock_quantity ?? 0) : 0,
            shopifyStatus: p.status === "publish" ? "active" : p.status,
            shopifyHandle: p.slug,
          });
        }
      } catch (err: any) {
        log(`[woo] Failed to fetch variations for product ${p.id}: ${err.message}`, "woo");
        normalized.push(simpleProduct(p));
      }
    } else {
      normalized.push(simpleProduct(p));
    }
  }

  return normalized;
}

function simpleProduct(p: WooProduct): NormalizedProduct {
  return {
    shopifyProductId: `woo-${p.id}`,
    shopifyVariantId: `woo-${p.id}`,
    shopifyInventoryItemId: `woo-${p.id}`,
    name: p.name,
    sku: p.sku || "",
    barcode: null,
    description: p.description ? stripHtml(p.description) : null,
    imageUrl: p.images[0]?.src || null,
    vendor: null,
    productType: p.categories[0]?.name || null,
    tags: p.tags.map((t) => t.name).join(", ") || null,
    weight: p.weight || null,
    weightUnit: p.weight ? "kg" : null,
    price: p.price || "0",
    compareAtPrice: p.regular_price || null,
    inventoryQuantity: p.manage_stock ? (p.stock_quantity ?? 0) : 0,
    shopifyStatus: p.status === "publish" ? "active" : p.status,
    shopifyHandle: p.slug,
  };
}

export async function fetchWooOrders(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  perPage = 100
): Promise<WooOrder[]> {
  const all: WooOrder[] = [];
  let page = 1;
  while (true) {
    const batch = await wooRequest<WooOrder[]>(
      storeUrl, consumerKey, consumerSecret,
      `/orders?per_page=${perPage}&page=${page}&orderby=date&order=desc`
    );
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

export function normalizeWooOrders(
  orders: WooOrder[],
  integrationId: number,
  contactId: number,
  storeUrl: string,
  shopName: string | null
) {
  return orders.map((o) => ({
    integrationId,
    contactId,
    shopifyOrderId: String(o.id),
    name: `#${o.number}`,
    shopifyCreatedAt: o.date_created ? new Date(o.date_created) : null,
    financialStatus: mapWooStatus(o.status),
    fulfillmentStatus: o.status === "completed" ? "fulfilled" : null,
    totalPrice: o.total ?? "0",
    currency: o.currency ?? "CAD",
    email: o.billing?.email ?? null,
    customerFirstName: o.billing?.first_name ?? null,
    customerLastName: o.billing?.last_name ?? null,
    lineItems: (o.line_items ?? []).map((li) => ({
      product_id: li.product_id,
      title: li.name,
      quantity: li.quantity,
      price: li.total,
      sku: li.sku,
    })) as any,
    shopName,
    storeUrl,
  }));
}

export async function setWooProductStock(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  inventoryItemId: string,
  quantity: number
): Promise<void> {
  const parts = inventoryItemId.replace(/^woo-/, "").split("-");
  const productId = parts[0];
  const variationId = parts.length > 1 ? parts[1] : null;

  if (variationId) {
    await wooRequest(storeUrl, consumerKey, consumerSecret,
      `/products/${productId}/variations/${variationId}`, "PUT",
      { stock_quantity: quantity, manage_stock: true });
  } else {
    await wooRequest(storeUrl, consumerKey, consumerSecret,
      `/products/${productId}`, "PUT",
      { stock_quantity: quantity, manage_stock: true });
  }
}

export async function testWooConnection(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const data = await wooRequest<{ store: { name: string } }>(
      storeUrl, consumerKey, consumerSecret, "/system_status"
    );
    return { success: true, shopName: data?.store?.name || normalizeStoreUrl(storeUrl) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
