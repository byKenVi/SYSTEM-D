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
import { getValidAccessToken, getZohoDomains } from "../server/zoho-auth";
import { getZohoRegion } from "../server/zoho-api";

const MODULE = process.env.ZOHO_CRM_ORDER_MODULE || "Sales_Orders";

async function crmGetRaw(path: string): Promise<{ status: number; body: string }> {
  const region = await getZohoRegion();
  const { api } = getZohoDomains(region);
  const token = await getValidAccessToken(region);
  const res = await fetch(`https://${api}/crm/v7${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
  });
  return { status: res.status, body: await res.text() };
}

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
  const order: any = shopify ?? systemd;
  if (!order) {
    console.log(`Commande « ${ref} » introuvable en base.`);
    return;
  }

  const id = order.zohoCrmDealId as string | null;
  const url = order.zohoCrmDealUrl as string | null;
  console.log(`Commande ${order.name ?? order.shopifyOrderName}`);
  console.log(`  zohoCrmDealId = ${id ?? "(vide)"}`);
  console.log(`  zohoCrmDealUrl = ${url ?? "(vide)"}`);
  if (!id) {
    console.log("  → pas d'id stocké, rien à vérifier.");
    return;
  }

  console.log(`\nGET /${MODULE}/${id} …`);
  const { status, body } = await crmGetRaw(`/${MODULE}/${encodeURIComponent(id)}`);
  console.log(`  HTTP ${status}`);
  if (status === 204 || status === 404) {
    console.log("  → INTROUVABLE : l'id ne pointe sur AUCUNE commande client dans ce module.");
    console.log(`  réponse: ${body.slice(0, 300)}`);
    return;
  }
  let rec: any = null;
  try { rec = JSON.parse(body)?.data?.[0] ?? null; } catch { /* noop */ }
  if (!rec) {
    console.log(`  → réponse inattendue: ${body.slice(0, 400)}`);
    return;
  }
  console.log(`  → TROUVÉ. id renvoyé par Zoho = ${rec.id}`);
  console.log(`     id stocké == id Zoho ? ${String(rec.id) === String(id)}`);
  console.log(`     Subject=${rec.Subject}  Status=${rec.Status}`);
  console.log(`     Billing_Street=${rec.Billing_Street ?? "(vide)"}  Billing_State=${rec.Billing_State ?? "(vide)"}`);
  console.log(`     Shipping_Street=${rec.Shipping_Street ?? "(vide)"}  Shipping_State=${rec.Shipping_State ?? "(vide)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exit(1);
  });
