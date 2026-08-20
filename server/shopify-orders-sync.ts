import { storage } from "./storage";
import { classifyShopifyFailure, fetchShopifyOrders } from "./shopify-api";
import { fetchWooOrders, normalizeWooOrders } from "./woocommerce-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const PERMISSION_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
let isSyncing = false;

function retryDelayFor(errorCount: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.min(Math.max(errorCount - 1, 0), 5));
}

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
  await storage.updateShopifyIntegration(integration.id, {
    lastOrderSyncAt: new Date(),
    connectionStatus: "ok",
    consecutiveErrors: 0,
    syncPausedUntil: null,
    lastConnectionError: null,
  } as any);
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
          const failureKind = classifyShopifyFailure(err);
          const errorCount = ((integration as any).consecutiveErrors ?? 0) + 1;
          const syncPausedUntil = failureKind === "invalid_token"
            ? null
            : new Date(Date.now() + (
              failureKind === "permission_insufficient"
                ? PERMISSION_RETRY_DELAY_MS
                : retryDelayFor(errorCount)
            ));
          await storage.updateShopifyIntegration(integration.id, {
            consecutiveErrors: errorCount,
            connectionStatus: failureKind === "invalid_token"
              ? "invalid_token"
              : failureKind === "permission_insufficient"
              ? "permission_insufficient"
              : "error",
            syncPausedUntil,
            lastConnectionError: err.message,
          } as any);
          log(`Orders auto-sync ${failureKind} for integration ${integration.id}`, "orders-sync");
          if (errorCount === 1 || failureKind === "invalid_token" || failureKind === "permission_insufficient") {
            await storage.createActivityLog({
              type: "shopify_orders_sync",
              status: "error",
              message: failureKind === "invalid_token"
                ? `Sync commandes Shopify interrompue pour ${integration.storeUrl} : l'autorisation a été révoquée.`
                : failureKind === "permission_insufficient"
                ? `Sync commandes Shopify suspendue pour ${integration.storeUrl} : autorisation insuffisante.`
                : `Sync commandes Shopify temporairement différée pour ${integration.storeUrl}. Nouvelle tentative automatique prévue.`,
            });
          }
        }
      }
    } catch (err: any) {
      log(`Orders auto-sync scheduler error: ${err.message}`, "orders-sync");
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
