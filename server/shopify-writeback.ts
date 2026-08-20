import { storage } from "./storage";
import { classifyShopifyFailure, fetchShopifyLocations, setShopifyInventoryLevel } from "./shopify-api";
import { setWooProductStock } from "./woocommerce-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const PERMISSION_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
let isSyncing = false;

const locationCache = new Map<string, number>();

function retryDelayFor(errorCount: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.min(Math.max(errorCount - 1, 0), 5));
}

async function getLocationId(storeUrl: string, accessToken: string): Promise<number> {
  const cached = locationCache.get(storeUrl);
  if (cached) return cached;

  const locations = await fetchShopifyLocations(storeUrl, accessToken);
  if (locations.length === 0) {
    throw new Error(`No locations found for store ${storeUrl}`);
  }
  const locationId = locations[0].id;
  locationCache.set(storeUrl, locationId);
  return locationId;
}

export function startShopifyWritebackScheduler() {
  log("Shopify writeback scheduler started (checks every 60s)", "writeback");

  setInterval(async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const settings = await storage.getAdminSettings();
      if (!settings) return;

      const freq = settings.shopifyWritebackFrequencyMinutes ?? 0;
      if (freq === 0) return;

      const now = new Date();
      const lastSync = settings.shopifyWritebackLastSyncAt;
      const elapsedMs = lastSync ? now.getTime() - lastSync.getTime() : Infinity;
      const freqMs = freq * 60 * 1000;

      if (elapsedMs < freqMs) return;

      log(`Shopify writeback starting (every ${freq} min)`, "writeback");

      const allProducts = await storage.getProducts();
      const writebackProducts = allProducts.filter(
        (p) => p.pushedToZoho && p.zohoInventoryQuantity != null && p.shopifyInventoryItemId && p.shopifyStoreUrl
      );

      if (writebackProducts.length === 0) {
        await storage.upsertAdminSettings({ ...settings, shopifyWritebackLastSyncAt: now } as any);
        return;
      }

      const integrations = await storage.getShopifyIntegrations();
      const storeInfoMap = new Map<string, {
        id: number;
        accessToken: string;
        platform: string;
        platformConfig: any;
        consecutiveErrors: number;
      }>();
      for (const integ of integrations) {
        if (
          integ.isActive
          && integ.connectionStatus !== "invalid_token"
          && (!integ.syncPausedUntil || integ.syncPausedUntil <= now)
        ) {
          storeInfoMap.set(integ.storeUrl, {
            id: integ.id,
            accessToken: integ.accessToken,
            platform: (integ as any).platform ?? "shopify",
            platformConfig: (integ as any).platformConfig ?? null,
            consecutiveErrors: integ.consecutiveErrors ?? 0,
          });
        }
      }

      let updated = 0;
      let errors = 0;
      const storesWithErrors = new Set<string>();
      const successfullyWrittenStores = new Map<string, number>();

      for (const product of writebackProducts) {
        try {
          const storeInfo = storeInfoMap.get(product.shopifyStoreUrl!);
          if (!storeInfo || storesWithErrors.has(product.shopifyStoreUrl!)) continue;

          if (storeInfo.platform === "woocommerce") {
            const consumerSecret = storeInfo.platformConfig?.consumerSecret ?? "";
            await setWooProductStock(
              product.shopifyStoreUrl!,
              storeInfo.accessToken,
              consumerSecret,
              product.shopifyInventoryItemId!,
              product.zohoInventoryQuantity!
            );
          } else {
            const locationId = await getLocationId(product.shopifyStoreUrl!, storeInfo.accessToken);
            await setShopifyInventoryLevel(
              product.shopifyStoreUrl!,
              storeInfo.accessToken,
              product.shopifyInventoryItemId!,
              locationId,
              product.zohoInventoryQuantity!
            );
          }
          updated++;
          successfullyWrittenStores.set(product.shopifyStoreUrl!, storeInfo.id);
        } catch (err: any) {
          errors++;
          const storeInfo = storeInfoMap.get(product.shopifyStoreUrl!);
          if (!storeInfo) {
            log(`Writeback error for product ${product.id}: ${err.message}`, "writeback");
            continue;
          }
          storesWithErrors.add(product.shopifyStoreUrl!);
          const failureKind = classifyShopifyFailure(err);
          const errorCount = storeInfo.consecutiveErrors + 1;
          const syncPausedUntil = failureKind === "invalid_token"
            ? null
            : new Date(Date.now() + (
              failureKind === "permission_insufficient"
                ? PERMISSION_RETRY_DELAY_MS
                : retryDelayFor(errorCount)
            ));
          await storage.updateShopifyIntegration(storeInfo.id, {
            consecutiveErrors: errorCount,
            connectionStatus: failureKind === "invalid_token"
              ? "invalid_token"
              : failureKind === "permission_insufficient"
              ? "permission_insufficient"
              : "error",
            syncPausedUntil,
            lastConnectionError: err.message,
          } as any);
          log(`Writeback ${failureKind} for store ${product.shopifyStoreUrl}`, "writeback");
          await storage.createActivityLog({
            type: "shopify_writeback",
            status: "error",
            message: failureKind === "invalid_token"
              ? `Écriture de stock Shopify interrompue pour ${product.shopifyStoreUrl} : l'autorisation a été révoquée.`
              : failureKind === "permission_insufficient"
              ? `Écriture de stock Shopify suspendue pour ${product.shopifyStoreUrl} : autorisation insuffisante.`
              : `Écriture de stock Shopify temporairement différée pour ${product.shopifyStoreUrl}. Nouvelle tentative automatique prévue.`,
          });
        }
      }

      for (const [storeUrl, integrationId] of successfullyWrittenStores) {
        if (storesWithErrors.has(storeUrl)) continue;
        await storage.updateShopifyIntegration(integrationId, {
          connectionStatus: "ok",
          consecutiveErrors: 0,
          syncPausedUntil: null,
          lastConnectionError: null,
        } as any);
      }

      await storage.upsertAdminSettings({ ...settings, shopifyWritebackLastSyncAt: now } as any);

      log(`Shopify writeback: updated ${updated}, errors ${errors}`, "writeback");
      await storage.createActivityLog({
        type: "shopify_writeback",
        status: errors > 0 ? "error" : "success",
        message: `Shopify writeback: pushed Zoho stock to ${updated} product${updated !== 1 ? "s" : ""} on Shopify${errors > 0 ? ` (${errors} error${errors !== 1 ? "s" : ""})` : ""}`,
      });
    } catch (err: any) {
      log(`Shopify writeback scheduler error: ${err.message}`, "writeback");
      await storage.createActivityLog({
        type: "shopify_writeback",
        status: "error",
        message: `Shopify writeback failed: ${err.message}`,
      }).catch(() => {});
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
