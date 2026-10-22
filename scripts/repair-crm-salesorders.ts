/**
 * Répare les commandes dont l'id de commande client stocké ne pointe plus sur
 * aucun enregistrement Zoho (ex. « the id given seems to be invalid »). Pour
 * chaque commande déjà marquée /SalesOrders/ :
 *   - GET /Sales_Orders/{id} : si l'enregistrement existe (HTTP 200) → on ne
 *     touche à rien.
 *   - s'il a disparu (204/404) → on efface le pointeur et on RECRÉE la commande
 *     client (avec ses adresses, déjà en base).
 *
 * Sûr vis-à-vis du CRM live : on ne recrée QUE les commandes réellement
 * disparues (vérifiées une par une), jamais les valides → aucun doublon.
 *
 * Usage (Replit) :
 *   npx tsx scripts/repair-crm-salesorders.ts --dry-run   # aperçu
 *   npx tsx scripts/repair-crm-salesorders.ts             # réparation
 */

import { storage } from "../server/storage";
import { getValidAccessToken, getZohoDomains } from "../server/zoho-auth";
import { getZohoRegion } from "../server/zoho-api";
import {
  ensureCrmDealForShopifyOrder,
  ensureCrmDealForSystemdOrder,
} from "../server/order-zoho-integration";

const MODULE = process.env.ZOHO_CRM_ORDER_MODULE || "Sales_Orders";
const dryRun = process.argv.includes("--dry-run");
const isSalesOrder = (url?: string | null) => !!url && url.includes("/SalesOrders/");

async function salesOrderExists(id: string): Promise<boolean> {
  const region = await getZohoRegion();
  const { api } = getZohoDomains(region);
  const token = await getValidAccessToken(region);
  const res = await fetch(`https://${api}/crm/v7/${MODULE}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
  });
  return res.status === 200;
}

async function main() {
  let checked = 0, valid = 0, missing = 0, repaired = 0, failed = 0;

  for (const o of await storage.getShopifyOrders()) {
    if (!o.zohoCrmDealId || !isSalesOrder(o.zohoCrmDealUrl)) continue;
    checked++;
    if (await salesOrderExists(o.zohoCrmDealId)) { valid++; continue; }
    missing++;
    console.log(`[repair] ✗ ${o.name} : id ${o.zohoCrmDealId} introuvable dans Zoho → à recréer`);
    if (dryRun) continue;
    await storage.updateShopifyOrderZohoFields(o.integrationId, o.shopifyOrderId, {
      zohoCrmDealId: null, zohoCrmDealUrl: null,
    });
    try {
      await ensureCrmDealForShopifyOrder(o.integrationId, o.shopifyOrderId, { force: true });
      const after = (await storage.getShopifyOrders()).find(
        (x) => x.integrationId === o.integrationId && x.shopifyOrderId === o.shopifyOrderId,
      );
      if (isSalesOrder(after?.zohoCrmDealUrl)) {
        repaired++;
        console.log(`[repair] ✓ ${o.name} recréée → ${after?.zohoCrmDealId}`);
      } else {
        failed++;
        console.error(`[repair] ✗ ${o.name} : recréation sans id /SalesOrders/`);
      }
    } catch (err: any) {
      failed++;
      console.error(`[repair] ✗ ${o.name} : ${err?.message ?? err}`);
    }
  }

  for (const o of await storage.getSystemdOrders()) {
    if (o.status !== "paid" || !o.zohoCrmDealId || !isSalesOrder(o.zohoCrmDealUrl)) continue;
    checked++;
    if (await salesOrderExists(o.zohoCrmDealId)) { valid++; continue; }
    missing++;
    console.log(`[repair] ✗ systemd #${o.id} : id ${o.zohoCrmDealId} introuvable dans Zoho → à recréer`);
    if (dryRun) continue;
    await storage.updateSystemdOrder(o.id, { zohoCrmDealId: null, zohoCrmDealUrl: null });
    try {
      await ensureCrmDealForSystemdOrder(o.id, { force: true });
      const after = (await storage.getSystemdOrders()).find((x) => x.id === o.id);
      if (isSalesOrder(after?.zohoCrmDealUrl)) {
        repaired++;
        console.log(`[repair] ✓ systemd #${o.id} recréée → ${after?.zohoCrmDealId}`);
      } else {
        failed++;
      }
    } catch (err: any) {
      failed++;
      console.error(`[repair] ✗ systemd #${o.id} : ${err?.message ?? err}`);
    }
  }

  console.log(
    `[repair] Vérifiées : ${checked}, valides : ${valid}, disparues : ${missing}, ` +
      (dryRun ? "(dry-run, aucune recréation)" : `recréées : ${repaired}, échecs : ${failed}`) + ".",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[repair] Erreur fatale :", err?.message ?? err);
    process.exit(1);
  });
