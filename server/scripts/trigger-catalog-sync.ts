/**
 * One-shot script: triggers a full Zoho catalog sync and prints the result.
 * Usage: npx tsx server/scripts/trigger-catalog-sync.ts
 */
import { syncFullZohoCatalog } from "../zoho-catalog.js";
import { pool } from "../db.js";

async function main() {
  try {
    console.log("Démarrage du sync catalogue Zoho (mode: manual)...\n");
    const result = await syncFullZohoCatalog("manual");
    console.log("Résultat:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("ERREUR:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
