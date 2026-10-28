/**
 * Active (ou vérifie) les webhooks commandes Shopify de chaque boutique
 * connectée : orders/create, orders/paid, orders/cancelled → l'app reçoit la
 * commande en quelques secondes. Idempotent : ne crée que ce qui manque, ne
 * supprime rien. Le serveur le fait aussi tout seul après chaque synchro.
 *
 * Usage (Replit) :
 *   npx tsx scripts/register-shopify-webhooks.ts           # active + affiche
 *   npx tsx scripts/register-shopify-webhooks.ts --check   # affiche seulement
 */

import { storage } from "../server/storage";
import { listShopifyWebhooks } from "../server/shopify-api";
import { getShopifyAccessToken } from "../server/shopify-token";
import { ensureOrderWebhooks, publicOrderWebhookAddress } from "../server/shopify-order-webhooks";

const checkOnly = process.argv.includes("--check");

async function main() {
  const address = publicOrderWebhookAddress();
  console.log(`Adresse du webhook : ${address ?? "AUCUNE → définir le secret SHOPIFY_APP_URL=https://servicessystemed.app puis redéployer"}`);
  console.log(`Secret de signature (SHOPIFY_CLIENT_SECRET) : ${process.env.SHOPIFY_CLIENT_SECRET ? "défini" : "ABSENT → les webhooks seront refusés"}\n`);

  const integrations = (await storage.getShopifyIntegrations())
    .filter((i) => (i.platform ?? "shopify") === "shopify" && i.isActive);
  if (integrations.length === 0) console.log("Aucune boutique Shopify active.");

  for (const integration of integrations) {
    console.log(`── ${integration.shopName ?? integration.storeUrl} (${integration.storeUrl}, id ${integration.id})`);
    console.log(`   Synchro commandes : ${integration.orderSyncFrequencyMinutes > 0 ? `toutes les ${integration.orderSyncFrequencyMinutes} min` : "DÉSACTIVÉE → les webhooks seront ignorés"}`);
    try {
      if (!checkOnly && address) {
        const result = await ensureOrderWebhooks(integration, { force: true });
        console.log(`   Créés : ${result?.created.length ? result.created.join(", ") : "rien (déjà en place)"}`);
      }
      const token = await getShopifyAccessToken(integration);
      const hooks = await listShopifyWebhooks(integration.storeUrl, token);
      if (hooks.length === 0) console.log("   Aucun webhook enregistré.");
      for (const h of hooks) console.log(`   • ${h.topic} → ${h.address}${h.address === address ? " ✓" : ""}`);
    } catch (err: any) {
      console.log(`   ✗ ${err.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exit(1);
  });
