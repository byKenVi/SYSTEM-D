/**
 * Ajoute les colonnes d'adresse à shopify_orders si elles n'existent pas.
 * Idempotent et non destructif (ADD COLUMN IF NOT EXISTS). À lancer une fois
 * sur Replit si l'app n'a pas encore été redémarrée après le pull :
 *
 *   npx tsx scripts/migrate-address-columns.ts
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS billing_address JSONB`);
  await db.execute(sql`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS shipping_address JSONB`);
  console.log("[migrate] Colonnes billing_address / shipping_address prêtes sur shopify_orders.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] Erreur :", err.message);
    process.exit(1);
  });
