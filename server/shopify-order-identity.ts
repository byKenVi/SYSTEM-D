import type { ShopifyOrder, SystemdOrder } from "@shared/schema";
import { normalizeShopifyStoreUrl } from "@shared/shopify-urls";

/** One operational row per real store/order, even across reconnected integrations. */
export function dedupeOperationalShopifyOrders(orders: ShopifyOrder[]): ShopifyOrder[] {
  const grouped = new Map<string, ShopifyOrder[]>();
  for (const order of orders) {
    const store = normalizeShopifyStoreUrl(order.storeUrl);
    const key = `${store || `integration-${order.integrationId}`}:${order.shopifyOrderId}`;
    grouped.set(key, [...(grouped.get(key) || []), order]);
  }
  return [...grouped.values()].map(group => {
    // Keep the most advanced operational record so reconnecting never reopens work.
    const rank = (order: ShopifyOrder) =>
      order.operationalFulfillmentStatus === "completed" ? 2 : order.operationalFulfillmentStatus === "in_progress" ? 1 : 0;
    const mostAdvanced = [...group].sort((a, b) => rank(b) - rank(a) || Number(b.syncedAt) - Number(a.syncedAt) || b.integrationId - a.integrationId)[0];
    const latest = [...group].sort((a, b) => Number(b.syncedAt) - Number(a.syncedAt) || b.integrationId - a.integrationId)[0];
    return { ...mostAdvanced, financialStatus: latest.financialStatus };
  });
}

export function buildPaidSystemdShopifyKeys(systemdOrders: SystemdOrder[], shopifyOrders: ShopifyOrder[]): Set<string> {
  const keys = new Set<string>();
  for (const order of systemdOrders) {
    if (order.status !== "paid" || !order.shopifyIntegrationId || !order.shopifyOrderId) continue;
    keys.add(`${order.shopifyIntegrationId}:${order.shopifyOrderId}`);
    const linked = shopifyOrders.find(candidate =>
      candidate.integrationId === order.shopifyIntegrationId && candidate.shopifyOrderId === order.shopifyOrderId);
    const linkedStore = normalizeShopifyStoreUrl(linked?.storeUrl);
    if (!linkedStore) continue;
    for (const candidate of shopifyOrders) {
      if (candidate.shopifyOrderId === order.shopifyOrderId && normalizeShopifyStoreUrl(candidate.storeUrl) === linkedStore) {
        keys.add(`${candidate.integrationId}:${candidate.shopifyOrderId}`);
      }
    }
  }
  return keys;
}
