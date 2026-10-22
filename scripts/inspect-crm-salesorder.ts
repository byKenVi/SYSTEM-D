/**
 * Vérifie, pour une commande, si l'id de commande client stocké en base pointe
 * réellement sur un enregistrement Sales_Orders dans Zoho. Lecture seule.
 * Sert à savoir si l'erreur « the id given seems to be invalid » vient d'un id
 * qui ne correspond à rien, ou d'autre chose (champ refusé).
 *
 * Usage (Replit) :
 *   npx tsx scripts/inspect-crm-salesorder.ts 1001
 */

import { storage } from "../server/storage";
import { getCrmSalesOrder } from "../server/zoho-crm";

async function main() {
  const ref = (process.argv[2] ?? "").trim().replace(/^#/, "").toLowerCase();
  if (!ref) {
    console.log("Donnez un numéro de commande, ex: npx tsx scripts/inspect-crm-salesorder.ts 1001");
    return;
  }

  const matches = (name?: string | null) => (name ?? "").toLowerCase().includes(ref);
  const shopify = (await storage.getShopifyOrders()).find((o) => matches(o.name));
  const systemd = (await storage.getSystemdOrders()).find(
    (o) => matches(o.shopifyOrderName) || String(o.id) === ref,
  );
  const order = shopify ?? systemd;
  if (!order) {
    console.log(`Commande « ${ref} » introuvable en base.`);
    return;
  }

  const id = (order as any).zohoCrmDealId as string | null;
  const url = (order as any).zohoCrmDealUrl as string | null;
  console.log(`Commande ${(order as any).name ?? (order as any).shopifyOrderName}`);
  console.log(`  zohoCrmDealId = ${id ?? "(vide)"}`);
  console.log(`  zohoCrmDealUrl = ${url ?? "(vide)"}`);
  if (!id) {
    console.log("  → pas d'id stocké, rien à vérifier.");
    return;
  }

  console.log(`\nGET /Sales_Orders/${id} …`);
  try {
    const rec = await getCrmSalesOrder(id);
    if (!rec) {
      console.log("  → INTROUVABLE (204/404) : l'id ne pointe sur AUCUNE commande client.");
    } else {
      console.log(`  → TROUVÉ. id renvoyé par Zoho = ${rec.id}`);
      console.log(`     Subject=${rec.Subject}  Status=${rec.Status}`);
      console.log(`     id stocké == id Zoho ? ${String(rec.id) === String(id)}`);
      console.log(`     Billing_Street=${rec.Billing_Street ?? "(vide)"}  Shipping_Street=${rec.Shipping_Street ?? "(vide)"}`);
    }
  } catch (err: any) {
    console.log(`  → ERREUR lecture : ${err?.message ?? err}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exit(1);
  });
