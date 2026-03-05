import { storage } from "./storage";
import { fetchShopifyLocations, setShopifyInventoryLevel } from "./shopify-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
let isSyncing = false;

const locationCache = new Map<string, number>();

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
      const storeTokenMap = new Map<string, string>();
      for (const integ of integrations) {
        if (integ.isActive) {
          storeTokenMap.set(integ.storeUrl, integ.accessToken);
        }
      }

      let updated = 0;
      let errors = 0;

      for (const product of writebackProducts) {
        try {
          const accessToken = storeTokenMap.get(product.shopifyStoreUrl!);
          if (!accessToken) continue;

          const locationId = await getLocationId(product.shopifyStoreUrl!, accessToken);
          await setShopifyInventoryLevel(
            product.shopifyStoreUrl!,
            accessToken,
            product.shopifyInventoryItemId!,
            locationId,
            product.zohoInventoryQuantity!
          );
          updated++;
        } catch (err: any) {
          errors++;
          log(`Writeback error for product ${product.id}: ${err.message}`, "writeback");
        }
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
