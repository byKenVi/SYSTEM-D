import crypto from "crypto";
import type { ParsedQs } from "qs";

const SHOPIFY_API_VERSION = "2025-04";
const SHOPIFY_ORDER_CREATE_API_VERSION = "2026-04";

export type ShopifyClientCredentialsFailureCode = "shop_not_permitted" | "token_request_failed";

export class ShopifyClientCredentialsError extends Error {
  readonly code: ShopifyClientCredentialsFailureCode;
  readonly status: number;

  constructor(
    message: string,
    code: ShopifyClientCredentialsFailureCode,
    status: number,
  ) {
    super(message);
    this.name = "ShopifyClientCredentialsError";
    this.code = code;
    this.status = status;
  }
}

export const SHOPIFY_OFFLINE_SCOPES = [
  "read_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_customers",
  "read_orders",
  "write_orders",
  "read_draft_orders",
  "write_draft_orders",
  "read_store_credit_accounts",
  "read_store_credit_account_transactions",
  "write_store_credit_account_transactions",
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
    // Shopify issues an offline token by default when grant_options[] is omitted.
    // Offline tokens stay valid until the app is revoked or uninstalled.
    scope: SHOPIFY_OFFLINE_SCOPES,
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

export async function requestShopifyClientCredentialsToken(
  storeUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number; scope: string | null }> {
  const domain = normalizeDomain(storeUrl);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const shopifyCode = typeof payload.error === "string" ? payload.error : "";
    if (shopifyCode === "shop_not_permitted") {
      throw new ShopifyClientCredentialsError(
        "Shopify refuse client_credentials pour cette boutique. Une autorisation OAuth avec une APP_URL stable est requise.",
        "shop_not_permitted",
        res.status,
      );
    }
    throw new ShopifyClientCredentialsError(
      `Shopify a refusé la connexion serveur (${res.status}).`,
      "token_request_failed",
      res.status,
    );
  }
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ShopifyClientCredentialsError(
      "Shopify n’a pas retourné un token serveur valide.",
      "token_request_failed",
      res.status,
    );
  }
  return {
    accessToken,
    expiresIn,
    scope: typeof payload.scope === "string" ? payload.scope : null,
  };
}

export async function getShopIdentityGraphQL(
  storeUrl: string,
  accessToken: string,
): Promise<{ name: string; domain: string }> {
  const domain = normalizeDomain(storeUrl);
  const res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ query: "{ shop { name myshopifyDomain } }" }),
  });
  if (!res.ok) throw new Error(`Shopify connection test failed (${res.status}).`);
  const payload = await res.json() as any;
  if (payload.errors?.length || !payload.data?.shop?.myshopifyDomain) {
    throw new Error("Shopify connection test returned an invalid GraphQL response.");
  }
  return {
    name: payload.data.shop.name,
    domain: payload.data.shop.myshopifyDomain,
  };
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
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (value != null) {
      params.set(key, String(value));
    }
  }
  return verifyShopifyCallbackHmac(params.toString(), clientSecret);
}

/**
 * Validates Shopify's callback HMAC against the raw query string. Keeping the
 * original encoded pairs avoids changing a value before signature validation.
 */
export function verifyShopifyCallbackHmac(rawQuery: string, clientSecret: string): boolean {
  const pairs = rawQuery.split("&").filter(Boolean);
  let receivedHmac: string | null = null;
  const signedPairs: string[] = [];

  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    if (key === "hmac") {
      receivedHmac = decodeURIComponent(rawValue.replace(/\+/g, " "));
      continue;
    }
    if (key !== "signature") signedPairs.push(pair);
  }

  if (!receivedHmac || !/^[a-f0-9]{64}$/i.test(receivedHmac)) return false;

  const keyForSort = (pair: string) => {
    const separator = pair.indexOf("=");
    return separator === -1 ? pair : pair.slice(0, separator);
  };
  const message = signedPairs
    .sort((left, right) => keyForSort(left).localeCompare(keyForSort(right)))
    .join("&");
  const expected = crypto.createHmac("sha256", clientSecret).update(message).digest();
  const actual = Buffer.from(receivedHmac, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

export type ShopifyFailureKind = "invalid_token" | "permission_insufficient" | "throttled" | "transient";

/**
 * Only an explicit 401 can invalidate a Shopify installation. Quotas,
 * permissions, server responses and network faults keep the installation
 * connected and are handled without an OAuth reconnect prompt.
 */
export function classifyShopifyFailure(error: unknown): ShopifyFailureKind {
  const candidate = error as { message?: unknown; status?: unknown } | undefined;
  const message = typeof candidate?.message === "string" ? candidate.message : String(error ?? "");
  if (candidate?.status === 401 || /\b401\b/.test(message)) return "invalid_token";
  if (candidate?.status === 403 || /\b403\b/.test(message) || /scope|permission|access denied/i.test(message)) {
    return "permission_insufficient";
  }
  if (candidate?.status === 429 || /\b429\b/.test(message) || /rate.?limit|throttl/i.test(message)) return "throttled";
  return "transient";
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

function toShopifyGid(resource: "Customer" | "ProductVariant" | "DraftOrder" | "Order", id: string): string {
  const value = String(id).trim();
  return value.startsWith("gid://shopify/") ? value : `gid://shopify/${resource}/${value}`;
}

async function shopifyAdminGraphQL<T>(
  storeUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${buildBaseUrl(storeUrl)}/graphql.json`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ query, variables }),
  });
  const payload = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    throw new Error(`Shopify Admin API error ${res.status}.`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error: any) => error.message).join("; "));
  }
  return payload.data as T;
}

export type ShopifyOrderCreateOutcome = "rejected" | "unknown";

export class ShopifyOrderCreateError extends Error {
  readonly outcome: ShopifyOrderCreateOutcome;

  constructor(
    message: string,
    outcome: ShopifyOrderCreateOutcome,
  ) {
    super(message);
    this.name = "ShopifyOrderCreateError";
    this.outcome = outcome;
  }
}

export interface ShopifyCreatedOrder {
  id: string;
  legacyResourceId: string;
  name: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalAmount: string;
  currencyCode: string;
}

function mapCreatedOrder(order: any): ShopifyCreatedOrder {
  return {
    id: order.id,
    legacyResourceId: String(order.legacyResourceId),
    name: order.name,
    displayFinancialStatus: order.displayFinancialStatus,
    displayFulfillmentStatus: order.displayFulfillmentStatus,
    totalAmount: order.totalPriceSet.shopMoney.amount,
    currencyCode: order.totalPriceSet.shopMoney.currencyCode,
  };
}

const SYSTEMD_ORDER_FIELDS = `
  id legacyResourceId name displayFinancialStatus displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } }
`;

/**
 * Creates the Shopify order only after Système D has an independently verified
 * Store Credit debit. The transaction references that debit in Shopify's order
 * timeline; the Système D order id is also searchable as a unique tag/source id.
 */
export async function createPaidShopifyOrder(input: {
  storeUrl: string;
  accessToken: string;
  customerId: string;
  variantId: string;
  quantity: number;
  unitAmount: string;
  amount: string;
  currencyCode: "CAD";
  systemdOrderId: number;
  storeCreditTransactionId: string;
}): Promise<ShopifyCreatedOrder> {
  let res: Response;
  try {
    res = await fetch(
      `https://${normalizeDomain(input.storeUrl)}/admin/api/${SHOPIFY_ORDER_CREATE_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: buildHeaders(input.accessToken),
        body: JSON.stringify({
          query: `mutation systemdOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
            orderCreate(order: $order, options: $options) {
              order { ${SYSTEMD_ORDER_FIELDS} }
              userErrors { field message }
            }
          }`,
          variables: {
            order: {
              lineItems: [{
                variantId: toShopifyGid("ProductVariant", input.variantId),
                quantity: input.quantity,
                priceSet: {
                  shopMoney: { amount: input.unitAmount, currencyCode: input.currencyCode },
                  presentmentMoney: { amount: input.unitAmount, currencyCode: input.currencyCode },
                },
              }],
              customer: { toAssociate: { id: toShopifyGid("Customer", input.customerId) } },
              financialStatus: "PAID",
              currency: input.currencyCode,
              presentmentCurrency: input.currencyCode,
              sourceIdentifier: `systemd-${input.systemdOrderId}`,
              tags: ["systeme-d", "client-product", `systemd-order-${input.systemdOrderId}`],
              note: `Commande produit client Système D #${input.systemdOrderId}. Débit Store Credit ${input.storeCreditTransactionId}`,
              customAttributes: [
                { key: "systemd_order_id", value: String(input.systemdOrderId) },
                { key: "store_credit_transaction_id", value: input.storeCreditTransactionId },
              ],
              transactions: [{
                amountSet: {
                  shopMoney: { amount: input.amount, currencyCode: input.currencyCode },
                  presentmentMoney: { amount: input.amount, currencyCode: input.currencyCode },
                },
                gateway: "Store Credit (Système D)",
                kind: "SALE",
                status: "SUCCESS",
                authorizationCode: input.storeCreditTransactionId,
              }],
            },
            options: {
              inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
              sendReceipt: true,
            },
          },
        }),
      },
    );
  } catch {
    throw new ShopifyOrderCreateError(
      "Réponse Shopify absente pendant la création de la commande.",
      "unknown",
    );
  }

  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || !payload) {
    throw new ShopifyOrderCreateError(
      `Réponse Shopify non concluante pendant la création de la commande (${res.status}).`,
      res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? "rejected" : "unknown",
    );
  }
  if (payload.errors?.length) {
    const message = payload.errors.map((error: any) => error.message).join("; ");
    const deterministic = /access denied|permission|scope|unknown argument|variable .* invalid|field .* doesn't exist/i.test(message);
    throw new ShopifyOrderCreateError(
      message,
      deterministic ? "rejected" : "unknown",
    );
  }
  const result = payload.data?.orderCreate;
  if (result?.userErrors?.length) {
    throw new ShopifyOrderCreateError(
      result.userErrors.map((error: any) => error.message).join("; "),
      "rejected",
    );
  }
  if (!result?.order?.id) {
    throw new ShopifyOrderCreateError(
      "Shopify n’a pas retourné la commande créée.",
      "unknown",
    );
  }
  return mapCreatedOrder(result.order);
}

export async function findShopifyOrderBySystemdOrderId(
  storeUrl: string,
  accessToken: string,
  systemdOrderId: number,
): Promise<ShopifyCreatedOrder | null> {
  const data = await shopifyAdminGraphQL<any>(
    storeUrl,
    accessToken,
    `query systemdOrderLookup($query: String!) {
      orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes { ${SYSTEMD_ORDER_FIELDS} tags customAttributes { key value } }
      }
    }`,
    { query: `tag:systemd-order-${systemdOrderId}` },
  );
  const matching = (data.orders?.nodes ?? []).find((order: any) =>
    order.tags?.includes(`systemd-order-${systemdOrderId}`)
    && order.customAttributes?.some((attribute: any) =>
      attribute.key === "systemd_order_id" && attribute.value === String(systemdOrderId),
    ),
  );
  return matching ? mapCreatedOrder(matching) : null;
}

export interface ShopifyDraftCheckout {
  id: string;
  legacyResourceId: string;
  name: string;
  invoiceUrl: string;
  status: "OPEN" | "INVOICE_SENT" | "COMPLETED";
  totalAmount: string;
  currencyCode: string;
}

export async function createShopifyDraftCheckout(input: {
  storeUrl: string;
  accessToken: string;
  customerId: string;
  variantId: string;
  quantity: number;
  systemdOrderId: number;
}): Promise<ShopifyDraftCheckout> {
  const data = await shopifyAdminGraphQL<any>(
    input.storeUrl,
    input.accessToken,
    `mutation systemdDraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id legacyResourceId name invoiceUrl status
          totalPriceSet { presentmentMoney { amount currencyCode } }
        }
        userErrors { field message }
      }
    }`,
    {
      input: {
        customerId: toShopifyGid("Customer", input.customerId),
        lineItems: [{
          variantId: toShopifyGid("ProductVariant", input.variantId),
          quantity: input.quantity,
        }],
        tags: ["systeme-d", "client-product"],
        note: `Commande produit client Système D #${input.systemdOrderId}`,
        customAttributes: [{ key: "systemd_order_id", value: String(input.systemdOrderId) }],
      },
    },
  );
  const errors = data?.draftOrderCreate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((error: any) => error.message).join("; "));
  }
  const draft = data?.draftOrderCreate?.draftOrder;
  const money = draft?.totalPriceSet?.presentmentMoney;
  if (!draft?.id || !draft?.invoiceUrl || !money?.amount || !money?.currencyCode) {
    throw new Error("Shopify n’a pas retourné un checkout de commande provisoire valide.");
  }
  return {
    id: draft.id,
    legacyResourceId: String(draft.legacyResourceId),
    name: draft.name,
    invoiceUrl: draft.invoiceUrl,
    status: draft.status,
    totalAmount: money.amount,
    currencyCode: money.currencyCode,
  };
}

export async function deleteShopifyDraftOrder(
  storeUrl: string,
  accessToken: string,
  draftOrderId: string,
): Promise<void> {
  const data = await shopifyAdminGraphQL<any>(
    storeUrl,
    accessToken,
    `mutation systemdDraftOrderDelete($input: DraftOrderDeleteInput!) {
      draftOrderDelete(input: $input) { deletedId userErrors { field message } }
    }`,
    { input: { id: toShopifyGid("DraftOrder", draftOrderId) } },
  );
  const errors = data?.draftOrderDelete?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((error: any) => error.message).join("; "));
}

export interface ShopifyDraftCheckoutStatus {
  id: string;
  name: string;
  status: "OPEN" | "INVOICE_SENT" | "COMPLETED";
  completedAt: string | null;
  order: null | {
    id: string;
    legacyResourceId: string;
    name: string;
    displayFinancialStatus: string;
    displayFulfillmentStatus: string;
    totalAmount: string;
    currencyCode: string;
    transactions: Array<{ id: string; gateway: string | null; status: string; kind: string }>;
  };
}

export async function fetchShopifyDraftCheckoutStatus(
  storeUrl: string,
  accessToken: string,
  draftOrderId: string,
): Promise<ShopifyDraftCheckoutStatus | null> {
  const data = await shopifyAdminGraphQL<any>(
    storeUrl,
    accessToken,
    `query systemdDraftOrderStatus($id: ID!) {
      draftOrder(id: $id) {
        id name status completedAt
        order {
          id legacyResourceId name displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          transactions(first: 25) { id gateway status kind }
        }
      }
    }`,
    { id: toShopifyGid("DraftOrder", draftOrderId) },
  );
  const draft = data?.draftOrder;
  if (!draft) return null;
  return {
    id: draft.id,
    name: draft.name,
    status: draft.status,
    completedAt: draft.completedAt ?? null,
    order: draft.order ? {
      id: draft.order.id,
      legacyResourceId: String(draft.order.legacyResourceId),
      name: draft.order.name,
      displayFinancialStatus: draft.order.displayFinancialStatus,
      displayFulfillmentStatus: draft.order.displayFulfillmentStatus,
      totalAmount: draft.order.totalPriceSet.shopMoney.amount,
      currencyCode: draft.order.totalPriceSet.shopMoney.currencyCode,
      transactions: draft.order.transactions ?? [],
    } : null,
  };
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

export async function fetchShopifyOrderDetail(
  storeUrl: string,
  accessToken: string,
  orderId: string
): Promise<Record<string, unknown>> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/orders/${orderId}.json`, {
    headers: buildHeaders(accessToken),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Order detail error ${res.status}: ${text}`);
  }
  const data = await res.json() as { order: Record<string, unknown> };
  return data.order;
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

export interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  state: string;
  verified_email: boolean;
  tags: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  default_address?: {
    city: string | null;
    province: string | null;
    country: string | null;
  };
}

export async function fetchShopifyCustomerDetail(
  storeUrl: string,
  accessToken: string,
  customerId: string
): Promise<Record<string, unknown>> {
  const baseUrl = buildBaseUrl(storeUrl);
  const res = await fetch(`${baseUrl}/customers/${customerId}.json`, {
    headers: buildHeaders(accessToken),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Customer detail error ${res.status}: ${text}`);
  }
  const data = await res.json() as { customer: Record<string, unknown> };
  return data.customer;
}

export async function fetchShopifyCustomerOrders(
  storeUrl: string,
  accessToken: string,
  customerId: string,
  limit = 250
): Promise<Record<string, unknown>[]> {
  const baseUrl = buildBaseUrl(storeUrl);
  const allOrders: Record<string, unknown>[] = [];
  let nextUrl: string | null = `${baseUrl}/customers/${customerId}/orders.json?status=any&limit=250`;
  while (nextUrl && allOrders.length < limit) {
    const res = await fetch(nextUrl, { headers: buildHeaders(accessToken) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify customer orders error ${res.status}: ${text}`);
    }
    const data = await res.json() as { orders: Record<string, unknown>[] };
    allOrders.push(...(data.orders ?? []));
    const linkHeader = res.headers.get("link");
    nextUrl = parseLinkHeaderNext(linkHeader);
    if (allOrders.length >= limit) break;
  }
  return allOrders.slice(0, limit);
}

export async function fetchShopifyCustomers(
  storeUrl: string,
  accessToken: string,
  limit = 250
): Promise<ShopifyCustomer[]> {
  const baseUrl = buildBaseUrl(storeUrl);
  const allCustomers: ShopifyCustomer[] = [];
  let nextPageUrl: string | null = `${baseUrl}/customers.json?limit=250`;

  while (nextPageUrl && allCustomers.length < limit) {
    const res = await fetch(nextPageUrl, { headers: buildHeaders(accessToken) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify Customers API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    allCustomers.push(...(data.customers || []));
    const linkHeader = res.headers.get("link");
    nextPageUrl = parseLinkHeaderNext(linkHeader);
    if (allCustomers.length >= limit) break;
  }

  return allCustomers.slice(0, limit);
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
