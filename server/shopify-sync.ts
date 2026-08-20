import { storage } from "./storage";
import { classifyShopifyFailure, fetchAllProducts, normalizeProducts } from "./shopify-api";
import { fetchWooProducts } from "./woocommerce-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const PERMISSION_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
let isSyncing = false;

function retryDelayFor(errorCount: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.min(Math.max(errorCount - 1, 0), 5));
}

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
          const failureKind = classifyShopifyFailure(err);
          const prevErrors = (integration as any).consecutiveErrors ?? 0;
          const newConsecutiveErrors = prevErrors + 1;
          const pauseUntil = failureKind === "invalid_token"
            ? null
            : new Date(Date.now() + (
              failureKind === "permission_insufficient"
                ? PERMISSION_RETRY_DELAY_MS
                : retryDelayFor(newConsecutiveErrors)
            ));

          const updateData: Record<string, any> = {
            consecutiveErrors: newConsecutiveErrors,
            connectionStatus: failureKind === "invalid_token"
              ? "invalid_token"
              : failureKind === "permission_insufficient"
              ? "permission_insufficient"
              : "error",
            lastConnectionError: err.message,
            syncPausedUntil: pauseUntil,
          };
          await storage.updateShopifyIntegration(integration.id, updateData as any);

          // Log the first issue and explicit authorization/scope failures. A
          // retry delay prevents transient faults from flooding this journal.
          if (newConsecutiveErrors === 1 || failureKind === "invalid_token" || failureKind === "permission_insufficient") {
            const msg = failureKind === "invalid_token"
              ? `Sync Shopify arrêtée : autorisation révoquée pour ${integration.storeUrl}.`
              : failureKind === "permission_insufficient"
              ? `Sync Shopify suspendue : autorisation insuffisante pour ${integration.storeUrl}.`
              : `Sync Shopify différée jusqu'à ${pauseUntil?.toLocaleTimeString("fr-CA")} après une erreur ${failureKind}.`;
            log(msg, "sync");
            await storage.createActivityLog({
              type: "shopify_auto_sync",
              status: "error",
              message: failureKind === "invalid_token"
                ? `Sync Shopify interrompue pour ${integration.storeUrl} : l'autorisation a été révoquée et doit être renouvelée via OAuth.`
                : failureKind === "permission_insufficient"
                ? `Sync Shopify suspendue pour ${integration.storeUrl} : une autorisation Shopify requise est absente.`
                : `Sync Shopify temporairement différée pour ${integration.storeUrl}. Nouvelle tentative automatique prévue.`,
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
