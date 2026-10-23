/**
 * Sortie du CRM vers Zoho Books : quand une commande client passe à l'état
 * « Commande planifier », on crée (ou complète) et confirme le bon de commande
 * Books à partir des lignes ACTUELLES du CRM (corrections du service client
 * incluses), reliées aux articles d'inventaire par SKU.
 *
 * Déclencheurs : webhook d'un workflow CRM + rattrapage périodique (webhooks
 * perdus). Le tout est désactivé tant que ZOHO_CRM_ORDER_WEBHOOK_SECRET n'est
 * pas défini.
 *
 * Les commandes venues de l'app portent un tag (champ personnalisé Books) qui
 * déclenche le rabais de 100 % à la facturation (automatisation côté Books).
 */

import { sql } from "drizzle-orm";
import type { ShopifyOrder, SystemdOrder, ZohoCatalogItem } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { getZohoRegion } from "./zoho-api";
import {
  addCrmSalesOrderNote,
  getCrmContact,
  getCrmProductsByIds,
  getCrmSalesOrder,
  searchCrmSalesOrderIdsByStatus,
} from "./zoho-crm";
import {
  confirmBooksSalesOrder,
  createBooksSalesOrder,
  findBooksSalesOrderByReference,
  getZohoBooksSalesOrderUrl,
  updateBooksSalesOrder,
  type BooksCustomField,
  type BooksLineItem,
} from "./zoho-books";

export const PLANNED_STATUS = process.env.ZOHO_CRM_ORDER_PLANNED_STATUS || "Commande planifier";
/** customfield_id (numérique) du champ personnalisé Books « Source » — l'API refuse le nom API. */
const SOURCE_FIELD = process.env.ZOHO_BOOKS_ORDER_SOURCE_FIELD_ID || "";
const SOURCE_VALUE = process.env.ZOHO_BOOKS_ORDER_SOURCE_VALUE || "Application";
const CATCH_UP_INTERVAL_MS = 30 * 60_000;
const CATCH_UP_LOOKBACK_MS = 48 * 60 * 60_000;

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

export interface MappedBooksLines {
  lines: BooksLineItem[];
  /** Lignes sans article Books correspondant (envoyées en texte libre : pas de mouvement de stock). */
  unmatched: string[];
}

/** Relie chaque ligne CRM à un article Books/Inventory : SKU d'abord, puis nom exact. */
export function mapCrmItemsToBooksLines(
  items: CrmOrderedItem[],
  productCodes: Map<string, { code: string | null; name: string | null }>,
  catalog: Pick<ZohoCatalogItem, "zohoItemId" | "sku" | "name">[],
): MappedBooksLines {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of catalog) {
    if (c.sku && !bySku.has(norm(c.sku))) bySku.set(norm(c.sku), c.zohoItemId);
    if (!byName.has(norm(c.name))) byName.set(norm(c.name), c.zohoItemId);
  }

  const lines: BooksLineItem[] = [];
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

function existingBooksSo(local: LocalOrder | null): { id: string; number: string | null } | null {
  if (!local) return null;
  const rows = local.kind === "systemd" ? [local.order] : local.orders;
  const hit = rows.find((o) => o.zohoBooksSalesOrderId);
  return hit ? { id: hit.zohoBooksSalesOrderId!, number: hit.zohoBooksSalesOrderNumber ?? null } : null;
}

async function persistBooksSo(local: LocalOrder | null, salesorderId: string, salesorderNumber: string): Promise<void> {
  if (!local) return;
  const fields = {
    zohoBooksSalesOrderId: salesorderId,
    zohoBooksSalesOrderNumber: salesorderNumber,
    zohoBooksSalesOrderUrl: getZohoBooksSalesOrderUrl(await getZohoRegion(), salesorderId),
  };
  if (local.kind === "systemd") {
    await storage.updateSystemdOrder(local.order.id, fields);
  } else {
    for (const o of local.orders) await storage.updateShopifyOrderZohoFields(o.integrationId, o.shopifyOrderId, fields);
  }
}

async function resolveBooksCustomer(
  local: LocalOrder | null,
  so: any,
): Promise<{ name: string; email: string; companyName?: string | null }> {
  // On facture le client (propriétaire de la boutique), jamais l'acheteur final.
  const contactId = local?.kind === "systemd" ? local.order.contactId : local?.orders[0]?.contactId;
  if (contactId != null) {
    const contact = await storage.getContact(contactId);
    if (contact?.email) return { name: contact.name, email: contact.email, companyName: contact.companyName };
  }
  const crmContactId = so?.Contact_Name?.id ? String(so.Contact_Name.id) : null;
  const crmContact = crmContactId ? await getCrmContact(crmContactId) : null;
  if (!crmContact?.email) {
    throw new Error("aucun courriel client (contact CRM sans email) : impossible de créer le client Books");
  }
  return {
    name: crmContact.name || so?.Account_Name?.name || "Client",
    email: crmContact.email,
    companyName: so?.Account_Name?.name ?? null,
  };
}

export type PlannedOrderOutcome = "sent" | "already_sent" | "not_planned" | "not_found";

/**
 * Envoie une commande client planifiée vers Books. Idempotent (verrou par
 * commande + vérification de l'existant), sûr à rappeler.
 */
export async function sendPlannedCrmOrderToBooks(crmSoId: string, trigger: "webhook" | "catch-up"): Promise<PlannedOrderOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crm-planned-books:${crmSoId}`}))`);

    const so = await getCrmSalesOrder(crmSoId);
    if (!so) return "not_found";
    if (so.Status !== PLANNED_STATUS) return "not_planned";

    const local = await findLocalOrder(crmSoId);
    const fromApp = local !== null;
    const reference = `CRM-${so.SO_Number ?? crmSoId}`;
    const label = String(so.Subject ?? reference);

    const items = readOrderedItems(so);
    if (items.length === 0) throw new Error("la commande client n'a aucun article");
    const productIds = Array.from(new Set(items.map((i) => i.productId).filter((id): id is string => !!id)));
    const { lines, unmatched } = mapCrmItemsToBooksLines(
      items,
      await getCrmProductsByIds(productIds),
      await storage.getZohoCatalogItems(false),
    );

    const customFields: BooksCustomField[] = fromApp && SOURCE_FIELD ? [{ customfield_id: SOURCE_FIELD, value: SOURCE_VALUE }] : [];
    const notes = [
      label,
      fromApp ? "Source : Application Système D — rabais 100 % à appliquer à la facturation" : "Source : saisie manuelle CRM",
      `Commande client CRM : ${so.SO_Number ?? crmSoId}`,
      shippingLine(so),
    ].filter(Boolean).join("\n");

    // Déjà envoyé par ce flux (référence CRM-…) : on ne retouche rien.
    const alreadySent = await findBooksSalesOrderByReference(reference);
    if (alreadySent) {
      await persistBooksSo(local, alreadySent.salesorderId, alreadySent.salesorderNumber);
      return "already_sent";
    }

    // Bon créé au paiement par l'ancien flux : on l'aligne sur le CRM (lignes, tag, référence).
    const existing = existingBooksSo(local);

    let salesorderId: string;
    let salesorderNumber: string;
    let action: string;
    if (existing) {
      salesorderId = existing.id;
      salesorderNumber = existing.number ?? existing.id;
      try {
        await updateBooksSalesOrder(salesorderId, { referenceNumber: reference, lineItems: lines, notes, customFields });
        action = "mis à jour";
      } catch (err: any) {
        // Déjà facturé / expédié : on ne touche plus, on se contente de le relier.
        await persistBooksSo(local, salesorderId, salesorderNumber);
        await storage.createActivityLog({
          type: "zoho_books_so_planned", status: "success",
          message: `${label} déjà dans Books (${salesorderNumber}), non modifié : ${err.message}`,
        }).catch(() => {});
        return "already_sent";
      }
    } else {
      const customer = await resolveBooksCustomer(local, so);
      const created = await createBooksSalesOrder({ referenceNumber: reference, customer, lineItems: lines, notes, customFields });
      salesorderId = created.salesorderId;
      salesorderNumber = created.salesorderNumber;
      action = "créé";
    }
    await persistBooksSo(local, salesorderId, salesorderNumber);

    let confirmError: string | null = null;
    await confirmBooksSalesOrder(salesorderId).catch((err: any) => { confirmError = err.message; });

    const url = getZohoBooksSalesOrderUrl(await getZohoRegion(), salesorderId);
    const noteLines = [
      `Bon de commande Books ${salesorderNumber} ${action}${confirmError ? " (À CONFIRMER manuellement dans Books)" : " et confirmé"}.`,
      url,
      fromApp ? (SOURCE_FIELD ? "Tag application posé : rabais 100 % à la facturation." : "Commande application : appliquer le rabais 100 % manuellement (tag Books non configuré).") : null,
      unmatched.length ? `⚠ Articles non reliés à l'inventaire (texte libre, stock non déduit) : ${unmatched.join(", ")}` : null,
    ].filter(Boolean).join("\n");
    await addCrmSalesOrderNote(crmSoId, "Envoyée vers Zoho Books", noteLines).catch(() => {});

    await storage.createActivityLog({
      type: "zoho_books_so_planned",
      status: confirmError || unmatched.length ? "warning" : "success",
      message: `${label} → Books ${salesorderNumber} ${action} (${trigger})${confirmError ? ` ; confirmation échouée : ${confirmError}` : ""}${unmatched.length ? ` ; ${unmatched.length} article(s) non relié(s)` : ""}`,
      metadata: JSON.stringify({ crmSoId, salesorderId, fromApp, unmatched }),
    }).catch(() => {});
    return "sent";
  });
}

/** Version « ne lève jamais » pour le webhook et le rattrapage : erreurs journalisées. */
export async function handlePlannedCrmOrder(crmSoId: string, trigger: "webhook" | "catch-up"): Promise<void> {
  try {
    await sendPlannedCrmOrderToBooks(crmSoId, trigger);
  } catch (err: any) {
    console.error(`[crm-planned] ${crmSoId} : ${err.message}`);
    await storage.createActivityLog({
      type: "zoho_books_so_planned_error", status: "error",
      message: `Envoi vers Books échoué pour la commande client CRM ${crmSoId} (${trigger}) : ${err.message}`,
      metadata: JSON.stringify({ crmSoId }),
    }).catch(() => {});
    if (trigger === "webhook") {
      await addCrmSalesOrderNote(crmSoId, "Échec de l'envoi vers Zoho Books", `${err.message}\nNouvel essai automatique dans 30 minutes.`).catch(() => {});
    }
  }
}

async function catchUpPlannedOrders(): Promise<void> {
  const settings = await storage.getAdminSettings();
  if (!settings?.zohoInventoryRefreshToken || !settings.zohoBooksOrgId) return;
  const ids = await searchCrmSalesOrderIdsByStatus(PLANNED_STATUS, new Date(Date.now() - CATCH_UP_LOOKBACK_MS));
  const systemd = await storage.getSystemdOrders();
  const shopify = await storage.getShopifyOrders();
  for (const id of ids) {
    // Déjà relié localement à un bon Books → rien à faire, sans appel API.
    const linked = systemd.some((o) => o.zohoCrmDealId === id && o.zohoBooksSalesOrderId)
      || shopify.some((o) => o.zohoCrmDealId === id && o.zohoBooksSalesOrderId);
    if (linked) continue;
    await handlePlannedCrmOrder(id, "catch-up");
  }
}

export function startCrmPlannedOrdersScheduler(): void {
  if (!isPlannedOrdersFlowEnabled()) {
    console.log("[crm-planned] CRM → Books (Commande planifier) désactivé : ZOHO_CRM_ORDER_WEBHOOK_SECRET non défini");
    return;
  }
  const run = () => catchUpPlannedOrders().catch((err) => console.error(`[crm-planned] rattrapage : ${err.message}`));
  setTimeout(run, 2 * 60_000);
  setInterval(run, CATCH_UP_INTERVAL_MS);
}
