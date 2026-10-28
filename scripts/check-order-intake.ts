/**
 * Pourquoi une commande n'arrive pas dans l'app ? Montre la base utilisée,
 * les dernières commandes reçues, l'état de chaque boutique Shopify (jeton,
 * erreurs, dernière synchro) et cherche la commande directement chez Shopify.
 * Lecture seule : n'écrit rien, ni en base ni dans Zoho.
 *
 * Usage (Replit) :
 *   npx tsx scripts/check-order-intake.ts "#1017"
 */

import { storage } from "../server/storage";
import { fetchShopifyOrders } from "../server/shopify-api";
import { getShopifyAccessToken } from "../server/shopify-token";

const when = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("fr-CA") : "jamais");

async function main() {
  const ref = (process.argv[2] ?? "").trim().replace(/^#/, "");

  let dbHost = "?";
  try { dbHost = new URL(process.env.DATABASE_URL ?? "").hostname; } catch {}
  console.log(`Base de données : ${dbHost}`);
  console.log("⚠ Si ce n'est pas la base du site déployé, ce script ne voit pas les commandes de production.\n");

  console.log("── Dernières commandes en base ──");
  const shopify = [...await storage.getShopifyOrders()]
    .sort((a, b) => (b.shopifyCreatedAt?.getTime() ?? 0) - (a.shopifyCreatedAt?.getTime() ?? 0)).slice(0, 3);
  for (const o of shopify) console.log(`  Shopify ${o.shopName ?? ""} ${o.name}  ${o.financialStatus}  ${when(o.shopifyCreatedAt)}`);
  const systemd = [...await storage.getSystemdOrders()]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 5);
  for (const o of systemd) {
    console.log(`  App #${o.id} ${o.shopifyOrderName ?? "(pas de n° Shopify)"}  statut ${o.status}  ${when(o.createdAt)}  CRM ${o.zohoCrmDealId ? "✓" : "—"}`);
  }

  for (const integration of await storage.getShopifyIntegrations()) {
    if ((integration.platform ?? "shopify") !== "shopify") continue;
    console.log(`\n── ${integration.shopName ?? integration.storeUrl} (${integration.storeUrl}, id ${integration.id})`);
    console.log(`   Active : ${integration.isActive ? "oui" : "NON"} · synchro commandes : ${integration.orderSyncFrequencyMinutes > 0 ? `toutes les ${integration.orderSyncFrequencyMinutes} min` : "DÉSACTIVÉE"}`);
    console.log(`   Dernière synchro commandes : ${when(integration.lastOrderSyncAt)}`);
    console.log(`   Connexion : ${integration.connectionStatus} · erreurs consécutives : ${integration.consecutiveErrors}${integration.syncPausedUntil ? ` · en pause jusqu'au ${when(integration.syncPausedUntil)}` : ""}`);
    if (integration.lastConnectionError) console.log(`   Dernière erreur : ${integration.lastConnectionError}`);
    if (!ref || !integration.isActive) continue;
    try {
      const token = await getShopifyAccessToken(integration);
      const found = (await fetchShopifyOrders(integration.storeUrl, token, 50))
        .find((o: any) => String(o.name ?? "").replace(/^#/, "") === ref || String(o.order_number) === ref) as any;
      console.log(found
        ? `   Chez Shopify : ${found.name} ✓ (${found.financial_status}, ${when(found.created_at)})`
        : `   Chez Shopify : #${ref} absente des 50 dernières commandes`);
    } catch (err: any) {
      console.log(`   ✗ Shopify injoignable : ${err.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exit(1);
  });
