/**
 * Orchestration Zoho Books (à la confirmation paiement) et Zoho Projects (au début du traitement).
 */

import { storage } from "./storage";
import type { Contact, ShopifyOrder, SystemdOrder } from "@shared/schema";
import { createBooksSalesOrder, getZohoBooksSalesOrderUrl, type BooksLineItem } from "./zoho-books";
import { getZohoRegion } from "./zoho-api";
import { createZohoProject, buildOrderProjectPayload, uploadProjectDocument } from "./zoho-projects";
import { normalizeShopifyStoreUrl } from "./shopify-credit-policy";
import { generateOrderPdf, type OrderPdfLineItem } from "./pdf-generator";
import { createCrmDeal, updateCrmDeal, uploadDealAttachment, findOrCreateCrmContact, ORDER_DEAL_STAGE } from "./zoho-crm";
import { dedupeOperationalShopifyOrders, buildPaidSystemdShopifyKeys } from "./shopify-order-identity";
import { shopifyAdminUrl } from "@shared/shopify-urls";
import { db } from "./db";
import { sql } from "drizzle-orm";

function appDomainFromEnv(): string {
  const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
  const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
  const preferred = domains.find((d) => !d.endsWith(".replit.app")) || domains[0];
  return /^https?:\/\//i.test(preferred) ? preferred : `https://${preferred}`;
}

function systemdReference(order: SystemdOrder): string {
  return order.shopifyOrderName ?? `SD-${order.id}`;
}

function booksLineItemsFromSystemd(order: SystemdOrder): BooksLineItem[] {
  const items = Array.isArray(order.lineItems) ? (order.lineItems as any[]) : [];
  if (items.length === 0) {
    return [{
      name: "Commande Système D",
      quantity: 1,
      rate: order.amount / 100,
      description: `Commande #${order.id}`,
    }];
  }
  return items.map((item) => ({
    name: String(item.name ?? "Article"),
    sku: item.sku ?? null,
    quantity: Number(item.quantity) || 1,
    rate: Number(item.unitPrice) || 0,
    description: item.zohoItemId ? `Zoho item: ${item.zohoItemId}` : undefined,
  }));
}

function booksLineItemsFromShopify(order: ShopifyOrder): BooksLineItem[] {
  const items = Array.isArray(order.lineItems) ? (order.lineItems as any[]) : [];
  if (items.length === 0) {
    return [{
      name: order.name,
      quantity: 1,
      rate: parseFloat(order.totalPrice || "0") || 0,
    }];
  }
  return items.map((item) => ({
    name: String(item.title ?? item.name ?? "Article"),
    sku: item.sku ?? null,
    quantity: Number(item.quantity) || 1,
    rate: parseFloat(item.price ?? "0") || 0,
  }));
}

export async function ensureBooksSalesOrderForSystemdOrder(orderId: number): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`books-systemd:${orderId}`}))`);
    await createBooksSalesOrderForSystemdOrderIfMissing(orderId);
  });
}

async function createBooksSalesOrderForSystemdOrderIfMissing(orderId: number): Promise<void> {
  const orders = await storage.getSystemdOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order || order.status !== "paid") return;
  if (order.zohoBooksSalesOrderId) return;

  const contact = await storage.getContact(order.contactId);
  if (!contact?.email) {
    console.warn(`[zoho-books] Skip SO systemd #${orderId}: contact sans courriel`);
    return;
  }

  try {
    const source = (order.lineItems as any[])?.[0]?.source === "client_product" ? "client_product" : "systemd";
    const { salesorderId, salesorderNumber } = await createBooksSalesOrder({
      referenceNumber: systemdReference(order),
      customer: {
        name: contact.name,
        email: contact.email,
        companyName: contact.companyName,
      },
      lineItems: booksLineItemsFromSystemd(order),
      notes: [
        `Source Système D: ${source}`,
        `Commande interne #${order.id}`,
        order.shopifyOrderName ? `Shopify: ${order.shopifyOrderName}` : null,
      ].filter(Boolean).join("\n"),
    });
    const region = await getZohoRegion();
    await storage.updateSystemdOrder(orderId, {
      zohoBooksSalesOrderId: salesorderId,
      zohoBooksSalesOrderNumber: salesorderNumber,
      zohoBooksSalesOrderUrl: getZohoBooksSalesOrderUrl(region, salesorderId),
    });
    await storage.createActivityLog({
      type: "zoho_books_so_create",
      status: "success",
      message: `Books SO ${salesorderNumber} créé pour commande Système D #${orderId}`,
      metadata: JSON.stringify({ orderId, salesorderId }),
    });
  } catch (error: any) {
    console.error(`[zoho-books] systemd #${orderId}: ${error.message}`);
    await storage.createActivityLog({
      type: "zoho_books_so_create_error",
      status: "error",
      message: `Books SO échoué pour commande #${orderId}: ${error.message}`,
    }).catch(() => {});
  }
}

export async function ensureBooksSalesOrderForShopifyOrder(
  integrationId: number,
  shopifyOrderId: string,
): Promise<void> {
  const candidate = (await storage.getShopifyOrders()).find(order =>
    order.integrationId === integrationId && order.shopifyOrderId === shopifyOrderId);
  if (!candidate) return;
  const store = normalizeShopifyStoreUrl(candidate.storeUrl) || `integration-${integrationId}`;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`books-shopify:${store}:${shopifyOrderId}`}))`);
    // Re-read after acquisition; all aliases of the same store/order share this lock.
    await createBooksSalesOrderForShopifyOrderIfMissing(integrationId, shopifyOrderId);
  });
}

async function createBooksSalesOrderForShopifyOrderIfMissing(integrationId: number, shopifyOrderId: string): Promise<void> {
  const all = await storage.getShopifyOrders();
  const order = all.find((o) => o.integrationId === integrationId && o.shopifyOrderId === shopifyOrderId);
  if (!order) return;
  if (order.zohoBooksSalesOrderId) return;
  if (order.financialStatus === "voided" || order.financialStatus === "refunded") return;
  if (order.financialStatus !== "paid" && order.financialStatus !== "partially_paid") return;

  const systemdLinked = buildPaidSystemdShopifyKeys(await storage.getSystemdOrders(), all)
    .has(`${integrationId}:${shopifyOrderId}`);
  if (systemdLinked) return;

  const existingAlias = all.find(candidate =>
    candidate.shopifyOrderId === shopifyOrderId
    && normalizeShopifyStoreUrl(candidate.storeUrl) === normalizeShopifyStoreUrl(order.storeUrl)
    && candidate.zohoBooksSalesOrderId);
  if (existingAlias) {
    await storage.updateShopifyOrderZohoFields(integrationId, shopifyOrderId, {
      zohoBooksSalesOrderId: existingAlias.zohoBooksSalesOrderId ?? undefined,
      zohoBooksSalesOrderNumber: existingAlias.zohoBooksSalesOrderNumber ?? undefined,
      zohoBooksSalesOrderUrl: existingAlias.zohoBooksSalesOrderUrl ?? undefined,
    });
    return;
  }
  const contact = await storage.getContact(order.contactId);
  const email = order.email ?? contact?.email;
  if (!email) {
    console.warn(`[zoho-books] Skip SO Shopify ${order.name}: pas de courriel`);
    return;
  }

  try {
    const { salesorderId, salesorderNumber } = await createBooksSalesOrder({
      referenceNumber: order.name,
      customer: {
        name: contact?.name ?? order.customerFirstName ?? order.name,
        email,
        companyName: contact?.companyName,
      },
      lineItems: booksLineItemsFromShopify(order),
      notes: [
        "Source: Shopify (commande boutique directe)",
        `Boutique: ${order.shopName ?? order.storeUrl}`,
        `Shopify ID: ${shopifyOrderId}`,
      ].join("\n"),
    });
    const region = await getZohoRegion();
    await storage.updateShopifyOrderZohoFields(integrationId, shopifyOrderId, {
      zohoBooksSalesOrderId: salesorderId,
      zohoBooksSalesOrderNumber: salesorderNumber,
      zohoBooksSalesOrderUrl: getZohoBooksSalesOrderUrl(region, salesorderId),
    });
    await storage.createActivityLog({
      type: "zoho_books_so_create",
      status: "success",
      message: `Books SO ${salesorderNumber} créé pour Shopify ${order.name}`,
      metadata: JSON.stringify({ integrationId, shopifyOrderId, salesorderId }),
    });
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
  } catch (error: any) {
    console.error(`[zoho-books] Shopify ${order.name}: ${error.message}`);
    await storage.createActivityLog({
      type: "zoho_books_so_create_error",
      status: "error",
      message: `Books SO échoué pour Shopify ${order.name}: ${error.message}`,
    }).catch(() => {});
  }
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

// ─── Devis CRM (pipeline) + projet + PDF, au paiement ─────────────────────────
// Chaque commande payée (Système D ou Shopify direct) devient un "devis" dans le
// module Deals, avec un projet du même nom et un PDF joint aux deux.

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
}

/**
 * Crée le devis, le projet (même nom), le PDF joint aux deux, et le lien croisé.
 * `persist.dealCreated` est appelé DÈS la création du devis pour garantir
 * l'idempotence même si une étape ultérieure échoue.
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

  const { dealId, dealUrl } = await createCrmDeal({
    dealName: input.dealName,
    amount: totalDollars,
    stage: ORDER_DEAL_STAGE,
    description: baseDescription,
    accountId: input.contact.zohoCrmAccountId,
    contactId: dealContactId,
  });
  await persist.dealCreated(dealId, dealUrl);

  const settings = await storage.getAdminSettings();
  let projectId: string | null = null;
  let projectUrl: string | null = null;
  if (settings?.zohoProjectsPortalId) {
    try {
      const project = await createZohoProject(settings.zohoProjectsPortalId, {
        name: input.dealName,
        description: `${baseDescription}\n\nDevis CRM : ${dealUrl}`,
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

  // PDF (avec les deux liens) joint au devis et déposé dans les documents du projet.
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
        dealUrl,
        projectUrl,
      },
      { name: input.contact.name, email: input.contact.email, companyName: input.contact.companyName },
    );
    const filename = `${input.dealName.replace(/[^\w.-]+/g, "_")}.pdf`;
    await uploadDealAttachment(dealId, filename, pdf);
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
      message: `PDF devis échoué ${input.dealName}: ${err.message}`,
    }).catch(() => {});
  }

  // Lien retour devis → projet.
  if (projectUrl) {
    await updateCrmDeal(dealId, {
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

export async function ensureCrmDealForSystemdOrder(orderId: number): Promise<void> {
  const order = (await storage.getSystemdOrders()).find((o) => o.id === orderId);
  if (!order || order.status !== "paid") return;
  if (order.zohoCrmDealId) return;
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
      message: `Devis CRM créé pour commande Système D ${dealName}`,
      metadata: JSON.stringify({ orderId, dealName }),
    }).catch(() => {});
  } catch (err: any) {
    await storage.createActivityLog({
      type: "zoho_crm_deal_create_error", status: "error",
      message: `Devis CRM échoué pour ${dealName}: ${err.message}`,
    }).catch(() => {});
  }
}

export async function ensureCrmDealForShopifyOrder(
  integrationId: number,
  shopifyOrderId: string,
): Promise<void> {
  const order = (await storage.getShopifyOrders()).find(
    (o) => o.integrationId === integrationId && o.shopifyOrderId === shopifyOrderId,
  );
  if (!order || order.zohoCrmDealId) return;
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
      message: `Devis CRM créé pour Shopify ${dealName}`,
      metadata: JSON.stringify({ integrationId, shopifyOrderId, dealName }),
    }).catch(() => {});
  } catch (err: any) {
    await storage.createActivityLog({
      type: "zoho_crm_deal_create_error", status: "error",
      message: `Devis CRM échoué pour ${dealName}: ${err.message}`,
    }).catch(() => {});
  }
}

/**
 * Ré-écrit la description des devis CRM DÉJÀ créés avec le format courant
 * (ex. ajout de « Commandé par »), sans créer de doublon ni toucher aux PDF.
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
    try {
      await updateCrmDeal(order.zohoCrmDealId, fields);
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
    try {
      await updateCrmDeal(order.zohoCrmDealId, { Description: description });
      updated++;
    } catch {
      failed++;
    }
  }

  return { updated, failed };
}

/** Point d'entrée unique au paiement d'une commande Système D : Books → Devis CRM. */
export async function ensureZohoOrderPipelineForSystemdOrder(orderId: number): Promise<void> {
  await ensureBooksSalesOrderForSystemdOrder(orderId);
  await ensureCrmDealForSystemdOrder(orderId);
}

export async function afterShopifyOrdersSynced(integrationId: number): Promise<void> {
  const orders = await storage.getShopifyOrders();
  const systemdKeys = buildPaidSystemdShopifyKeys(await storage.getSystemdOrders(), orders);
  for (const order of dedupeOperationalShopifyOrders(orders)) {
    if (order.integrationId !== integrationId) continue;
    if (!isShopifyOrderEligibleForOpsQueue(order, systemdKeys)) continue;
    await ensureBooksSalesOrderForShopifyOrder(integrationId, order.shopifyOrderId);
    await ensureCrmDealForShopifyOrder(integrationId, order.shopifyOrderId);
  }
}
