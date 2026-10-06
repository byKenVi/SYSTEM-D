/** Host-only identity, shared by Shopify links and cached-order deduplication. */
export function normalizeShopifyStoreUrl(value: string | null | undefined): string {
  let normalized = String(value ?? "").trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  normalized = normalized.trim().toLowerCase();
  if (!normalized) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return normalized.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0].replace(/\.$/, "");
  }
}

export function shopifyAdminUrl(
  store: string | null | undefined,
  resource?: "orders" | "customers",
  id?: string | number | null,
): string | undefined {
  const host = normalizeShopifyStoreUrl(store);
  if (!host || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || !host.includes(".")) return undefined;
  if (!resource) return `https://${host}/admin`;
  if (!/^\d+$/.test(String(id ?? ""))) return undefined;
  return `https://${host}/admin/${resource}/${id}`;
}
