import { storage } from "./storage";
import { fetchShopifyOrders } from "./shopify-api";
import { fetchWooOrders, normalizeWooOrders } from "./woocommerce-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
let isSyncing = false;

export async function syncOrdersForIntegration(integration: { id: number; contactId: number; storeUrl: string; accessToken: string; shopName: string | null; platform?: string; platformConfig?: any }) {
  const platform = integration.platform ?? "shopify";
  let orders;
  if (platform === "woocommerce") {
    const consumerSecret = integration.platformConfig?.consumerSecret ?? "";
    const rawOrders = await fetchWooOrders(integration.storeUrl, integration.accessToken, consumerSecret, 100);
    orders = normalizeWooOrders(rawOrders, integration.id, integration.contactId, integration.storeUrl, integration.shopName);
  } else {
    const rawOrders = await fetchShopifyOrders(integration.storeUrl, integration.accessToken, 250);
    orders = rawOrders.map((o) => ({
      integrationId: integration.id,
      contactId: integration.contactId,
      shopifyOrderId: String(o.id),
      name: o.name,
      shopifyCreatedAt: o.created_at ? new Date(o.created_at) : null,
      financialStatus: o.financial_status ?? null,
      fulfillmentStatus: o.fulfillment_status ?? null,
      totalPrice: o.total_price ?? "0",
      currency: o.currency ?? "CAD",
      email: o.email ?? null,
      customerFirstName: o.customer?.first_name ?? null,
      customerLastName: o.customer?.last_name ?? null,
      lineItems: (o.line_items ?? []) as any,
      shopName: integration.shopName,
      storeUrl: integration.storeUrl,
    }));
  }

  await storage.upsertShopifyOrdersByIntegration(integration.id, orders);
  await storage.updateShopifyIntegration(integration.id, { lastOrderSyncAt: new Date() } as any);
  return orders.length;
}

export function startShopifyOrdersSyncScheduler() {
  log("Shopify orders auto-sync scheduler started (checks every 60s)", "orders-sync");

  setInterval(async () => {
    if (isSyncing) {
      log("Orders auto-sync already in progress, skipping this cycle", "orders-sync");
      return;
    }
    isSyncing = true;
    try {
      const integrations = await storage.getShopifyIntegrationsDueForOrderSync();
      if (integrations.length === 0) return;

      log(`Found ${integrations.length} integration(s) due for order sync`, "orders-sync");

      for (const integration of integrations) {
        try {
          const count = await syncOrdersForIntegration(integration);
          log(`Orders auto-sync: upserted ${count} orders for integration ${integration.id} (${integration.storeUrl})`, "orders-sync");
          await storage.createActivityLog({
            type: "shopify_orders_sync",
            status: "success",
            message: `Orders auto-sync: ${count} order${count !== 1 ? "s" : ""} updated from ${integration.storeUrl}`,
          });
        } catch (err: any) {
          log(`Orders auto-sync error for integration ${integration.id}: ${err.message}`, "orders-sync");
          await storage.createActivityLog({
            type: "shopify_orders_sync",
            status: "error",
            message: `Orders auto-sync failed for ${integration.storeUrl}: ${err.message}`,
          });
        }
      }
    } catch (err: any) {
      log(`Orders auto-sync scheduler error: ${err.message}`, "orders-sync");
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
