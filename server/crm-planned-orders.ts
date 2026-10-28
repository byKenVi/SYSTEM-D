/**
 * Sortie du CRM vers Zoho Inventory : quand une commande client passe à l'état
 * « Commande planifier », on crée (ou complète) et confirme la commande
 * Inventory à partir des lignes ACTUELLES du CRM (corrections du service client
 * incluses), reliées aux articles d'inventaire par SKU, puis on ouvre la liste
 * de prélèvement dans l'entrepôt du client (1re étape : « Picking »).
 *
 * Pas de facture : le stock sort à l'expédition du colis (mode stock physique),
 * les prix restent sur la commande pour garder sa valeur.
 *
 * Déclencheurs : webhook d'un workflow CRM + rattrapage périodique (webhooks
 * perdus). Le tout est désactivé tant que ZOHO_CRM_ORDER_WEBHOOK_SECRET n'est
 * pas défini.
 */

import { sql } from "drizzle-orm";
import type { ShopifyOrder, SystemdOrder, ZohoCatalogItem } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import {
  confirmInventorySalesOrder,
  createInventoryPicklist,
  createInventorySalesOrder,
  ensureZohoContact,
  findInventorySalesOrderByReference,
  getInventorySalesOrder,
  getZohoRegion,
  getZohoSOUrl,
  listInventoryLocations,
  searchPickableSoLines,
  updateInventorySalesOrder,
  type InventoryOrderLine,
  type InventorySalesOrder,
} from "./zoho-api";
import {
  addCrmSalesOrderNote,
  getCrmContact,
  getCrmProductsByIds,
  getCrmSalesOrder,
  searchCrmSalesOrderIdsByStatus,
} from "./zoho-crm";
import {
  buildPicklistLines,
  resolvePickLocation,
  storeNameFromSubject,
  unpickableLabels,
  type InventoryLocation,
} from "./inventory-order-policy";

export const PLANNED_STATUS = process.env.ZOHO_CRM_ORDER_PLANNED_STATUS || "Commande planifier";
const CATCH_UP_INTERVAL_MS = 30 * 60_000;
const CATCH_UP_LOOKBACK_MS = 48 * 60 * 60_000;
/** Commande déjà traitée dans Zoho avant ce flux (ancien envoi au paiement) : on n'y touche plus. */
const UNMANAGED_STAGE = "unmanaged";

export function isPlannedOrdersFlowEnabled(): boolean {
  return !!process.env.ZOHO_CRM_ORDER_WEBHOOK_SECRET;
}

export interface CrmOrderedItem {
  productId: string | null;
  productName: string;
  quantity: number;
  listPrice: number;
  description: string | null;
}

export interface MappedInventoryLines {
  lines: InventoryOrderLine[];
  /** Lignes sans article Inventory correspondant (envoyées en texte libre : ni stock ni prélèvement). */
  unmatched: string[];
}

/** Relie chaque ligne CRM à un article Inventory : SKU d'abord, puis nom exact. */
export function mapCrmItemsToInventoryLines(
  items: CrmOrderedItem[],
  productCodes: Map<string, { code: string | null; name: string | null }>,
  catalog: Pick<ZohoCatalogItem, "zohoItemId" | "sku" | "name">[],
): MappedInventoryLines {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of catalog) {
    if (c.sku && !bySku.has(norm(c.sku))) bySku.set(norm(c.sku), c.zohoItemId);
    if (!byName.has(norm(c.name))) byName.set(norm(c.name), c.zohoItemId);
  }

  const lines: InventoryOrderLine[] = [];
  const unmatched: string[] = [];
  for (const it of items) {
    const product = it.productId ? productCodes.get(it.productId) : undefined;
    const code = product?.code ?? null;
    const name = product?.name || it.productName;
    const itemId = (code && bySku.get(norm(code))) || byName.get(norm(name)) || null;
    if (!itemId) unmatched.push(code ? `${name} (${code})` : name);
    lines.push({
      name,
      sku: code,
      itemId,
      quantity: it.quantity,
      rate: it.listPrice,
      ...(it.description && it.description !== name ? { description: it.description } : {}),
    });
  }
  return { lines, unmatched };
}

function readOrderedItems(so: any): CrmOrderedItem[] {
  return (Array.isArray(so?.Ordered_Items) ? so.Ordered_Items : []).map((row: any) => ({
    productId: row?.Product_Name?.id ? String(row.Product_Name.id) : null,
    productName: String(row?.Product_Name?.name ?? "Article"),
    quantity: Number(row?.Quantity) || 1,
    listPrice: Number(row?.List_Price) || 0,
    description: row?.Description ?? null,
  }));
}

function shippingLine(so: any): string | null {
  const parts = [so?.Shipping_Street, so?.Shipping_City, so?.Shipping_State, so?.Shipping_Code, so?.Shipping_Country]
    .map((p) => (p ?? "").toString().trim()).filter(Boolean);
  return parts.length ? `Livrer à : ${parts.join(", ")}` : null;
}

type LocalOrder =
  | { kind: "systemd"; order: SystemdOrder }
  | { kind: "shopify"; orders: ShopifyOrder[] };

async function findLocalOrder(crmSoId: string): Promise<LocalOrder | null> {
  const systemd = (await storage.getSystemdOrders()).find((o) => o.zohoCrmDealId === crmSoId);
  if (systemd) return { kind: "systemd", order: systemd };
  // Plusieurs alias (reconnexions de la boutique) peuvent pointer vers la même commande client.
  const shopify = (await storage.getShopifyOrders()).filter((o) => o.zohoCrmDealId === crmSoId);
  return shopify.length ? { kind: "shopify", orders: shopify } : null;
}

/** Commande créée au paiement par l'ancien flux Books (même organisation que Inventory). */
function previousSalesOrderId(local: LocalOrder | null): string | null {
  if (!local) return null;
  const rows = local.kind === "systemd" ? [local.order] : local.orders;
  return rows.find((o) => o.zohoBooksSalesOrderId)?.zohoBooksSalesOrderId ?? null;
}

async function persistSalesOrder(local: LocalOrder | null, order: InventorySalesOrder): Promise<void> {
  if (!local) return;
  // Colonnes « zoho_books_* » réutilisées : Books et Inventory partagent la même commande.
  const fields = {
    zohoBooksSalesOrderId: order.salesorderId,
    zohoBooksSalesOrderNumber: order.salesorderNumber,
    zohoBooksSalesOrderUrl: getZohoSOUrl(await getZohoRegion(), order.salesorderId),
  };
  if (local.kind === "systemd") {
    await storage.updateSystemdOrder(local.order.id, fields);
  } else {
    for (const o of local.orders) await storage.updateShopifyOrderZohoFields(o.integrationId, o.shopifyOrderId, fields);
  }
}

/** Acheteur à prévenir aux étapes du colis (jamais le propriétaire de la boutique). */
async function resolveBuyer(local: LocalOrder | null): Promise<{ email: string | null; name: string | null }> {
  let shopifyOrder: ShopifyOrder | undefined;
  if (local?.kind === "shopify") {
    shopifyOrder = local.orders[0];
  } else if (local?.kind === "systemd" && local.order.shopifyOrderId) {
    shopifyOrder = (await storage.getShopifyOrders()).find((o) =>
      o.integrationId === local.order.shopifyIntegrationId && o.shopifyOrderId === local.order.shopifyOrderId);
  }
  if (!shopifyOrder) return { email: null, name: null };
  const name = [shopifyOrder.customerFirstName, shopifyOrder.customerLastName]
    .map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
  return { email: shopifyOrder.email ?? null, name: name || null };
}

async function resolveCustomerId(local: LocalOrder | null, so: any): Promise<string> {
  // Le client de la commande est le propriétaire de la boutique, jamais l'acheteur final.
  const contactId = local?.kind === "systemd" ? local.order.contactId : local?.orders[0]?.contactId;
  if (contactId != null) {
    const contact = await storage.getContact(contactId);
    if (contact?.email) return ensureZohoContact({ name: contact.name, email: contact.email, companyName: contact.companyName });
  }
  const crmContactId = so?.Contact_Name?.id ? String(so.Contact_Name.id) : null;
  const crmContact = crmContactId ? await getCrmContact(crmContactId) : null;
  if (!crmContact?.email) {
    throw new Error("aucun courriel client (contact CRM sans email) : impossible de créer le client Inventory");
  }
  return ensureZohoContact({
    name: crmContact.name || so?.Account_Name?.name || "Client",
    email: crmContact.email,
    companyName: so?.Account_Name?.name ?? null,
  });
}

async function resolveLocation(local: LocalOrder | null, so: any): Promise<InventoryLocation> {
  const contactId = local?.kind === "systemd" ? local.order.contactId : local?.orders[0]?.contactId;
  const contact = contactId != null ? await storage.getContact(contactId) : undefined;
  const hints = [
    local?.kind === "shopify" ? local.orders[0]?.shopName : null,
    contact?.companyName,
    so?.Account_Name?.name,
    storeNameFromSubject(so?.Subject),
  ];
  const location = resolvePickLocation(await listInventoryLocations(), hints, process.env.ZOHO_INVENTORY_LOCATION_ID);
  if (!location) {
    throw new Error("entrepôt Inventory introuvable pour ce client : définir ZOHO_INVENTORY_LOCATION_ID");
  }
  return location;
}

export type PlannedOrderOutcome = "sent" | "already_sent" | "not_planned" | "not_found";
export type PlannedOrderTrigger = "webhook" | "catch-up" | "manual";

/**
 * Envoie une commande client planifiée vers Inventory (commande confirmée +
 * liste de prélèvement). Idempotent (verrou par commande + lien en base +
 * référence CRM-…), sûr à rappeler : une étape ratée est reprise au rappel.
 */
export async function sendPlannedCrmOrderToInventory(crmSoId: string, trigger: PlannedOrderTrigger): Promise<PlannedOrderOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crm-planned-inventory:${crmSoId}`}))`);

    const so = await getCrmSalesOrder(crmSoId);
    if (!so) {
      await logSkipped(crmSoId, trigger, "commande client introuvable dans le CRM");
      return "not_found";
    }
    if (so.Status !== PLANNED_STATUS) {
      // Valeur API exacte : un libellé renommé dans le CRM garde parfois son ancienne valeur.
      await logSkipped(crmSoId, trigger, `État reçu ${JSON.stringify(so.Status)} ≠ attendu ${JSON.stringify(PLANNED_STATUS)}`);
      return "not_planned";
    }

    const link = await storage.getCrmInventoryOrder(crmSoId);
    if (link?.picklistId || link?.stage === UNMANAGED_STAGE) return "already_sent";

    const local = await findLocalOrder(crmSoId);
    const fromApp = local !== null;
    const reference = `CRM-${so.SO_Number ?? crmSoId}`;
    const label = String(so.Subject ?? reference);

    const items = readOrderedItems(so);
    if (items.length === 0) throw new Error("la commande client n'a aucun article");
    const productIds = Array.from(new Set(items.map((i) => i.productId).filter((id): id is string => !!id)));
    const { lines, unmatched } = mapCrmItemsToInventoryLines(
      items,
      await getCrmProductsByIds(productIds),
      await storage.getZohoCatalogItems(false),
    );
    const location = await resolveLocation(local, so);
    const notes = [
      label,
      fromApp ? "Source : Application Système D" : "Source : saisie manuelle CRM",
      `Commande client CRM : ${so.SO_Number ?? crmSoId}`,
      shippingLine(so),
    ].filter(Boolean).join("\n");

    // Commande Inventory : reprise (envoi précédent incomplet), ancienne commande
    // créée au paiement, ou nouvelle.
    let order: InventorySalesOrder;
    let action: string;
    const previous = link
      ? await getInventorySalesOrder(link.inventorySoId)
      : await findInventorySalesOrderByReference(reference);
    if (previous) {
      order = previous;
      action = "reprise";
    } else if (previousSalesOrderId(local)) {
      const previousId = previousSalesOrderId(local)!;
      try {
        order = await updateInventorySalesOrder(previousId, { referenceNumber: reference, lineItems: lines, location, notes });
        action = "mise à jour";
      } catch (err: any) {
        // Déjà expédiée ou facturée : on ne touche plus, on se contente de la relier.
        await storage.upsertCrmInventoryOrder({ crmSoId, label, inventorySoId: previousId, stage: UNMANAGED_STAGE });
        await storage.createActivityLog({
          type: "zoho_inventory_so_planned", status: "warning",
          message: `${label} : commande ${previousId} déjà traitée dans Zoho, non modifiée : ${err.message}`,
          metadata: JSON.stringify({ crmSoId, salesorderId: previousId }),
        }).catch(() => {});
        return "already_sent";
      }
    } else {
      order = await createInventorySalesOrder({
        customerId: await resolveCustomerId(local, so),
        referenceNumber: reference,
        lineItems: lines,
        location,
        notes,
      });
      action = "créée";
    }
    await persistSalesOrder(local, order);
    const buyer = await resolveBuyer(local);
    await storage.upsertCrmInventoryOrder({
      crmSoId,
      crmSoNumber: so.SO_Number ? String(so.SO_Number) : null,
      label,
      inventorySoId: order.salesorderId,
      inventorySoNumber: order.salesorderNumber,
      locationId: location.locationId,
      buyerEmail: buyer.email,
      buyerName: buyer.name,
    });

    let confirmError: string | null = null;
    if (order.status === "draft") {
      await confirmInventorySalesOrder(order.salesorderId).catch((err: any) => { confirmError = err.message; });
    }

    let picklist: { picklistId: string; picklistNumber: string } | null = null;
    let picklistError: string | null = null;
    // Zoho dit lui-même quelles lignes il accepte de prélever : seuls les articles
    // suivis en stock y figurent.
    let unpickable: string[] = [];
    let picklistLines: ReturnType<typeof buildPicklistLines> = [];
    if (!confirmError) {
      try {
        const pickable = await searchPickableSoLines(order.salesorderId);
        picklistLines = buildPicklistLines(order.salesorderId, pickable);
        unpickable = unpickableLabels(order.lines, pickable);
      } catch (err: any) {
        picklistError = `lignes prélevables illisibles : ${err.message}`;
      }
    }
    if (confirmError) {
      picklistError = "commande non confirmée";
    } else if (picklistError) {
      // déjà renseignée
    } else if (picklistLines.length === 0 && unpickable.length === 0) {
      picklistError = "aucun article d'inventaire à prélever";
    } else {
      // Aucune ligne déclarée prélevable : dernier essai avec les lignes de la
      // commande, au cas où la recherche Zoho serait plus stricte que la création.
      const fallback = picklistLines.length === 0;
      if (fallback) {
        picklistLines = buildPicklistLines(order.salesorderId, order.lines
          .filter((l) => l.itemId)
          .map((l) => ({ soLineItemId: l.lineItemId, quantityToBePicked: l.quantity })));
      }
      try {
        picklist = await createInventoryPicklist({ location, lines: picklistLines, notes: label });
        await storage.upsertCrmInventoryOrder({
          crmSoId,
          inventorySoId: order.salesorderId,
          picklistId: picklist.picklistId,
          picklistNumber: picklist.picklistNumber,
          stage: "picking",
        });
        if (fallback) unpickable = [];
      } catch (err: any) {
        picklistError = fallback
          ? `articles non suivis en stock dans Inventory (${unpickable.join(", ")}) : cocher « Suivre le stock pour cet article » sur leur fiche [${err.message}]`
          : err.message;
      }
    }

    const problems = [
      confirmError ? `confirmation échouée : ${confirmError}` : null,
      picklistError ? `prélèvement non créé : ${picklistError}` : null,
      picklist && unpickable.length ? `hors prélèvement (stock non suivi) : ${unpickable.join(", ")}` : null,
      unmatched.length ? `${unmatched.length} article(s) non relié(s)` : null,
    ].filter(Boolean);

    // Note CRM seulement quand quelque chose a changé : un rattrapage qui échoue
    // encore ne doit pas empiler une note toutes les 30 minutes.
    if (action !== "reprise" || picklist) {
      const url = getZohoSOUrl(await getZohoRegion(), order.salesorderId);
      const noteLines = [
        `Commande Inventory ${order.salesorderNumber} ${action}${confirmError ? " (À CONFIRMER manuellement dans Inventory)" : " et confirmée"}.`,
        picklist
          ? `Prélèvement ${picklist.picklistNumber} créé dans l'entrepôt ${location.name}.`
          : `⚠ Prélèvement à créer manuellement dans Inventory (${picklistError}). Nouvel essai automatique dans 30 minutes.`,
        url,
        picklist && unpickable.length ? `⚠ Hors prélèvement (stock non suivi dans Inventory) : ${unpickable.join(", ")}` : null,
        unmatched.length ? `⚠ Articles non reliés à l'inventaire (texte libre, stock non déduit) : ${unmatched.join(", ")}` : null,
      ].filter(Boolean).join("\n");
      await addCrmSalesOrderNote(crmSoId, "Envoyée vers Zoho Inventory", noteLines).catch(() => {});
    }

    await storage.createActivityLog({
      type: "zoho_inventory_so_planned",
      status: problems.length ? "warning" : "success",
      message: `${label} → Inventory ${order.salesorderNumber} ${action}${picklist ? `, prélèvement ${picklist.picklistNumber}` : ""} (${trigger})${problems.length ? ` ; ${problems.join(" ; ")}` : ""}`,
      metadata: JSON.stringify({ crmSoId, salesorderId: order.salesorderId, picklistId: picklist?.picklistId ?? null, locationId: location.locationId, fromApp, unmatched }),
    }).catch(() => {});
    return "sent";
  });
}

async function logSkipped(crmSoId: string, trigger: PlannedOrderTrigger, reason: string): Promise<void> {
  console.warn(`[crm-planned] ${crmSoId} non envoyée (${trigger}) : ${reason}`);
  await storage.createActivityLog({
    type: "zoho_inventory_so_planned", status: "warning",
    message: `Commande client CRM ${crmSoId} non envoyée vers Inventory (${trigger}) : ${reason}`,
    metadata: JSON.stringify({ crmSoId }),
  }).catch(() => {});
}

/** Version « ne lève jamais » pour le webhook et le rattrapage : erreurs journalisées. */
export async function handlePlannedCrmOrder(crmSoId: string, trigger: PlannedOrderTrigger): Promise<void> {
  try {
    await sendPlannedCrmOrderToInventory(crmSoId, trigger);
  } catch (err: any) {
    console.error(`[crm-planned] ${crmSoId} : ${err.message}`);
    await storage.createActivityLog({
      type: "zoho_inventory_so_planned_error", status: "error",
      message: `Envoi vers Inventory échoué pour la commande client CRM ${crmSoId} (${trigger}) : ${err.message}`,
      metadata: JSON.stringify({ crmSoId }),
    }).catch(() => {});
    if (trigger === "webhook") {
      await addCrmSalesOrderNote(crmSoId, "Échec de l'envoi vers Zoho Inventory", `${err.message}\nNouvel essai automatique dans 30 minutes.`).catch(() => {});
    }
  }
}

async function catchUpPlannedOrders(): Promise<void> {
  const settings = await storage.getAdminSettings();
  if (!settings?.zohoInventoryRefreshToken || !settings.zohoInventoryOrgId) return;
  const ids = await searchCrmSalesOrderIdsByStatus(PLANNED_STATUS, new Date(Date.now() - CATCH_UP_LOOKBACK_MS));
  // Déjà en prélèvement → rien à faire, sans appel API.
  const done = new Set((await storage.getCrmInventoryOrders())
    .filter((l) => l.picklistId || l.stage === UNMANAGED_STAGE)
    .map((l) => l.crmSoId));
  for (const id of ids) {
    if (done.has(id)) continue;
    await handlePlannedCrmOrder(id, "catch-up");
  }
}

export function startCrmPlannedOrdersScheduler(): void {
  if (!isPlannedOrdersFlowEnabled()) {
    console.log("[crm-planned] CRM → Inventory (Commande planifier) désactivé : ZOHO_CRM_ORDER_WEBHOOK_SECRET non défini");
    return;
  }
  const run = () => catchUpPlannedOrders().catch((err) => console.error(`[crm-planned] rattrapage : ${err.message}`));
  setTimeout(run, 2 * 60_000);
  setInterval(run, CATCH_UP_INTERVAL_MS);
}
