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
  remigrateCrmDealsToSalesOrders,
  syncOrderAddressesFromShopify,
  isShopifyOrderEligibleForOpsQueue,
} from "../server/order-zoho-integration";
import { buildPaidSystemdShopifyKeys } from "../server/shopify-order-identity";

const dryRun = process.argv.includes("--dry-run");
const refresh = process.argv.includes("--refresh");
const remigrate = process.argv.includes("--remigrate");
const reset = process.argv.includes("--reset");
const addresses = process.argv.includes("--addresses");

async function main() {
  // Mode adresses : va chercher les adresses sur Shopify et les pousse en base
  // + sur la commande client CRM (sans re-sync ni redéploiement).
  if (addresses) {
    console.log("[backfill] Mode --addresses : récupération des adresses depuis Shopify…");
    const { updated, noAddress, failed } = await syncOrderAddressesFromShopify();
    console.log(`[backfill] Adresses posées : ${updated}, sans adresse Shopify : ${noAddress}, échecs : ${failed}.`);
    return;
  }
  // Mode reset : efface les pointeurs CRM/projet (zoho_crm_deal_*, zoho_project_id)
  // des commandes payées pour repartir à neuf. GARDE le Books SO. À utiliser APRÈS
  // avoir supprimé dans Zoho les commandes client/projets de test, puis --remigrate.
  if (reset) {
    let n = 0;
    for (const o of await storage.getSystemdOrders()) {
      if (o.status !== "paid") continue;
      if (!o.zohoCrmDealId && !o.zohoProjectId) continue;
      await storage.updateSystemdOrder(o.id, { zohoCrmDealId: null, zohoCrmDealUrl: null, zohoProjectId: null });
      n++;
    }
    for (const o of await storage.getShopifyOrders()) {
      if (!o.zohoCrmDealId && !o.zohoProjectId) continue;
      await storage.updateShopifyOrderZohoFields(o.integrationId, o.shopifyOrderId, {
        zohoCrmDealId: null, zohoCrmDealUrl: null, zohoProjectId: null,
      });
      n++;
    }
    console.log(`[backfill] Reset : ${n} commande(s) remises à zéro (CRM + projet). Books conservé.`);
    console.log("[backfill] Lancez ensuite : npx tsx scripts/backfill-crm-deals.ts --remigrate");
    return;
  }
  // Mode remigration : recrée en « commande client » (Sales_Orders) les
  // commandes qui pointaient vers un ancien Deal (ou n'avaient rien).
  // Idempotent : ce qui est déjà une commande client est ignoré.
  if (remigrate) {
    console.log("[backfill] Mode --remigrate : (re)création des commandes client Sales_Orders…");
    const { migrated, skipped, failed } = await remigrateCrmDealsToSalesOrders();
    console.log(`[backfill] Commandes client créées : ${migrated}, ignorées (déjà à jour) : ${skipped}, échecs : ${failed}.`);
    console.log("[backfill] Les anciens Deals de test restent dans Zoho (pipeline) — à supprimer manuellement si besoin.");
    return;
  }

  // Mode rafraîchissement : met à jour la description/contact des commandes
  // client DÉJÀ créées, sans en créer de nouvelles.
  if (refresh) {
    console.log("[backfill] Mode --refresh : mise à jour des descriptions des commandes client existantes…");
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
