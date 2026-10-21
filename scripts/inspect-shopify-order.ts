/**
 * Récupère une commande brute depuis l'API Shopify pour voir ce qu'elle
 * contient réellement (adresses de facturation/livraison, client). Lecture
 * seule. Sert à savoir si l'absence d'adresse vient de Shopify ou de notre sync.
 *
 * Usage (Replit) :
 *   npx tsx scripts/inspect-shopify-order.ts 1014
 */

import { storage } from "../server/storage";
import { fetchShopifyOrderDetail } from "../server/shopify-api";

async function main() {
  const ref = (process.argv[2] ?? "").trim().replace(/^#/, "").toLowerCase();
  if (!ref) {
    console.log("Donnez un numéro de commande, ex: npx tsx scripts/inspect-shopify-order.ts 1014");
    return;
  }

  const order = (await storage.getShopifyOrders()).find((o) =>
    (o.name ?? "").toLowerCase().includes(ref),
  );
  if (!order) {
    console.log(`Commande « ${ref} » introuvable en base.`);
    return;
  }

  const integ = await storage.getShopifyIntegration(order.integrationId);
  if (!integ) {
    console.log(`Intégration #${order.integrationId} introuvable.`);
    return;
  }

  console.log(`Commande ${order.name} (shopifyOrderId=${order.shopifyOrderId}) sur ${integ.storeUrl}\n`);
  const raw = await fetchShopifyOrderDetail(integ.storeUrl, integ.accessToken, order.shopifyOrderId);

  const pick = (obj: any) => (obj ? JSON.stringify(obj, null, 2) : "null");
  console.log("billing_address =", pick((raw as any).billing_address));
  console.log("\nshipping_address =", pick((raw as any).shipping_address));
  console.log("\ncustomer.default_address =", pick((raw as any).customer?.default_address));
  console.log("\nshipping_lines =", pick((raw as any).shipping_lines));
  console.log("\ncustomer =", pick((raw as any).customer
    ? { first_name: (raw as any).customer.first_name, last_name: (raw as any).customer.last_name, email: (raw as any).customer.email }
    : null));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
