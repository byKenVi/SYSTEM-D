import { storage } from "./storage";
import { fetchAllProducts, normalizeProducts } from "./shopify-api";
import { fetchWooProducts } from "./woocommerce-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_ERRORS = 5;
const PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
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
        // Skip if sync is paused due to consecutive errors
        if (integration.syncPausedUntil && new Date(integration.syncPausedUntil) > new Date()) {
          log(`Skipping paused integration ${integration.id} (${integration.storeUrl}) — paused until ${integration.syncPausedUntil}`, "sync");
          continue;
        }

        try {
          const existingProducts = await storage.getProductsByContactId(integration.contactId);
          const importedVariantIds = new Set(
            existingProducts.filter((p) => p.shopifyVariantId).map((p) => p.shopifyVariantId!)
          );

          // If nothing imported yet, skip — admin should do first import manually
          if (importedVariantIds.size === 0) {
            await storage.updateShopifyIntegration(integration.id, { lastAutoSyncAt: new Date() } as any);
            continue;
          }

          const platform = (integration as any).platform ?? "shopify";
          let normalized;
          if (platform === "woocommerce") {
            const cfg = (integration as any).platformConfig as { consumerSecret?: string } | null;
            normalized = await fetchWooProducts(integration.storeUrl, integration.accessToken, cfg?.consumerSecret ?? "");
          } else {
            const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.accessToken);
            normalized = normalizeProducts(shopifyProducts);
          }

          const existingByVariant = new Map(
            existingProducts.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId!, p])
          );

          let updated = 0;
          let added = 0;
          for (const p of normalized) {
            const isNew = !importedVariantIds.has(p.shopifyVariantId);
            const existing = existingByVariant.get(p.shopifyVariantId);

            // For new products: simply upsert with Shopify data
            if (isNew) {
              await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
                contactId: integration.contactId,
                shopifyProductId: p.shopifyProductId,
                shopifyVariantId: p.shopifyVariantId,
                shopifyInventoryItemId: p.shopifyInventoryItemId,
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
                inventoryQuantity: p.inventoryQuantity,
                zohoInventoryQuantity: null,
                shopifyStatus: p.shopifyStatus,
                shopifyHandle: p.shopifyHandle,
                pushedToZoho: false,
                zohoItemId: null,
                lastSyncedAt: new Date(),
              });
              added++;
              continue;
            }

            // For existing products: apply Zoho stock priority logic
            const zohoQty = existing?.zohoInventoryQuantity ?? null;
            const zohoIsZeroWithPositiveShopify =
              existing?.pushedToZoho &&
              zohoQty === 0 &&
              p.inventoryQuantity > 0;
            const useZohoInventory =
              existing?.pushedToZoho &&
              zohoQty != null &&
              !zohoIsZeroWithPositiveShopify;

            if (zohoIsZeroWithPositiveShopify) {
              storage
                .createActivityLog({
                  type: "zoho_inventory_sync",
                  status: "error",
                  message: `Stock discrepancy for "${existing!.name}" (SKU: ${existing!.sku || "—"}): Zoho reports 0 but Shopify has ${p.inventoryQuantity}. Keeping Shopify value.`,
                })
                .catch((e) => console.error("[shopify-sync] Failed to log stock discrepancy:", e));
            }

            await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
              contactId: integration.contactId,
              shopifyProductId: p.shopifyProductId,
              shopifyVariantId: p.shopifyVariantId,
              shopifyInventoryItemId: p.shopifyInventoryItemId,
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

          // Success — reset error counters
          await storage.updateShopifyIntegration(integration.id, {
            lastAutoSyncAt: new Date(),
            consecutiveErrors: 0,
            connectionStatus: "ok",
            syncPausedUntil: null,
            lastConnectionError: null,
          } as any);

          const summary = [
            updated > 0 && `${updated} mis à jour`,
            added > 0 && `${added} nouveau${added > 1 ? "x" : ""}`,
          ].filter(Boolean).join(", ");
          log(`Auto-synced (${summary || "aucun changement"}) for integration ${integration.id} (${integration.storeUrl})`, "sync");
          if (updated > 0 || added > 0) {
            await storage.createActivityLog({ type: "shopify_auto_sync", status: "success", message: `Auto-sync : ${summary} produit(s) depuis ${integration.storeUrl}` });
          }
        } catch (err: any) {
          const is401 = err.message?.includes("401");
          const is429 = err.message?.includes("429") || err.message?.toLowerCase().includes("rate limit");
          const prevErrors = (integration as any).consecutiveErrors ?? 0;
          // Rate-limit (429) is transient — don't increment the consecutive error counter
          const newConsecutiveErrors = is429 ? prevErrors : prevErrors + 1;
          const shouldPause = newConsecutiveErrors >= MAX_CONSECUTIVE_ERRORS;

          const updateData: Record<string, any> = {
            consecutiveErrors: newConsecutiveErrors,
            connectionStatus: is401 ? "invalid_token" : "error",
            lastConnectionError: err.message,
          };
          if (shouldPause) {
            updateData.syncPausedUntil = new Date(Date.now() + PAUSE_DURATION_MS);
          }
          await storage.updateShopifyIntegration(integration.id, updateData as any);

          // Only log on first error or when pausing — avoid flooding activity_logs
          if (newConsecutiveErrors === 1 || shouldPause) {
            const msg = shouldPause
              ? `Sync suspendue pour ${integration.storeUrl} après ${newConsecutiveErrors} erreurs consécutives (reprise dans 30 min). Erreur : ${err.message}`
              : `Auto-sync error for integration ${integration.id}: ${err.message}`;
            log(msg, "sync");
            await storage.createActivityLog({
              type: "shopify_auto_sync",
              status: "error",
              message: shouldPause
                ? `Sync Shopify suspendue pour ${integration.storeUrl} — token invalide ou store inaccessible. Reprise automatique dans 30 min.`
                : `Auto-sync failed for ${integration.storeUrl}: ${err.message}`,
            });
          }
        }
      }
    } catch (err: any) {
      log(`Auto-sync scheduler error: ${err.message}`, "sync");
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
