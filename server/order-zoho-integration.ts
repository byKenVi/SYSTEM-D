/**
 * Orchestration Zoho Books (à la confirmation paiement) et Zoho Projects (au début du traitement).
 */

import { storage } from "./storage";
import type { ShopifyOrder, SystemdOrder } from "@shared/schema";
import { createBooksSalesOrder, getZohoBooksSalesOrderUrl, type BooksLineItem } from "./zoho-books";
import { getZohoRegion } from "./zoho-api";
import { createZohoProject, buildOrderProjectPayload } from "./zoho-projects";
import { normalizeShopifyStoreUrl } from "./shopify-credit-policy";

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
  const all = await storage.getShopifyOrders();
  const order = all.find((o) => o.integrationId === integrationId && o.shopifyOrderId === shopifyOrderId);
  if (!order) return;
  if (order.zohoBooksSalesOrderId) return;
  if (order.financialStatus === "voided" || order.financialStatus === "refunded") return;
  if (order.financialStatus !== "paid" && order.financialStatus !== "partially_paid") return;

  const systemdLinked = (await storage.getSystemdOrders()).some(
    (o) => o.shopifyIntegrationId === integrationId && o.shopifyOrderId === shopifyOrderId && o.status === "paid",
  );
  if (systemdLinked) return;

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
  const systemdKeys = buildSystemdShopifyKeySet(systemdOrders);
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
      zohoProjectId: order.zohoProjectId,
      createdAt: order.createdAt?.toISOString?.() ?? null,
    });
  }

  for (const order of shopifyOrders) {
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
      shopifyAdminUrl: order.storeUrl
        ? `https://${normalizeShopifyStoreUrl(order.storeUrl)}/admin/orders/${order.shopifyOrderId}`
        : null,
      zohoBooksSalesOrderUrl: order.zohoBooksSalesOrderUrl,
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

export async function afterShopifyOrdersSynced(integrationId: number): Promise<void> {
  const orders = await storage.getShopifyOrders();
  const systemdKeys = buildSystemdShopifyKeySet(await storage.getSystemdOrders());
  for (const order of orders) {
    if (order.integrationId !== integrationId) continue;
    if (!isShopifyOrderEligibleForOpsQueue(order, systemdKeys)) continue;
    await ensureBooksSalesOrderForShopifyOrder(integrationId, order.shopifyOrderId);
  }
}
