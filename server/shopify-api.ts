import crypto from "crypto";
import type { ParsedQs } from "qs";

const SHOPIFY_API_VERSION = "2025-04";

const SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
  "write_inventory",
].join(",");

function normalizeDomain(storeUrl: string): string {
  return storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function buildShopifyAuthUrl(
  storeUrl: string,
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const domain = normalizeDomain(storeUrl);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${domain}/admin/oauth/authorize?${params.toString()}`;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function getShopifyCallbackUrl(host: string): string {
  return `https://${host}/api/auth/shopify/callback`;
}

export async function exchangeShopifyCode(
  storeUrl: string,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{ accessToken: string; scope: string }> {
  const domain = normalizeDomain(storeUrl);
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}

export function validateShopifyStoreUrl(storeUrl: string): boolean {
  const domain = normalizeDomain(storeUrl);
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(domain);
}

export function verifyShopifyHmac(
  query: Record<string, any>,
  clientSecret: string
): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;

  const params = { ...query };
  delete params.hmac;
  delete params.signature;

  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");

  const computed = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(hmac as string, "hex")
  );
}

export async function getShopDetails(
  storeUrl: string,
  accessToken: string
): Promise<{ name: string; domain: string }> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/shop.json`, {
    headers: buildHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch shop details: ${res.status}`);
  }
  const data = await res.json();
  return { name: data.shop.name, domain: data.shop.myshopify_domain };
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  tags: string;
  images: { id: number; src: string; variant_ids: number[] }[];
  variants: ShopifyVariant[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string | null;
  barcode: string | null;
  weight: number;
  weight_unit: string;
  inventory_quantity: number;
  inventory_item_id: number;
  inventory_management: string | null;
  image_id: number | null;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

function buildHeaders(accessToken: string) {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

function buildBaseUrl(storeUrl: string): string {
  const domain = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${domain}/admin/api/${SHOPIFY_API_VERSION}`;
}

export async function testShopifyConnection(
  storeUrl: string,
  accessToken: string
): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const baseUrl = buildBaseUrl(storeUrl);
    const res = await fetch(`${baseUrl}/shop.json`, {
      headers: buildHeaders(accessToken),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `${res.status}: ${text}` };
    }
    const data = await res.json();
    return { success: true, shopName: data.shop?.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAllProducts(
  storeUrl: string,
  accessToken: string
): Promise<ShopifyProduct[]> {
  const baseUrl = buildBaseUrl(storeUrl);
  const allProducts: ShopifyProduct[] = [];
  let nextPageUrl: string | null = `${baseUrl}/products.json?limit=250&status=active`;

  while (nextPageUrl) {
    const res = await fetch(nextPageUrl, {
      headers: buildHeaders(accessToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${text}`);
    }

    const data: ShopifyProductsResponse = await res.json();
    allProducts.push(...data.products);

    const linkHeader = res.headers.get("link");
    nextPageUrl = parseLinkHeaderNext(linkHeader);
  }

  return allProducts;
}

export async function fetchProductCount(
  storeUrl: string,
  accessToken: string
): Promise<number> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/products/count.json?status=active`, {
    headers: buildHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}`);
  }
  const data = await res.json();
  return data.count || 0;
}

function parseLinkHeaderNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export interface NormalizedProduct {
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  name: string;
  sku: string | null;
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
  shopifyStatus: string;
  shopifyHandle: string;
}

export function normalizeProducts(shopifyProducts: ShopifyProduct[]): NormalizedProduct[] {
  const results: NormalizedProduct[] = [];

  for (const product of shopifyProducts) {
    for (const variant of product.variants) {
      const name =
        product.variants.length === 1
          ? product.title
          : `${product.title} - ${variant.title}`;

      let imageUrl = product.images?.[0]?.src || null;
      if (variant.image_id) {
        const variantImage = product.images.find((img) => img.id === variant.image_id);
        if (variantImage) imageUrl = variantImage.src;
      }

      results.push({
        shopifyProductId: String(product.id),
        shopifyVariantId: String(variant.id),
        shopifyInventoryItemId: String(variant.inventory_item_id),
        name,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        description: product.body_html
          ? product.body_html.replace(/<[^>]*>/g, "").slice(0, 2000)
          : null,
        imageUrl,
        vendor: product.vendor || null,
        productType: product.product_type || null,
        tags: product.tags || null,
        weight: variant.weight ? String(variant.weight) : null,
        weightUnit: variant.weight_unit || null,
        price: variant.price,
        compareAtPrice: variant.compare_at_price || null,
        inventoryQuantity: variant.inventory_quantity ?? 0,
        shopifyStatus: product.status,
        shopifyHandle: product.handle,
      });
    }
  }

  return results;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  note: string | null;
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string | null;
    variant_title: string | null;
  }[];
  shipping_address?: {
    name: string;
    address1: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export async function fetchShopifyOrders(
  storeUrl: string,
  accessToken: string,
  limit = 100
): Promise<ShopifyOrder[]> {
  const baseUrl = buildBaseUrl(storeUrl);
  const allOrders: ShopifyOrder[] = [];
  let nextPageUrl: string | null = `${baseUrl}/orders.json?status=any&limit=${Math.min(limit, 250)}`;

  while (nextPageUrl && allOrders.length < limit) {
    const res = await fetch(nextPageUrl, { headers: buildHeaders(accessToken) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify Orders API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    allOrders.push(...(data.orders || []));
    const linkHeader = res.headers.get("link");
    nextPageUrl = parseLinkHeaderNext(linkHeader);
    if (allOrders.length >= limit) break;
  }

  return allOrders.slice(0, limit);
}

export async function fetchShopifyLocations(
  storeUrl: string,
  accessToken: string
): Promise<{ id: number; name: string }[]> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/locations.json`, {
    headers: buildHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Shopify locations: ${res.status}`);
  }
  const data = await res.json();
  return (data.locations || []).map((loc: any) => ({ id: loc.id, name: loc.name }));
}

export async function setShopifyInventoryLevel(
  storeUrl: string,
  accessToken: string,
  inventoryItemId: string,
  locationId: number,
  available: number
): Promise<void> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/inventory_levels/set.json`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      inventory_item_id: Number(inventoryItemId),
      location_id: locationId,
      available,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set Shopify inventory: ${res.status} ${text}`);
  }
}
