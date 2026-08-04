/**
 * zoho-sync.ts
 *
 * Scheduler for the Zoho Inventory full-catalog synchronisation.
 *
 * Replaces the old "lite stock sync" (which only updated zohoInventoryQuantity
 * in the products table). The new scheduler calls syncFullZohoCatalog(), which
 * fetches ALL items and populates the zoho_catalog local cache.
 *
 * Frequency: controlled by zohoSyncFrequencyMinutes in admin_settings.
 * Recommended value: 720 (12 hours). Values below 60 min are warned against
 * because the full sync uses O(pages + N) Zoho API calls.
 *
 * Advisory lock inside syncFullZohoCatalog() prevents concurrent runs even if
 * the scheduler fires while a manual sync is in progress.
 */

import { storage } from "./storage";
import { syncFullZohoCatalog } from "./zoho-catalog";
import { log } from "./index";

const SYNC_CHECK_INTERVAL_MS = 60_000; // check every 60s whether a sync is due

export function startZohoSyncScheduler() {
  log("Zoho catalog sync scheduler started (checks every 60s)", "zoho-sync");

  setInterval(async () => {
    try {
      const settings = await storage.getAdminSettings();
      if (!settings) return;

      const freq = settings.zohoSyncFrequencyMinutes ?? 0;
      if (freq === 0) return; // sync disabled

      if (!settings.zohoInventoryRefreshToken) return; // Zoho not connected

      if (freq > 0 && freq < 60) {
        log(
          `Warning: zohoSyncFrequencyMinutes=${freq} is low for a full catalog sync. ` +
          `Recommended minimum is 60 min (720 for 12h). This uses O(pages + N) Zoho API calls.`,
          "zoho-sync"
        );
      }

      const now = new Date();
      const lastSync = settings.zohoLastAutoSyncAt;
      const elapsedMs = lastSync ? now.getTime() - lastSync.getTime() : Infinity;
      const freqMs = freq * 60 * 1_000;

      if (elapsedMs < freqMs) return; // not due yet

      log(`Zoho catalog sync due (every ${freq} min) — starting full sync`, "zoho-sync");

      const result = await syncFullZohoCatalog("scheduler");

      if (result.skipped) {
        log(`Zoho catalog sync skipped: ${result.reason}`, "zoho-sync");
        return;
      }

      // Update the last-sync timestamp so the next cycle waits correctly
      await storage.updateZohoLastSyncAt(now);

    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.includes("QUOTA_EXHAUSTED")) {
        log("Zoho catalog sync skipped: API rate limit reached (429). Will retry next cycle.", "zoho-sync");
        return;
      }
      log(`Zoho catalog sync error: ${err.message}`, "zoho-sync");
    }
  }, SYNC_CHECK_INTERVAL_MS);
}
