import crypto from "crypto";
import type { ParsedQs } from "qs";

const SHOPIFY_API_VERSION = "2024-10";

const SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
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
  images: { id: number; src: string }[];
  variants: ShopifyVariant[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string | null;
  inventory_quantity: number;
  inventory_item_id: number;
  inventory_management: string | null;
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
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  price: string;
  inventoryQuantity: number;
}

export function normalizeProducts(shopifyProducts: ShopifyProduct[]): NormalizedProduct[] {
  const results: NormalizedProduct[] = [];

  for (const product of shopifyProducts) {
    for (const variant of product.variants) {
      const name =
        product.variants.length === 1
          ? product.title
          : `${product.title} - ${variant.title}`;

      results.push({
        shopifyProductId: String(product.id),
        shopifyVariantId: String(variant.id),
        name,
        sku: variant.sku || null,
        description: product.body_html
          ? product.body_html.replace(/<[^>]*>/g, "").slice(0, 500)
          : null,
        imageUrl: product.images?.[0]?.src || null,
        price: variant.price,
        inventoryQuantity: variant.inventory_quantity ?? 0,
      });
    }
  }

  return results;
}
