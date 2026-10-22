/**
 * Orchestration Zoho Books (à la confirmation paiement) et Zoho Projects (au début du traitement).
 */

import { storage } from "./storage";
import type { Contact, ShopifyOrder, SystemdOrder } from "@shared/schema";
import { getZohoRegion } from "./zoho-api";
import { createZohoProject, buildOrderProjectPayload, uploadProjectDocument } from "./zoho-projects";
import { generateOrderPdf, type OrderPdfLineItem } from "./pdf-generator";
import {
  findOrCreateCrmContact,
  findOrCreateCrmProduct,
  createCrmSalesOrder,
  updateCrmSalesOrder,
  uploadSalesOrderAttachment,
  type CrmSalesOrderLine,
  type CrmOrderAddress,
} from "./zoho-crm";
import { dedupeOperationalShopifyOrders, buildPaidSystemdShopifyKeys } from "./shopify-order-identity";
import { fetchShopifyOrderDetail } from "./shopify-api";
import { shopifyAdminUrl } from "@shared/shopify-urls";
import { db } from "./db";
import { sql } from "drizzle-orm";

function appDomainFromEnv(): string {
  const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
  const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
  const preferred = domains.find((d) => !d.endsWith(".replit.app")) || domains[0];
  return /^https?:\/\//i.test(preferred) ? preferred : `https://${preferred}`;
}

export async function ensureZohoProjectWhenProcessingSystemdOrder(orderId: number): Promise<void> {
  const order = (await storage.getSystemdOrders()).find((o) => o.id === orderId);
  if (!order || order.fulfillmentStatus !== "processing") return;
  if (order.zohoProjectId) return;

  const settings = await storage.getAdminSettings();
  if (!settings?.zohoProjectsPortalId) return;

  const contact = await storage.getContact(order.contactId);
  if (!contact) return;

  const source = (order.lineItems as any[])?.[0]?.source === "client_product" ? "client_product" : "systemd";
  const payload = buildOrderProjectPayload(
    {
      systemdOrderId: order.id,
      shopifyOrderName: order.shopifyOrderName,
      amountCents: order.amount,
      currency: order.currency,
      lineItems: order.lineItems,
      zohoBooksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
      zohoBooksSalesOrderUrl: order.zohoBooksSalesOrderUrl,
      source,
    },
    { name: contact.name, email: contact.email, companyName: contact.companyName },
    appDomainFromEnv(),
  );

  try {
    const project = await createZohoProject(settings.zohoProjectsPortalId, payload);
    await storage.updateSystemdOrder(orderId, { zohoProjectId: project.id });
    await storage.createActivityLog({
      type: "zoho_project_create",
      status: "success",
      message: `Projet Zoho ${project.id} créé pour commande Système D #${orderId}`,
    });
  } catch (error: any) {
    await storage.createActivityLog({
      type: "zoho_project_create_error",
      status: "error",
      message: `Projet Zoho échoué pour commande #${orderId}: ${error.message}`,
    }).catch(() => {});
  }
}

export async function ensureZohoProjectWhenProcessingShopifyOrder(
  integrationId: number,
  shopifyOrderId: string,
): Promise<void> {
  const order = (await storage.getShopifyOrders()).find(
    (o) => o.integrationId === integrationId && o.shopifyOrderId === shopifyOrderId,
  );
  if (!order || order.operationalFulfillmentStatus !== "processing") return;
  if (order.zohoProjectId) return;

  const settings = await storage.getAdminSettings();
  if (!settings?.zohoProjectsPortalId) return;

  const contact = await storage.getContact(order.contactId);
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  const amountCents = Math.round(parseFloat(order.totalPrice || "0") * 100);

  const payload = buildOrderProjectPayload(
    {
      systemdOrderId: null,
      shopifyOrderName: order.name,
      shopifyOrderId,
      amountCents,
      currency: order.currency,
      lineItems,
      zohoBooksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
      zohoBooksSalesOrderUrl: order.zohoBooksSalesOrderUrl,
      source: "shopify_direct",
      shopName: order.shopName,
      storeUrl: order.storeUrl,
    },
    {
      name: contact?.name ?? order.customerFirstName ?? order.name,
      email: order.email ?? contact?.email ?? "",
      companyName: contact?.companyName,
    },
    appDomainFromEnv(),
  );

  try {
    const project = await createZohoProject(settings.zohoProjectsPortalId, payload);
    await storage.updateShopifyOrderZohoFields(integrationId, shopifyOrderId, { zohoProjectId: project.id });
    await storage.createActivityLog({
      type: "zoho_project_create",
      status: "success",
      message: `Projet Zoho ${project.id} créé pour Shopify ${order.name}`,
    });
  } catch (error: any) {
    await storage.createActivityLog({
      type: "zoho_project_create_error",
      status: "error",
      message: `Projet Zoho échoué pour Shopify ${order.name}: ${error.message}`,
    }).catch(() => {});
  }
}

/** Commandes Shopify payées non déjà suivies via systemd_orders. */
export function isShopifyOrderEligibleForOpsQueue(
  order: ShopifyOrder,
  systemdShopifyKeys: Set<string>,
): boolean {
  const key = `${order.integrationId}:${order.shopifyOrderId}`;
  if (systemdShopifyKeys.has(key)) return false;
  if (order.financialStatus === "voided" || order.financialStatus === "refunded") return false;
  if (order.financialStatus !== "paid" && order.financialStatus !== "partially_paid") return false;
  if (order.operationalFulfillmentStatus === "completed") return false;
  return true;
}

export function buildSystemdShopifyKeySet(orders: SystemdOrder[]): Set<string> {
  const set = new Set<string>();
  for (const o of orders) {
    if (o.status === "paid" && o.shopifyIntegrationId && o.shopifyOrderId) {
      set.add(`${o.shopifyIntegrationId}:${o.shopifyOrderId}`);
    }
  }
  return set;
}

export type AdminOrderQueueItem = {
  queueKey: string;
  source: "systemd" | "client_product" | "shopify_direct";
  systemdOrderId: number | null;
  shopifyIntegrationId: number | null;
  shopifyOrderId: string | null;
  displayNumber: string;
  shopifyOrderName: string | null;
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  shopName: string | null;
  storeUrl: string | null;
  amountCents: number;
  currency: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  lineItems: unknown;
  shopifyAdminUrl: string | null;
  zohoBooksSalesOrderUrl: string | null;
  zohoCrmDealUrl: string | null;
  zohoProjectId: string | null;
  createdAt: string | null;
};

export async function buildAdminOrderQueue(): Promise<AdminOrderQueueItem[]> {
  const [systemdOrders, shopifyOrders, contacts] = await Promise.all([
    storage.getSystemdOrders(),
    storage.getShopifyOrders(),
    storage.getContacts(),
  ]);
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const systemdKeys = buildPaidSystemdShopifyKeys(systemdOrders, shopifyOrders);
  const items: AdminOrderQueueItem[] = [];

  for (const order of systemdOrders) {
    if (order.status !== "paid") continue;
    if (order.fulfillmentStatus === "completed") continue;
    const contact = contactMap.get(order.contactId);
    const source = (order.lineItems as any[])?.[0]?.source === "client_product" ? "client_product" : "systemd";
    items.push({
      queueKey: `systemd:${order.id}`,
      source,
      systemdOrderId: order.id,
      shopifyIntegrationId: order.shopifyIntegrationId,
      shopifyOrderId: order.shopifyOrderId,
      displayNumber: order.shopifyOrderName ?? `#${order.id}`,
      shopifyOrderName: order.shopifyOrderName,
      contactId: order.contactId,
      contactName: contact?.name ?? null,
      companyName: contact?.companyName ?? null,
      shopName: null,
      storeUrl: null,
      amountCents: order.amount,
      currency: order.currency,
      paymentStatus: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      lineItems: order.lineItems,
      shopifyAdminUrl: order.shopifyAdminUrl,
      zohoBooksSalesOrderUrl: order.zohoBooksSalesOrderUrl,
      zohoCrmDealUrl: order.zohoCrmDealUrl,
      zohoProjectId: order.zohoProjectId,
      createdAt: order.createdAt?.toISOString?.() ?? null,
    });
  }

  for (const order of dedupeOperationalShopifyOrders(shopifyOrders)) {
    if (!isShopifyOrderEligibleForOpsQueue(order, systemdKeys)) continue;
    const contact = contactMap.get(order.contactId);
    const amountCents = Math.round(parseFloat(order.totalPrice || "0") * 100);
    items.push({
      queueKey: `shopify:${order.integrationId}:${order.shopifyOrderId}`,
      source: "shopify_direct",
      systemdOrderId: null,
      shopifyIntegrationId: order.integrationId,
      shopifyOrderId: order.shopifyOrderId,
      displayNumber: order.name,
      shopifyOrderName: order.name,
      contactId: order.contactId,
      contactName: contact?.name ?? null,
      companyName: contact?.companyName ?? null,
      shopName: order.shopName,
      storeUrl: order.storeUrl,
      amountCents,
      currency: order.currency,
      paymentStatus: order.financialStatus ?? "unknown",
      fulfillmentStatus: order.operationalFulfillmentStatus,
      lineItems: order.lineItems,
      shopifyAdminUrl: shopifyAdminUrl(order.storeUrl, "orders", order.shopifyOrderId) || null,
      zohoBooksSalesOrderUrl: order.zohoBooksSalesOrderUrl,
      zohoCrmDealUrl: order.zohoCrmDealUrl,
      zohoProjectId: order.zohoProjectId,
      createdAt: order.shopifyCreatedAt?.toISOString?.() ?? null,
    });
  }

  items.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return items;
}

// ─── Commande client CRM (Sales_Orders) + projet + PDF, au paiement ──────────
// Chaque commande payée (Système D ou Shopify direct) devient une « commande
// client » (module Sales_Orders, Status « Nouvelle commande ») avec ses articles
// en sous-formulaire, un projet du même nom et un PDF joint aux deux.
// NB : les colonnes `zoho_crm_deal_*` conservent leur nom mais stockent
// désormais l'id/url de la commande client.

function normalizeLineItemsForPdf(lineItems: unknown): OrderPdfLineItem[] {
  const items = Array.isArray(lineItems) ? (lineItems as any[]) : [];
  return items.map((it) => ({
    name: String(it.name ?? it.title ?? "Article"),
    sku: it.sku ?? null,
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unitPrice ?? it.price ?? 0) || 0,
  }));
}

/** Sépare un nom complet en prénom / nom (Last_Name requis côté CRM). */
function splitFullName(
  full?: string | null,
  firstName?: string | null,
  lastName?: string | null,
): { firstName: string | null; lastName: string | null } {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first || last) return { firstName: first || null, lastName: last || null };
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Résout l'id du contact CRM à rattacher au devis : le vrai client qui a passé
 * la commande si on a son nom (créé/retrouvé dans le CRM, rattaché au compte),
 * sinon le contact d'intégration par défaut.
 */
async function resolveDealContactId(input: {
  ordererName?: string | null;
  ordererEmail?: string | null;
  ordererFirstName?: string | null;
  ordererLastName?: string | null;
  contact: Contact;
}): Promise<string | null | undefined> {
  const { lastName, firstName } = splitFullName(
    input.ordererName,
    input.ordererFirstName,
    input.ordererLastName,
  );
  if (lastName) {
    const resolved = await findOrCreateCrmContact({
      firstName,
      lastName,
      email: input.ordererEmail,
      accountId: input.contact.zohoCrmAccountId,
    }).catch(() => null);
    if (resolved) return resolved;
  }
  return input.contact.zohoCrmContactId;
}

function buildDealDescription(input: {
  sourceLabel: string;
  storeName: string;
  reference: string;
  contact: Contact;
  ordererName?: string | null;
  ordererEmail?: string | null;
  totalDollars: number;
  currency: string;
  lineItems: OrderPdfLineItem[];
  booksSalesOrderNumber?: string | null;
  projectUrl?: string | null;
}): string {
  const money = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines: (string | null)[] = [
    `Source : ${input.sourceLabel}`,
    `Boutique : ${input.storeName}`,
    `Commande : ${input.reference}`,
    input.ordererName
      ? `Commandé par : ${input.ordererName}${input.ordererEmail ? ` (${input.ordererEmail})` : ""}`
      : null,
    `Client : ${input.contact.name}${input.contact.companyName ? ` — ${input.contact.companyName}` : ""}`,
    input.contact.email ? `Courriel : ${input.contact.email}` : null,
    `Montant : ${money(input.totalDollars)} ${input.currency.toUpperCase()}`,
  ];
  if (input.booksSalesOrderNumber) lines.push(`Bon de commande Zoho Books : ${input.booksSalesOrderNumber}`);
  const items = input.lineItems;
  if (items.length > 0) {
    lines.push("", `Articles (${items.length}) :`);
    for (const li of items) {
      const sku = li.sku ? `  ·  SKU ${li.sku}` : "";
      const lineTotal = li.unitPrice * (Number(li.quantity) || 0);
      lines.push(`  • ${li.name}${sku}`);
      lines.push(`      ${li.quantity} × ${money(li.unitPrice)} $ = ${money(lineTotal)} $`);
    }
  }
  if (input.projectUrl) lines.push("", `Projet : ${input.projectUrl}`);
  return lines.filter((l) => l !== null).join("\n");
}

interface CrmDealFlowInput {
  storeName: string;
  dealName: string;
  reference: string;
  sourceLabel: string;
  totalCents: number;
  currency: string;
  lineItems: OrderPdfLineItem[];
  contact: Contact;
  ordererName?: string | null;
  ordererEmail?: string | null;
  ordererFirstName?: string | null;
  ordererLastName?: string | null;
  booksSalesOrderNumber?: string | null;
  createdAtISO?: string | null;
  /** Projet déjà rattaché à la commande : réutilisé au lieu d'en créer un (évite les doublons). */
  existingProjectId?: string | null;
  billingAddress?: CrmOrderAddress | null;
  shippingAddress?: CrmOrderAddress | null;
}

/** Normalise une adresse Shopify ({address1,city,province,country,zip}) vers CrmOrderAddress. */
function normalizeShopifyAddress(addr: unknown): CrmOrderAddress | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, any>;
  const out: CrmOrderAddress = {
    street: a.address1 ?? a.address2 ?? null,
    city: a.city ?? null,
    state: a.province ?? a.province_code ?? null,
    zip: a.zip ?? null,
    country: a.country ?? a.country_code ?? null,
  };
  // Au moins un champ renseigné pour valoir la peine.
  return Object.values(out).some(Boolean) ? out : null;
}

/** Construit les champs d'adresse (Billing ou Shipping) pour une mise à jour de commande. */
function addressUpdateFields(
  addr: CrmOrderAddress | null,
  prefix: "Billing" | "Shipping",
): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (!addr) return f;
  if (addr.street) f[`${prefix}_Street`] = addr.street;
  if (addr.city) f[`${prefix}_City`] = addr.city;
  if (addr.state) f[`${prefix}_State`] = addr.state;
  if (addr.zip) f[`${prefix}_Code`] = addr.zip;
  if (addr.country) f[`${prefix}_Country`] = addr.country;
  return f;
}

/**
 * Convertit les lignes de commande en lignes « Articles commandés » : chaque
 * article est résolu (ou créé) comme produit CRM et référencé par son id.
 * Les articles non résolus sont ignorés (le produit n'a pas pu être créé).
 */
async function buildSalesOrderLines(
  lineItems: OrderPdfLineItem[],
  dealName: string,
): Promise<CrmSalesOrderLine[]> {
  const lines: CrmSalesOrderLine[] = [];
  for (const it of lineItems) {
    let productId: string | null = null;
    try {
      productId = await findOrCreateCrmProduct({
        name: it.name,
        code: it.sku,
        unitPrice: it.unitPrice,
      });
    } catch (err: any) {
      await storage.createActivityLog({
        type: "zoho_crm_product_error", status: "error",
        message: `Article ignoré sur ${dealName} (${it.sku ?? "sans sku"}): ${err.message}`,
      }).catch(() => {});
    }
    if (!productId) continue;
    lines.push({
      productId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      description: it.name,
    });
  }
  return lines;
}

/**
 * Crée la commande client (Sales_Orders) avec ses articles, le projet (même
 * nom), le PDF joint aux deux, et le lien croisé. `persist.dealCreated` est
 * appelé DÈS la création pour garantir l'idempotence même si une étape
 * ultérieure échoue. (Les colonnes `zoho_crm_deal_*` stockent désormais
 * l'id/url de la commande client.)
 */
async function runCrmDealFlow(
  input: CrmDealFlowInput,
  persist: {
    dealCreated: (dealId: string, dealUrl: string) => Promise<void>;
    projectCreated?: (projectId: string) => Promise<void>;
  },
): Promise<void> {
  const totalDollars = input.totalCents / 100;
  const baseDescription = buildDealDescription({
    sourceLabel: input.sourceLabel,
    storeName: input.storeName,
    reference: input.reference,
    contact: input.contact,
    ordererName: input.ordererName,
    ordererEmail: input.ordererEmail,
    totalDollars,
    currency: input.currency,
    lineItems: input.lineItems,
    booksSalesOrderNumber: input.booksSalesOrderNumber,
  });

  const dealContactId = await resolveDealContactId({
    ordererName: input.ordererName,
    ordererEmail: input.ordererEmail,
    ordererFirstName: input.ordererFirstName,
    ordererLastName: input.ordererLastName,
    contact: input.contact,
  });

  const lines = await buildSalesOrderLines(input.lineItems, input.dealName);
  if (lines.length === 0) {
    // Ordered_Items est obligatoire : sans article résolu, Zoho refuserait.
    throw new Error("aucun article n'a pu être résolu/créé comme produit CRM");
  }

  const { soId, soUrl } = await createCrmSalesOrder({
    subject: input.dealName,
    description: baseDescription,
    accountId: input.contact.zohoCrmAccountId,
    contactId: dealContactId,
    lines,
    billingAddress: input.billingAddress,
    shippingAddress: input.shippingAddress,
  });
  await persist.dealCreated(soId, soUrl);

  const settings = await storage.getAdminSettings();
  let projectId: string | null = input.existingProjectId ?? null;
  let projectUrl: string | null = null;
  // Ne créer un projet que si la commande n'en a pas déjà un (anti-doublon).
  if (settings?.zohoProjectsPortalId && !projectId) {
    try {
      const project = await createZohoProject(settings.zohoProjectsPortalId, {
        name: input.dealName,
        description: `Commande client : ${soUrl}\n\n${baseDescription}`,
      });
      projectId = project.id;
      projectUrl = project.link?.self?.url ?? null;
      if (persist.projectCreated) await persist.projectCreated(projectId);
    } catch (err: any) {
      await storage.createActivityLog({
        type: "zoho_project_create_error", status: "error",
        message: `Projet Zoho échoué pour ${input.dealName}: ${err.message}`,
      }).catch(() => {});
    }
  }

  // PDF (avec les deux liens) joint à la commande et déposé dans les documents du projet.
  try {
    const pdf = await generateOrderPdf(
      {
        reference: input.dealName,
        storeName: input.storeName,
        sourceLabel: input.sourceLabel,
        ordererName: input.ordererName,
        ordererEmail: input.ordererEmail,
        date: input.createdAtISO ?? null,
        currency: input.currency,
        total: totalDollars,
        lineItems: input.lineItems,
        salesOrderNumber: input.booksSalesOrderNumber ?? null,
        dealUrl: soUrl,
        projectUrl,
      },
      { name: input.contact.name, email: input.contact.email, companyName: input.contact.companyName },
    );
    const filename = `${input.dealName.replace(/[^\w.-]+/g, "_")}.pdf`;
    await uploadSalesOrderAttachment(soId, filename, pdf);
    if (projectId && settings?.zohoProjectsPortalId) {
      await uploadProjectDocument(settings.zohoProjectsPortalId, projectId, filename, pdf).catch((err) =>
        storage.createActivityLog({
          type: "zoho_project_doc_error", status: "error",
          message: `PDF projet échoué ${input.dealName}: ${err.message}`,
        }).catch(() => {}));
    }
  } catch (err: any) {
    await storage.createActivityLog({
      type: "zoho_crm_deal_pdf_error", status: "error",
      message: `PDF commande client échoué ${input.dealName}: ${err.message}`,
    }).catch(() => {});
  }

  // Lien retour commande → projet.
  if (projectUrl) {
    await updateCrmSalesOrder(soId, {
      Description: buildDealDescription({
        sourceLabel: input.sourceLabel,
        storeName: input.storeName,
        reference: input.reference,
        contact: input.contact,
        ordererName: input.ordererName,
        ordererEmail: input.ordererEmail,
        totalDollars,
        currency: input.currency,
        lineItems: input.lineItems,
        booksSalesOrderNumber: input.booksSalesOrderNumber,
        projectUrl,
      }),
    }).catch(() => {});
  }
}

export async function ensureCrmDealForSystemdOrder(
  orderId: number,
  options?: { force?: boolean },
): Promise<void> {
  const order = (await storage.getSystemdOrders()).find((o) => o.id === orderId);
  if (!order || order.status !== "paid") return;
  if (order.zohoCrmDealId && !options?.force) return;
  const contact = await storage.getContact(order.contactId);
  if (!contact) return;

  let storeName = "Système D";
  if (order.shopifyIntegrationId) {
    const integ = await storage.getShopifyIntegration(order.shopifyIntegrationId);
    if (integ?.shopName) storeName = integ.shopName;
  }
  const reference = order.shopifyOrderName ?? `#${order.id}`;
  const dealName = `${storeName} ${reference}`;
  const source = (order.lineItems as any[])?.[0]?.source === "client_product" ? "client_product" : "systemd";
  const sourceLabel = source === "client_product" ? "Produit client · Shopify" : "Commande Système D";

  try {
    await runCrmDealFlow(
      {
        storeName, dealName, reference, sourceLabel,
        totalCents: order.amount, currency: order.currency,
        lineItems: normalizeLineItemsForPdf(order.lineItems),
        contact,
        booksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
        createdAtISO: order.createdAt?.toISOString?.() ?? null,
        existingProjectId: order.zohoProjectId,
        // Commande plateforme : pas d'adresse par commande → repli sur l'adresse du contact.
        billingAddress: contact.companyAddress ? { street: contact.companyAddress } : null,
        shippingAddress: contact.companyAddress ? { street: contact.companyAddress } : null,
      },
      {
        dealCreated: (dealId, dealUrl) =>
          storage.updateSystemdOrder(orderId, { zohoCrmDealId: dealId, zohoCrmDealUrl: dealUrl }).then(() => {}),
        projectCreated: order.zohoProjectId
          ? undefined
          : (projectId) => storage.updateSystemdOrder(orderId, { zohoProjectId: projectId }).then(() => {}),
      },
    );
    await storage.createActivityLog({
      type: "zoho_crm_deal_create", status: "success",
      message: `Commande client CRM créée pour Système D ${dealName}`,
      metadata: JSON.stringify({ orderId, dealName }),
    }).catch(() => {});
  } catch (err: any) {
    await storage.createActivityLog({
      type: "zoho_crm_deal_create_error", status: "error",
      message: `Commande client CRM échouée pour ${dealName}: ${err.message}`,
    }).catch(() => {});
  }
}

export async function ensureCrmDealForShopifyOrder(
  integrationId: number,
  shopifyOrderId: string,
  options?: { force?: boolean },
): Promise<void> {
  const order = (await storage.getShopifyOrders()).find(
    (o) => o.integrationId === integrationId && o.shopifyOrderId === shopifyOrderId,
  );
  if (!order) return;
  if (order.zohoCrmDealId && !options?.force) return;
  if (order.financialStatus === "voided" || order.financialStatus === "refunded") return;
  if (order.financialStatus !== "paid" && order.financialStatus !== "partially_paid") return;
  const systemdLinked = (await storage.getSystemdOrders()).some(
    (o) => o.shopifyIntegrationId === integrationId && o.shopifyOrderId === shopifyOrderId && o.status === "paid",
  );
  if (systemdLinked) return;
  const contact = await storage.getContact(order.contactId);
  if (!contact) return;

  const storeName = order.shopName ?? "Boutique";
  const reference = order.name;
  const dealName = `${storeName} ${reference}`;
  const totalCents = Math.round(parseFloat(order.totalPrice || "0") * 100);
  const ordererName = [order.customerFirstName, order.customerLastName]
    .map((p) => (p ?? "").trim()).filter(Boolean).join(" ") || null;

  try {
    await runCrmDealFlow(
      {
        storeName, dealName, reference, sourceLabel: "Shopify direct",
        totalCents, currency: order.currency,
        lineItems: normalizeLineItemsForPdf(order.lineItems),
        contact,
        ordererName,
        ordererEmail: order.email,
        ordererFirstName: order.customerFirstName,
        ordererLastName: order.customerLastName,
        booksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
        createdAtISO: order.shopifyCreatedAt?.toISOString?.() ?? null,
        existingProjectId: order.zohoProjectId,
        billingAddress: normalizeShopifyAddress(order.billingAddress),
        shippingAddress: normalizeShopifyAddress(order.shippingAddress),
      },
      {
        dealCreated: (dealId, dealUrl) =>
          storage.updateShopifyOrderZohoFields(integrationId, shopifyOrderId, { zohoCrmDealId: dealId, zohoCrmDealUrl: dealUrl }),
        projectCreated: order.zohoProjectId
          ? undefined
          : (projectId) => storage.updateShopifyOrderZohoFields(integrationId, shopifyOrderId, { zohoProjectId: projectId }),
      },
    );
    await storage.createActivityLog({
      type: "zoho_crm_deal_create", status: "success",
      message: `Commande client CRM créée pour Shopify ${dealName}`,
      metadata: JSON.stringify({ integrationId, shopifyOrderId, dealName }),
    }).catch(() => {});
    if (!options?.force) {
      await storage.createNotification({
        contactId: order.contactId,
        category: "commande",
        type: "shopify_direct_order_admin_action",
        title: `Commande Shopify ${order.name} à traiter`,
        message: `${order.shopName ?? order.storeUrl} — commande payée sur Shopify (hors parcours app).`,
        metadata: {
          adminOnly: true,
          shopifyIntegrationId: integrationId,
          shopifyOrderId,
          tab: "orders",
          orderSource: "shopify_direct",
        },
      }).catch(() => {});
    }
  } catch (err: any) {
    await storage.createActivityLog({
      type: "zoho_crm_deal_create_error", status: "error",
      message: `Commande client CRM échouée pour ${dealName}: ${err.message}`,
    }).catch(() => {});
  }
}

/**
 * Ré-écrit la description + le contact des commandes client DÉJÀ créées avec le
 * format courant, sans en créer de nouvelles ni toucher aux PDF/articles.
 * Utile après un changement de mise en forme de la description.
 */
export async function refreshCrmDealDescriptions(): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  const contactCache = new Map<number, Contact | undefined>();
  const getContact = async (id: number) => {
    if (!contactCache.has(id)) contactCache.set(id, await storage.getContact(id));
    return contactCache.get(id);
  };
  const integCache = new Map<number, string | null>();
  const getStoreName = async (integrationId: number | null): Promise<string> => {
    if (!integrationId) return "Système D";
    if (!integCache.has(integrationId)) {
      const integ = await storage.getShopifyIntegration(integrationId);
      integCache.set(integrationId, integ?.shopName ?? null);
    }
    return integCache.get(integrationId) ?? "Système D";
  };

  for (const order of await storage.getShopifyOrders()) {
    if (!order.zohoCrmDealId) continue;
    const contact = await getContact(order.contactId);
    if (!contact) continue;
    const ordererName = [order.customerFirstName, order.customerLastName]
      .map((p) => (p ?? "").trim()).filter(Boolean).join(" ") || null;
    const description = buildDealDescription({
      sourceLabel: "Shopify direct",
      storeName: order.shopName ?? "Boutique",
      reference: order.name,
      contact,
      ordererName,
      ordererEmail: order.email,
      totalDollars: parseFloat(order.totalPrice || "0") || 0,
      currency: order.currency,
      lineItems: normalizeLineItemsForPdf(order.lineItems),
      booksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
    });
    const fields: Record<string, unknown> = { Description: description };
    const dealContactId = await resolveDealContactId({
      ordererName,
      ordererEmail: order.email,
      ordererFirstName: order.customerFirstName,
      ordererLastName: order.customerLastName,
      contact,
    });
    if (dealContactId) fields.Contact_Name = { id: dealContactId };
    Object.assign(
      fields,
      addressUpdateFields(normalizeShopifyAddress(order.billingAddress), "Billing"),
      addressUpdateFields(normalizeShopifyAddress(order.shippingAddress), "Shipping"),
    );
    try {
      await updateCrmSalesOrder(order.zohoCrmDealId, fields);
      updated++;
    } catch {
      failed++;
    }
  }

  for (const order of await storage.getSystemdOrders()) {
    if (!order.zohoCrmDealId) continue;
    const contact = await getContact(order.contactId);
    if (!contact) continue;
    const source = (order.lineItems as any[])?.[0]?.source === "client_product" ? "client_product" : "systemd";
    const description = buildDealDescription({
      sourceLabel: source === "client_product" ? "Produit client · Shopify" : "Commande Système D",
      storeName: await getStoreName(order.shopifyIntegrationId),
      reference: order.shopifyOrderName ?? `#${order.id}`,
      contact,
      totalDollars: order.amount / 100,
      currency: order.currency,
      lineItems: normalizeLineItemsForPdf(order.lineItems),
      booksSalesOrderNumber: order.zohoBooksSalesOrderNumber,
    });
    const fields: Record<string, unknown> = { Description: description };
    if (contact.companyAddress) {
      fields.Billing_Street = contact.companyAddress;
      fields.Shipping_Street = contact.companyAddress;
    }
    try {
      await updateCrmSalesOrder(order.zohoCrmDealId, fields);
      updated++;
    } catch {
      failed++;
    }
  }

  return { updated, failed };
}

/**
 * Recrée en « commande client » (Sales_Orders) les commandes qui pointaient
 * encore vers un ancien Deal (ou n'avaient rien). Idempotent : une commande
 * déjà migrée (URL contenant /SalesOrders/) est ignorée. Les anciens Deals ne
 * sont pas supprimés (à nettoyer manuellement dans Zoho si souhaité).
 */
export async function remigrateCrmDealsToSalesOrders(): Promise<{ migrated: number; skipped: number; failed: number }> {
  let migrated = 0, skipped = 0, failed = 0;
  const isSalesOrder = (url?: string | null) => !!url && url.includes("/SalesOrders/");

  for (const order of await storage.getSystemdOrders()) {
    if (order.status !== "paid") continue;
    if (isSalesOrder(order.zohoCrmDealUrl)) { skipped++; continue; }
    try {
      await ensureCrmDealForSystemdOrder(order.id, { force: true });
      const after = (await storage.getSystemdOrders()).find((o) => o.id === order.id);
      if (isSalesOrder(after?.zohoCrmDealUrl)) migrated++; else failed++;
    } catch { failed++; }
  }

  const shopifyOrders = await storage.getShopifyOrders();
  const systemdKeys = buildPaidSystemdShopifyKeys(await storage.getSystemdOrders(), shopifyOrders);
  for (const order of dedupeOperationalShopifyOrders(shopifyOrders)) {
    if (!isShopifyOrderEligibleForOpsQueue(order, systemdKeys)) continue;
    if (isSalesOrder(order.zohoCrmDealUrl)) { skipped++; continue; }
    try {
      await ensureCrmDealForShopifyOrder(order.integrationId, order.shopifyOrderId, { force: true });
      const after = (await storage.getShopifyOrders()).find(
        (o) => o.integrationId === order.integrationId && o.shopifyOrderId === order.shopifyOrderId,
      );
      if (isSalesOrder(after?.zohoCrmDealUrl)) migrated++; else failed++;
    } catch { failed++; }
  }

  return { migrated, skipped, failed };
}

/**
 * Rattrapage adresses : va chercher chaque commande Shopify (ayant une commande
 * client CRM) directement sur Shopify, en extrait les adresses (repli sur
 * l'adresse par défaut du client), les écrit en base ET les pousse sur la
 * commande client CRM. Permet de remplir les adresses sans attendre une re-sync.
 */
export async function syncOrderAddressesFromShopify(): Promise<{ updated: number; noAddress: number; failed: number }> {
  let updated = 0, noAddress = 0, failed = 0;
  const integCache = new Map<number, { storeUrl: string; accessToken: string } | null>();
  const getInteg = async (id: number) => {
    if (!integCache.has(id)) {
      const i = await storage.getShopifyIntegration(id);
      integCache.set(id, i ? { storeUrl: i.storeUrl, accessToken: i.accessToken } : null);
    }
    return integCache.get(id);
  };

  for (const order of await storage.getShopifyOrders()) {
    if (!order.zohoCrmDealId) continue; // on ne patche que les commandes déjà dans le CRM
    // Un ancien Deal (/Potentials/) n'est pas une commande client : un PUT dessus
    // via /Sales_Orders/ renverrait 404. On ne touche que les vraies Sales_Orders.
    if (!order.zohoCrmDealUrl || !order.zohoCrmDealUrl.includes("/SalesOrders/")) continue;
    const integ = await getInteg(order.integrationId);
    if (!integ) { failed++; continue; }
    try {
      const raw = await fetchShopifyOrderDetail(integ.storeUrl, integ.accessToken, order.shopifyOrderId) as any;
      const billing = normalizeShopifyAddress(raw.billing_address) ?? normalizeShopifyAddress(raw.customer?.default_address);
      const shipping = normalizeShopifyAddress(raw.shipping_address) ?? billing;
      if (!billing && !shipping) { noAddress++; continue; }

      await storage.updateShopifyOrderAddresses(order.integrationId, order.shopifyOrderId, {
        billingAddress: raw.billing_address ?? raw.customer?.default_address ?? null,
        shippingAddress: raw.shipping_address ?? raw.billing_address ?? raw.customer?.default_address ?? null,
      });

      const fields: Record<string, unknown> = {};
      Object.assign(fields, addressUpdateFields(billing, "Billing"), addressUpdateFields(shipping, "Shipping"));
      if (Object.keys(fields).length > 0) {
        await updateCrmSalesOrder(order.zohoCrmDealId, fields);
      }
      updated++;
    } catch (err: any) {
      failed++;
      const reason = err?.message ?? String(err);
      console.error(`[addresses] ✗ ${order.name} (dealId=${order.zohoCrmDealId}, url=${order.zohoCrmDealUrl ?? "?"}): ${reason}`);
      await storage.createActivityLog({
        type: "zoho_crm_deal_create_error", status: "error",
        message: `Adresses échouées ${order.name}: ${reason}`,
      }).catch(() => {});
    }
  }
  return { updated, noAddress, failed };
}

/**
 * Point d'entrée au paiement : commande client CRM seulement. Books ne reçoit la
 * commande qu'à l'état « Commande planifier » (voir crm-planned-orders.ts).
 */
export async function ensureZohoOrderPipelineForSystemdOrder(orderId: number): Promise<void> {
  await ensureCrmDealForSystemdOrder(orderId);
}

export async function afterShopifyOrdersSynced(integrationId: number): Promise<void> {
  const orders = await storage.getShopifyOrders();
  const systemdKeys = buildPaidSystemdShopifyKeys(await storage.getSystemdOrders(), orders);
  for (const order of dedupeOperationalShopifyOrders(orders)) {
    if (order.integrationId !== integrationId) continue;
    if (!isShopifyOrderEligibleForOpsQueue(order, systemdKeys)) continue;
    await ensureCrmDealForShopifyOrder(integrationId, order.shopifyOrderId);
  }
}
