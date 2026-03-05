const SHOPIFY_API_VERSION = "2024-10";

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
