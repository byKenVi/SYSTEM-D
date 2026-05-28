import { db } from "./db";
import { mapiReps } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getRepBalance } from "./mapi-rep-budget";
import { log } from "./index";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function refreshAllBalances() {
  try {
    const reps = await db.select().from(mapiReps).where(eq(mapiReps.status, "active"));
    if (reps.length === 0) return;

    let updated = 0;
    for (const rep of reps) {
      try {
        const balances = await getRepBalance(rep.shopifyCustomerGid);
        const cad = balances.find((b) => b.currencyCode === "CAD") ?? balances[0];
        if (cad) {
          await db
            .update(mapiReps)
            .set({
              currentBalance: cad.amount,
              currentBalanceCurrency: cad.currencyCode,
              lastBalanceRefreshAt: new Date(),
            })
            .where(eq(mapiReps.id, rep.id));
          updated++;
        }
      } catch (err: any) {
        console.error(`[mapi-refresh] Failed to refresh balance for rep ${rep.id}: ${err.message}`);
      }
    }
    log(`Balance refresh: updated ${updated}/${reps.length} reps`, "mapi-refresh");
  } catch (err: any) {
    console.error("[mapi-refresh] Scheduler error:", err.message);
  }
}

export function startMapiBalanceRefreshScheduler() {
  log("MAPI balance refresh scheduler started (every 15 min)", "mapi-refresh");
  setInterval(refreshAllBalances, REFRESH_INTERVAL_MS);
}
