import { storage } from "./storage";
import { fetchAllProducts, normalizeProducts } from "./shopify-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
let isSyncing = false;

export function startShopifySyncScheduler() {
  log("Shopify auto-sync scheduler started (checks every 60s)", "sync");

  setInterval(async () => {
    if (isSyncing) {
      log("Auto-sync already in progress, skipping this cycle", "sync");
      return;
    }
    isSyncing = true;
    try {
      const integrations = await storage.getShopifyIntegrationsDueForSync();
      if (integrations.length === 0) return;

      log(`Found ${integrations.length} integration(s) due for sync`, "sync");

      for (const integration of integrations) {
        try {
          const existingProducts = await storage.getProductsByContactId(integration.contactId);
          const importedVariantIds = new Set(
            existingProducts.filter((p) => p.shopifyVariantId).map((p) => p.shopifyVariantId!)
          );

          if (importedVariantIds.size === 0) {
            await storage.updateShopifyIntegration(integration.id, { lastAutoSyncAt: new Date() } as any);
            continue;
          }

          const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.accessToken);
          const normalized = normalizeProducts(shopifyProducts);

          const existingByVariant = new Map(
            existingProducts.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId!, p])
          );

          let updated = 0;
          for (const p of normalized) {
            if (!importedVariantIds.has(p.shopifyVariantId)) continue;

            const existing = existingByVariant.get(p.shopifyVariantId);
            const useZohoInventory = existing?.pushedToZoho && existing.zohoInventoryQuantity != null;

            await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
              contactId: integration.contactId,
              shopifyProductId: p.shopifyProductId,
              shopifyVariantId: p.shopifyVariantId,
              shopifyStoreUrl: integration.storeUrl,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode,
              description: p.description,
              imageUrl: p.imageUrl,
              vendor: p.vendor,
              productType: p.productType,
              tags: p.tags,
              weight: p.weight,
              weightUnit: p.weightUnit,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              inventoryQuantity: useZohoInventory ? existing.zohoInventoryQuantity! : p.inventoryQuantity,
              zohoInventoryQuantity: existing?.zohoInventoryQuantity ?? null,
              shopifyStatus: p.shopifyStatus,
              shopifyHandle: p.shopifyHandle,
              pushedToZoho: existing?.pushedToZoho ?? false,
              zohoItemId: existing?.zohoItemId ?? null,
              lastSyncedAt: new Date(),
            });
            updated++;
          }

          await storage.updateShopifyIntegration(integration.id, { lastAutoSyncAt: new Date() } as any);
          log(`Auto-synced ${updated} products for integration ${integration.id} (${integration.storeUrl})`, "sync");
        } catch (err: any) {
          log(`Auto-sync error for integration ${integration.id}: ${err.message}`, "sync");
        }
      }
    } catch (err: any) {
      log(`Auto-sync scheduler error: ${err.message}`, "sync");
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
