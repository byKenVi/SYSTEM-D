import { storage } from "./storage";
import { fetchZohoItemsMapLite } from "./zoho-api";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000;
let isSyncing = false;

export function startZohoSyncScheduler() {
  log("Zoho auto-sync scheduler started (checks every 60s)", "zoho-sync");

  setInterval(async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const settings = await storage.getAdminSettings();
      if (!settings) return;

      const freq = settings.zohoSyncFrequencyMinutes ?? 0;
      if (freq === 0) return;

      if (!settings.zohoInventoryRefreshToken) return;

      const now = new Date();
      const lastSync = settings.zohoLastAutoSyncAt;
      const elapsedMs = lastSync ? now.getTime() - lastSync.getTime() : Infinity;
      const freqMs = freq * 60 * 1000;

      if (elapsedMs < freqMs) return;

      log(`Zoho auto-sync starting (every ${freq} min)`, "zoho-sync");

      const allProducts = await storage.getProducts();
      const pushedProducts = allProducts.filter((p) => p.pushedToZoho && p.zohoItemId && !p.zohoItemId.startsWith("pending-"));

      if (pushedProducts.length === 0) {
        // Use targeted update — never spread full settings to avoid overwriting
        // a concurrent token refresh or other settings change.
        await storage.updateZohoLastSyncAt(now);
        return;
      }

      // Use the lightweight list-only fetcher to avoid per-item API calls.
      // fetchZohoItemsMapLite uses O(pages) calls instead of O(items) calls,
      // which prevents exhausting Zoho's 7,500-call/day rate limit.
      const itemsMap = await fetchZohoItemsMapLite();

      let updated = 0;
      for (const product of pushedProducts) {
        const zohoData = itemsMap.get(product.zohoItemId!);
        if (!zohoData) continue;
        await storage.updateProduct(product.id, {
          zohoInventoryQuantity: zohoData.stock,
          lastSyncedAt: new Date(),
        });
        updated++;
      }

      await storage.updateZohoLastSyncAt(now);

      log(`Zoho auto-sync: updated ${updated} product(s)`, "zoho-sync");
      await storage.createActivityLog({
        type: "zoho_inventory_sync",
        status: "success",
        message: `Zoho auto-sync: updated stock for ${updated} product${updated !== 1 ? "s" : ""}`,
      });
    } catch (err: any) {
      // 429 rate-limit: Zoho's daily API call budget is exhausted.
      // Skip this cycle silently — the next scheduled run will retry.
      // Do NOT log it as a persistent error; it resolves itself within 24 h.
      if (err.message?.includes("429")) {
        log("Zoho auto-sync skipped: API rate limit reached (429). Will retry next cycle.", "zoho-sync");
        return;
      }
      log(`Zoho auto-sync error: ${err.message}`, "zoho-sync");
      await storage.createActivityLog({
        type: "zoho_inventory_sync",
        status: "error",
        message: `Zoho auto-sync failed: ${err.message}`,
      }).catch((logErr) => console.error("[zoho-sync] Failed to write error to activity log:", logErr));
    } finally {
      isSyncing = false;
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
