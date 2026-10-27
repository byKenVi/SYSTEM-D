/**
 * Diagnostic du flux CRM → Inventory (« Commande planifier ») pour UNE commande :
 * configuration, État exact renvoyé par l'API CRM, entrepôt retenu, commande
 * Inventory et prélèvement existants, correspondance des articles, journal.
 * Lecture seule par défaut.
 *
 * Usage (Replit) :
 *   npx tsx scripts/check-planned-order.ts --locations           # entrepôts Inventory seulement
 *   npx tsx scripts/check-planned-order.ts "#1014"               # commande Shopify / Système D
 *   npx tsx scripts/check-planned-order.ts 5843210000001234567   # id CRM de la commande client
 *   npx tsx scripts/check-planned-order.ts "#1014" --send        # + envoi réel vers Inventory
 */

import { storage } from "../server/storage";
import { getValidAccessToken, getZohoDomains } from "../server/zoho-auth";
import { findInventorySalesOrderByReference, getZohoRegion, listInventoryLocations } from "../server/zoho-api";
import { getCrmProductsByIds, getCrmSalesOrder } from "../server/zoho-crm";
import { PLANNED_STATUS, mapCrmItemsToInventoryLines, sendPlannedCrmOrderToInventory } from "../server/crm-planned-orders";
import { resolvePickLocation, storeNameFromSubject } from "../server/inventory-order-policy";

const MODULE = process.env.ZOHO_CRM_ORDER_MODULE || "Sales_Orders";
const send = process.argv.includes("--send");

async function findCrmIdBySoNumber(soNumber: string): Promise<string | null> {
  const region = await getZohoRegion();
  const { api } = getZohoDomains(region);
  const token = await getValidAccessToken(region);
  const criteria = encodeURIComponent(`(SO_Number:equals:${soNumber})`);
  const res = await fetch(`https://${api}/crm/v7/${MODULE}/search?criteria=${criteria}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
  });
  if (res.status !== 200) return null;
  const body: any = await res.json().catch(() => null);
  return body?.data?.[0]?.id ? String(body.data[0].id) : null;
}

async function resolveCrmId(ref: string): Promise<string | null> {
  const needle = ref.replace(/^#/, "").toLowerCase();
  const matches = (name?: string | null) => (name ?? "").toLowerCase().includes(needle);
  const local: any = (await storage.getShopifyOrders()).find((o) => matches(o.name) && o.zohoCrmDealId)
    ?? (await storage.getSystemdOrders()).find((o) => (matches(o.shopifyOrderName) || String(o.id) === needle) && o.zohoCrmDealId);
  if (local) {
    console.log(`Commande locale ${local.name ?? local.shopifyOrderName ?? local.id} → commande client CRM ${local.zohoCrmDealId}`);
    return String(local.zohoCrmDealId);
  }
  if (/^\d{15,}$/.test(needle)) return needle;
  const byNumber = await findCrmIdBySoNumber(ref);
  if (byNumber) console.log(`N° de commande client CRM ${ref} → id ${byNumber}`);
  return byNumber;
}

async function printLocations() {
  console.log("── Entrepôts Inventory ──");
  for (const l of await listInventoryLocations()) {
    console.log(`  ${l.locationId}  ${l.name}  [type ${l.type ?? "?"}, ${l.status ?? "?"}${l.parentLocationId ? `, parent ${l.parentLocationId}` : ""}]`);
  }
  console.log(`  ZOHO_INVENTORY_LOCATION_ID : ${process.env.ZOHO_INVENTORY_LOCATION_ID || "(non défini : choix automatique par nom du client)"}`);
}

async function main() {
  if (process.argv.includes("--locations")) {
    await printLocations();
    return;
  }
  const ref = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").trim();
  if (!ref) {
    console.log('Donnez une commande, ex: npx tsx scripts/check-planned-order.ts "#1014"');
    return;
  }

  console.log("── Configuration (cet environnement) ──");
  const secret = process.env.ZOHO_CRM_ORDER_WEBHOOK_SECRET;
  console.log(`  ZOHO_CRM_ORDER_WEBHOOK_SECRET : ${secret ? `défini (${secret.length} caractères)` : "ABSENT → flux désactivé"}`);
  console.log(`  État attendu                  : ${JSON.stringify(PLANNED_STATUS)}`);
  console.log("  ⚠ Ce sont les secrets de l'espace de travail ; le site déployé n'a les siens qu'après un redéploiement.\n");

  const crmId = await resolveCrmId(ref);
  if (!crmId) {
    console.log(`Aucune commande client CRM trouvée pour « ${ref} ».`);
    return;
  }

  console.log("\n── Commande client CRM ──");
  const so = await getCrmSalesOrder(crmId);
  if (!so) {
    console.log(`  ${crmId} : INTROUVABLE dans ${MODULE}.`);
    return;
  }
  const statusOk = so.Status === PLANNED_STATUS;
  console.log(`  ${so.Subject} (n° ${so.SO_Number ?? "—"}, id ${crmId})`);
  console.log(`  État API : ${JSON.stringify(so.Status)} ${statusOk ? "✓" : `✗ ≠ ${JSON.stringify(PLANNED_STATUS)}`}`);
  console.log(`  Modifiée : ${so.Modified_Time}`);

  const local = (await storage.getSystemdOrders()).find((o) => o.zohoCrmDealId === crmId)
    ?? (await storage.getShopifyOrders()).find((o) => o.zohoCrmDealId === crmId);
  console.log(`  Commande de l'app : ${local ? "oui" : "non (saisie manuelle CRM)"}`);
  if (local?.zohoBooksSalesOrderId) {
    console.log(`  Commande Zoho déjà reliée en base : ${local.zohoBooksSalesOrderNumber ?? local.zohoBooksSalesOrderId}`);
  }

  console.log("\n── Entrepôt ──");
  const contact = local ? await storage.getContact(local.contactId) : undefined;
  const location = resolvePickLocation(
    await listInventoryLocations(),
    [(local as any)?.shopName, contact?.companyName, so.Account_Name?.name, storeNameFromSubject(so.Subject)],
    process.env.ZOHO_INVENTORY_LOCATION_ID,
  );
  console.log(location
    ? `  ✓ ${location.name} (${location.locationId})`
    : "  ✗ aucun entrepôt retenu → définir ZOHO_INVENTORY_LOCATION_ID (voir --locations)");

  console.log("\n── Zoho Inventory ──");
  const link = await storage.getCrmInventoryOrder(crmId);
  if (link) {
    console.log(`  Lien en base : commande ${link.inventorySoNumber ?? link.inventorySoId}, étape ${link.stage}, prélèvement ${link.picklistNumber ?? "—"}`);
    console.log(`  Acheteur à prévenir : ${link.buyerEmail ?? "(aucun courriel)"}`);
  }
  const reference = `CRM-${so.SO_Number ?? crmId}`;
  const existing = await findInventorySalesOrderByReference(reference);
  console.log(`  Référence ${reference} : ${existing ? `commande ${existing.salesorderNumber} (${existing.status})` : "aucune commande"}`);

  console.log("\n── Articles ──");
  const items = (Array.isArray(so.Ordered_Items) ? so.Ordered_Items : []).map((row: any) => ({
    productId: row?.Product_Name?.id ? String(row.Product_Name.id) : null,
    productName: String(row?.Product_Name?.name ?? "Article"),
    quantity: Number(row?.Quantity) || 1,
    listPrice: Number(row?.List_Price) || 0,
    description: row?.Description ?? null,
  }));
  const productIds = Array.from(new Set(items.map((i: any) => i.productId).filter(Boolean))) as string[];
  const { lines } = mapCrmItemsToInventoryLines(items, await getCrmProductsByIds(productIds), await storage.getZohoCatalogItems(false));
  if (lines.length === 0) console.log("  ✗ aucun article : l'envoi échouera");
  for (const l of lines) {
    console.log(`  ${l.itemId ? "✓" : "⚠ non relié (pas de prélèvement)"}  ${l.quantity} × ${l.name}${l.sku ? ` (${l.sku})` : ""} @ ${l.rate}`);
  }

  console.log("\n── Journal d'activité (flux Inventory planifié) ──");
  const logs = (await storage.getActivityLogs(500))
    .filter((l: any) => /^zoho_(inventory|books)_so_planned/.test(String(l.type)) && `${l.message}${l.metadata ?? ""}`.includes(crmId))
    .slice(0, 10);
  if (logs.length === 0) console.log("  (aucune entrée : le webhook n'a jamais atteint l'app pour cette commande)");
  for (const l of logs as any[]) console.log(`  [${l.createdAt?.toISOString?.() ?? l.createdAt}] ${l.status} : ${l.message}`);

  if (!send) {
    console.log("\nLecture seule. Ajoutez --send pour lancer l'envoi vers Inventory maintenant.");
    return;
  }
  console.log("\n── Envoi vers Inventory (manuel) ──");
  const outcome = await sendPlannedCrmOrderToInventory(crmId, "manual");
  console.log(`  Résultat : ${outcome}`);
  const after = await storage.getCrmInventoryOrder(crmId);
  if (after) console.log(`  Commande ${after.inventorySoNumber}, prélèvement ${after.picklistNumber ?? "non créé (voir journal)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err?.message ?? err);
    process.exit(1);
  });
