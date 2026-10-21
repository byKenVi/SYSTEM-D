/**
 * Rattrapage : crée un devis CRM (+ projet + PDF) pour chaque commande payée
 * déjà en base qui n'en a pas encore (zoho_crm_deal_id vide).
 *
 * À exécuter sur l'environnement Replit (DATABASE_URL + Zoho connecté) :
 *   npx tsx scripts/backfill-crm-deals.ts [--dry-run]
 *
 * Idempotent : relançable sans créer de doublon (les fonctions ensure* sortent
 * si le devis existe déjà).
 */

import { storage } from "../server/storage";
import {
  ensureCrmDealForSystemdOrder,
  ensureCrmDealForShopifyOrder,
  refreshCrmDealDescriptions,
  isShopifyOrderEligibleForOpsQueue,
} from "../server/order-zoho-integration";
import { buildPaidSystemdShopifyKeys } from "../server/shopify-order-identity";

const dryRun = process.argv.includes("--dry-run");
const refresh = process.argv.includes("--refresh");

async function main() {
  // Mode rafraîchissement : met à jour la description des devis DÉJÀ créés
  // (ex. pour appliquer « Commandé par ») sans créer de nouveaux devis.
  if (refresh) {
    console.log("[backfill] Mode --refresh : mise à jour des descriptions des devis existants…");
    const { updated, failed } = await refreshCrmDealDescriptions();
    console.log(`[backfill] Descriptions mises à jour : ${updated}, échecs : ${failed}.`);
    return;
  }

  const [systemdOrders, shopifyOrders] = await Promise.all([
    storage.getSystemdOrders(),
    storage.getShopifyOrders(),
  ]);

  const systemdTargets = systemdOrders.filter(
    (o) => o.status === "paid" && !o.zohoCrmDealId,
  );
  const systemdKeys = buildPaidSystemdShopifyKeys(systemdOrders, shopifyOrders);
  const shopifyTargets = shopifyOrders.filter(
    (o) => !o.zohoCrmDealId && isShopifyOrderEligibleForOpsQueue(o, systemdKeys),
  );

  console.log(`[backfill] Commandes Système D à traiter : ${systemdTargets.length}`);
  console.log(`[backfill] Commandes Shopify directes à traiter : ${shopifyTargets.length}`);
  if (dryRun) {
    console.log("[backfill] --dry-run : aucune écriture.");
    for (const o of systemdTargets) console.log(`  systemd #${o.id} (${o.shopifyOrderName ?? "sans nom"})`);
    for (const o of shopifyTargets) console.log(`  shopify ${o.name} (int ${o.integrationId})`);
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const o of systemdTargets) {
    try {
      await ensureCrmDealForSystemdOrder(o.id);
      ok++;
      console.log(`[backfill] ✓ systemd #${o.id}`);
    } catch (err: any) {
      fail++;
      console.error(`[backfill] ✗ systemd #${o.id}: ${err.message}`);
    }
  }
  for (const o of shopifyTargets) {
    try {
      await ensureCrmDealForShopifyOrder(o.integrationId, o.shopifyOrderId);
      ok++;
      console.log(`[backfill] ✓ shopify ${o.name}`);
    } catch (err: any) {
      fail++;
      console.error(`[backfill] ✗ shopify ${o.name}: ${err.message}`);
    }
  }

  console.log(`[backfill] Terminé. Succès: ${ok}, échecs: ${fail}.`);
  console.log("[backfill] Vérifiez l'Activity Log pour le détail des devis créés.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] Erreur fatale:", err);
    process.exit(1);
  });
