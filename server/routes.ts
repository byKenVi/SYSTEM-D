import { createHash } from "crypto";
import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { insertShopifyIntegrationSchema, insertAdminSettingsSchema } from "@shared/schema";
import { sendInviteEmail, sendFormSubmissionEmail, sendFormStatusEmail, sendFormAdminNotificationEmail, sendSystemdOrderConfirmationEmail, sendSystemdOrderAdminEmail } from "./resend";
import { db } from "./db";
import { users as usersTable } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { resolveClientProductContactIds } from "./client-product-scope";
import { isShopifyCreditSufficient, normalizeShopifyStoreUrl, shopifyCreditHttpStatus } from "./shopify-credit-policy";
import multer from "multer";
import path from "path";
import fs from "fs";
import { buildAuthUrl, exchangeCodeForTokens, fetchZohoOrganizations, getCallbackUrl, invalidateAccessTokenCache, logZohoCredentialDiagnostic } from "./zoho-auth";
import { syncZohoItemsForContact, testZohoConnection, pushItemToZoho, updateZohoItemClient, setZohoItemStock, fetchZohoItemsMap, createFormSalesOrder, getZohoSOUrl, getZohoRegion, ensureZohoContact } from "./zoho-api";
import { getZohoProjectsPortals, createZohoProject, buildProjectPayload } from "./zoho-projects";
import { generateFormPdf } from "./pdf-generator";
import {
  fetchAllProducts,
  normalizeProducts,
  testShopifyConnection,
  validateShopifyStoreUrl,
  fetchShopifyOrders,
} from "./shopify-api";

function buildStatusNotification(
  formType: string,
  fromStatus: string,
  toStatus: string,
  formNumber: string,
  formId: number
): { category: string; type: string; title: string; message: string; metadata: object } | null {
  const meta = { formId, formNumber, formType };
  if (toStatus === "in_review") {
    return {
      category: "compte",
      type: "devis_preparation",
      title: "Dossier en cours d'évaluation",
      message: `Votre dossier ${formNumber} est actuellement en cours d'évaluation par notre équipe.`,
      metadata: meta,
    };
  }
  if (toStatus === "approved") {
    if (formType === "livraison") {
      return {
        category: "livraison",
        type: "colis_expedie",
        title: "Colis expédié",
        message: `Votre livraison ${formNumber} a été confirmée et est en route.`,
        metadata: meta,
      };
    }
    if (formType === "copacking") {
      return {
        category: "commande",
        type: "commande_approuvee",
        title: "Commande approuvée",
        message: `Votre commande ${formNumber} a été approuvée et est en cours de préparation.`,
        metadata: meta,
      };
    }
    return {
      category: "compte",
      type: "nouveau_devis",
      title: "Nouveau devis disponible",
      message: `Votre devis pour ${formNumber} est prêt. Notre équipe vous contactera prochainement.`,
      metadata: meta,
    };
  }
  if (toStatus === "completed") {
    if (formType === "livraison") {
      return {
        category: "livraison",
        type: "colis_livre",
        title: "Colis livré",
        message: `Votre livraison ${formNumber} a été complétée avec succès.`,
        metadata: meta,
      };
    }
    if (formType === "copacking") {
      return {
        category: "commande",
        type: "commande_expediee",
        title: "Commande complétée",
        message: `Votre commande ${formNumber} a été traitée et complétée.`,
        metadata: meta,
      };
    }
    return {
      category: "compte",
      type: "dossier_complete",
      title: "Dossier complété",
      message: `Votre dossier ${formNumber} a été complété. Merci de votre confiance.`,
      metadata: meta,
    };
  }
  return null;
}

// systemdProductsCache supprimé — la boutique lit maintenant depuis zoho_catalog (pas de quota Zoho)

/**
 * Non-blocking helper: fetches current Zoho inventory and updates the DB.
 * Designed to be called fire-and-forget (with .catch) after token changes.
 */
async function triggerZohoSyncNow(): Promise<void> {
  const allProducts = await storage.getProducts();
  const pushedProducts = allProducts.filter(
    (p) => p.pushedToZoho && p.zohoItemId && !p.zohoItemId.startsWith("pending-")
  );
  if (pushedProducts.length === 0) return;

  const itemsMap = await fetchZohoItemsMap();
  let updated = 0;
  for (const product of pushedProducts) {
    const zohoData = itemsMap.get(product.zohoItemId!);
    if (!zohoData) continue;
    await storage.updateProduct(product.id, {
      zohoInventoryQuantity: zohoData.stock,
      lastSyncedAt: new Date(),
    });
    updated++;
  }

  await storage.createActivityLog({
    type: "zoho_inventory_sync",
    status: "success",
    message: `Post-connect sync: updated stock for ${updated} product${updated !== 1 ? "s" : ""}`,
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  async function getAdminUserId(): Promise<string | null> {
    const settings = await storage.getAdminSettings();
    return settings?.adminUserId || null;
  }

  async function setAdminUserId(userId: string): Promise<void> {
    const settings = await storage.getAdminSettings();
    if (settings) {
      await storage.upsertAdminSettings({ ...settings, adminUserId: userId });
    } else {
      await storage.upsertAdminSettings({ adminUserId: userId });
    }
  }

  async function getUserRole(req: any) {
    const userId = req.user?.claims?.sub;
    let email = req.user?.claims?.email as string | undefined;
    if (!userId) return null;

    // Fallback: look up email from users table if not in JWT claims
    if (!email) {
      const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      email = dbUser?.email ?? undefined;
    }

    const adminId = await getAdminUserId();
    if (!adminId) {
      await setAdminUserId(userId);
      return { role: "admin" as const };
    }

    if (userId === adminId) {
      return { role: "admin" as const };
    }

    // Check env-var-defined extra admin user IDs (comma-separated Replit user IDs)
    const envAdminIds = (process.env.ADDITIONAL_ADMIN_IDS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (envAdminIds.includes(userId)) {
      return { role: "admin" as const };
    }

    if (email) {
      // Check env-var-defined extra admin emails (comma-separated)
      const envAdminEmails = (process.env.ADDITIONAL_ADMIN_EMAILS || "")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (envAdminEmails.includes(email.toLowerCase())) {
        return { role: "admin" as const };
      }

      const settings = await storage.getAdminSettings();
      const extraAdmins = settings?.additionalAdminEmails
        ? settings.additionalAdminEmails.split(",").map((e) => e.trim().toLowerCase())
        : [];
      if (extraAdmins.includes(email.toLowerCase())) {
        return { role: "admin" as const };
      }
    }

    const contact = await storage.getContactByUserId(userId);
    if (contact) {
      if (contact.status === "revoked") {
        return null;
      }
      return { role: "client" as const, contactId: contact.id };
    }

    if (email) {
      const contactByEmail = await storage.getContactByEmail(email);
      if (contactByEmail) {
        if (contactByEmail.status === "revoked") {
          return null;
        }
        // Link the contact to the real user ID if it has no userId, or if the current
        // userId is a placeholder (e.g. "portal-invited-X") and the real Replit sub differs.
        const isPlaceholder = !contactByEmail.userId || contactByEmail.userId.startsWith("portal-invited-");
        if (isPlaceholder && contactByEmail.userId !== userId) {
          await storage.updateContact(contactByEmail.id, {
            userId,
            status: "active",
          });
        }
        return { role: "client" as const, contactId: contactByEmail.id };
      }
    }

    return null;
  }

  async function getAuthenticatedEmail(req: any): Promise<string | null> {
    const claimedEmail = req.user?.claims?.email;
    if (typeof claimedEmail === "string" && claimedEmail.trim()) {
      return claimedEmail.trim().toLowerCase();
    }
    const userId = req.user?.claims?.sub;
    if (!userId) return null;
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    return dbUser?.email?.trim().toLowerCase() || null;
  }

  async function getProductContactIds(contactId: number): Promise<number[]> {
    const [contact, contacts] = await Promise.all([
      storage.getContact(contactId),
      storage.getContacts(),
    ]);
    return contact ? resolveClientProductContactIds(contact, contacts) : [];
  }

  function dedupeShopifyOrders<T extends { integrationId: number; shopifyOrderId: string; storeUrl: string; syncedAt?: Date | null }>(orders: T[]): T[] {
    const byStoreAndOrder = new Map<string, T>();
    for (const order of orders) {
      const key = `${normalizeShopifyStoreUrl(order.storeUrl)}:${order.shopifyOrderId}`;
      const current = byStoreAndOrder.get(key);
      if (!current || Number(order.syncedAt ?? 0) > Number(current.syncedAt ?? 0)) {
        byStoreAndOrder.set(key, order);
      }
    }
    return [...byStoreAndOrder.values()];
  }

  function findShopifyIntegration(
    integrations: Awaited<ReturnType<typeof storage.getShopifyIntegrations>>,
    input: { integrationId?: number | null; storeUrl?: string | null; allowedContactIds?: number[]; activeOnly?: boolean },
  ) {
    const normalizedStore = normalizeShopifyStoreUrl(input.storeUrl);
    const scoped = integrations.filter((integration) =>
      (!input.allowedContactIds || input.allowedContactIds.includes(integration.contactId))
      && (!input.activeOnly || integration.isActive),
    );
    if (input.integrationId) {
      const byId = scoped.find((integration) => integration.id === input.integrationId);
      if (byId) return byId;
    }
    if (normalizedStore) {
      return scoped.find((integration) => normalizeShopifyStoreUrl(integration.storeUrl) === normalizedStore);
    }
    return undefined;
  }

  function cachedOrderAsShopify(order: any) {
    return {
      id: String(order.shopifyOrderId),
      name: order.name,
      created_at: order.shopifyCreatedAt?.toISOString?.() ?? order.shopifyCreatedAt ?? null,
      financial_status: order.financialStatus,
      fulfillment_status: order.fulfillmentStatus,
      total_price: order.totalPrice,
      currency: order.currency,
      email: order.email,
      customer: (order.customerFirstName || order.customerLastName)
        ? { first_name: order.customerFirstName ?? "", last_name: order.customerLastName ?? "" }
        : null,
      line_items: Array.isArray(order.lineItems) ? order.lineItems : [],
    };
  }

  const isAdmin: RequestHandler = async (req: any, res, next) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      next();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  app.get("/api/auth/role", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });
      res.json(role);
    } catch (error) {
      console.error("Error getting user role:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ====== ADMIN-ONLY ROUTES ======
  app.get("/api/contacts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contact = await storage.getContact(Number(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts/:id/resend-invite", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contact = await storage.getContact(Number(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      if (contact.status === "revoked") {
        await storage.updateContact(contact.id, { status: "invited", userId: null });
      }
      await sendInviteEmail({
        name: contact.name,
        email: contact.email,
        companyName: contact.companyName,
      });
      await storage.createActivityLog({ type: "contact_invite", status: "success", message: `Invite sent to ${contact.name} (${contact.email})` });
      res.json({ message: "Invite resent", contactId: contact.id });
    } catch (error: any) {
      const technicalMsg = error?.message || "Unknown error";
      console.error("[resend] Error resending invite:", technicalMsg);
      await storage.createActivityLog({ type: "contact_invite", status: "error", message: `Invite failed for ${req.params.id}: ${technicalMsg}` }).catch(() => {});
      res.status(500).json({ message: "L'envoi de l'invitation a échoué. Veuillez vérifier la configuration email et réessayer." });
    }
  });

  app.post("/api/contacts/:id/revoke-access", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contact = await storage.getContact(Number(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      const updated = await storage.updateContact(contact.id, {
        userId: null,
        status: "revoked",
      });
      await storage.createActivityLog({ type: "contact_revoke", status: "success", message: `Access revoked for ${contact.name} (${contact.email})` });
      res.json({ message: "Access revoked", contact: updated });
    } catch (error) {
      console.error("Error revoking access:", error);
      res.status(500).json({ message: "Failed to revoke access" });
    }
  });

  app.delete("/api/contacts/bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No contact IDs provided" });
      }
      let deleted = 0;
      for (const id of ids) {
        const contact = await storage.getContact(id);
        if (contact) {
          await storage.deleteContact(contact.id);
          deleted++;
        }
      }
      await storage.createActivityLog({ type: "contact_delete", status: "success", message: `${deleted} contact(s) bulk deleted` });
      res.json({ message: `${deleted} contact(s) deleted` });
    } catch (error) {
      console.error("Error bulk deleting contacts:", error);
      res.status(500).json({ message: "Failed to delete contacts" });
    }
  });

  app.delete("/api/contacts/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contact = await storage.getContact(Number(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      await storage.deleteContact(contact.id);
      await storage.createActivityLog({ type: "contact_delete", status: "success", message: `Contact "${contact.name}" (${contact.email}) deleted` });
      res.json({ message: "Contact deleted" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.get("/api/contacts/:id/related", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.id);
      const contact = await storage.getContact(contactId);
      if (!contact || !contact.companyName) return res.json([]);
      const all = await storage.getContacts();
      const related = all.filter(
        (c) => c.id !== contactId && c.companyName && c.companyName.toLowerCase() === contact.companyName!.toLowerCase()
      );
      res.json(related);
    } catch (error) {
      console.error("Error fetching related contacts:", error);
      res.status(500).json({ message: "Failed to fetch related contacts" });
    }
  });

  app.get("/api/contacts/:id/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const products = await storage.getProductsByContactId(Number(req.params.id));
      res.json(products);
    } catch (error) {
      console.error("Error fetching contact products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/contacts/:id/shopify-integrations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const all = await storage.getShopifyIntegrations();
      const contactIntegrations = all.filter((i) => i.contactId === Number(req.params.id));
      res.json(contactIntegrations);
    } catch (error) {
      console.error("Error fetching contact shopify integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  // ====== DASHBOARD KPI HELPERS ======

  function computeOrderKpis(orders: any[]) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const live = orders.filter((o) => o.financialStatus !== "voided" && o.financialStatus !== "refunded");
    const thisMonth = live.filter((o) => o.shopifyCreatedAt && new Date(o.shopifyCreatedAt) >= startOfMonth);
    const prevMonth = live.filter((o) => {
      const d = o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt) : null;
      return d && d >= startOfPrevMonth && d < startOfMonth;
    });
    const last30 = live.filter((o) => o.shopifyCreatedAt && new Date(o.shopifyCreatedAt) >= thirtyDaysAgo);

    const sumPrice = (arr: any[]) => arr.reduce((s: number, o: any) => s + parseFloat(o.totalPrice || "0"), 0);

    const ordersThisMonth = thisMonth.length;
    const valueThisMonth = sumPrice(thisMonth);
    const ordersPrevMonth = prevMonth.length;
    const valuePrevMonth = sumPrice(prevMonth);
    const ordersLast30Days = last30.length;
    const valueLast30Days = sumPrice(last30);

    const ordersTrend = ordersPrevMonth > 0 ? Math.round(((ordersThisMonth - ordersPrevMonth) / ordersPrevMonth) * 100) : null;
    const valueTrend = valuePrevMonth > 0 ? Math.round(((valueThisMonth - valuePrevMonth) / valuePrevMonth) * 100) : null;

    const dates = orders.map((o) => o.shopifyCreatedAt).filter(Boolean).map((d) => new Date(d).getTime());
    const lastOrderAt = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;

    const currency = orders.find((o) => o.currency)?.currency ?? "CAD";

    const productMap = new Map<string, { title: string; sku: string; quantity: number }>();
    for (const order of thisMonth) {
      const lineItems = (order.lineItems as any[]) ?? [];
      for (const item of lineItems) {
        const key = String(item.product_id ?? item.title ?? "Unknown");
        const existing = productMap.get(key) ?? { title: item.title ?? "Unknown", sku: item.sku ?? "", quantity: 0 };
        existing.quantity += Number(item.quantity ?? 0);
        productMap.set(key, existing);
      }
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);

    const syncDates = orders.map((o) => o.syncedAt ? new Date(o.syncedAt).getTime() : 0).filter(Boolean);
    const lastSyncedAt = syncDates.length > 0 ? new Date(Math.max(...syncDates)).toISOString() : null;

    return { ordersThisMonth, valueThisMonth, ordersPrevMonth, valuePrevMonth, ordersTrend, valueTrend, ordersLast30Days, valueLast30Days, lastOrderAt, currency, topProducts, lastSyncedAt };
  }

  // Admin consolidated KPIs
  app.get("/api/admin/dashboard/kpis", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allOrders = await storage.getShopifyOrders();
      const allSystemdOrders = await storage.getSystemdOrders();
      const allContacts = await storage.getContacts();
      const allProducts = await storage.getProducts();

      const contactMap = new Map(allContacts.map((c) => [c.id, c]));
      const kpis = computeOrderKpis(allOrders);

      const LOW_STOCK_THRESHOLD = 5;
      const lowStockProducts = allProducts
        .filter((p) => p.inventoryQuantity < LOW_STOCK_THRESHOLD && p.shopifyProductId)
        .map((p) => {
          const contact = contactMap.get(p.contactId);
          return { id: p.id, name: p.name, sku: p.sku, inventoryQuantity: p.inventoryQuantity, contactId: p.contactId, contactName: contact?.name ?? null, companyName: contact?.companyName ?? null };
        })
        .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity)
        .slice(0, 10);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const paidSystemdOrders = allSystemdOrders.filter((order) => order.status === "paid");
      const systemdThisMonth = paidSystemdOrders.filter((order) => order.createdAt && new Date(order.createdAt) >= startOfMonth);
      const systemdPrevMonth = paidSystemdOrders.filter((order) => {
        const date = order.createdAt ? new Date(order.createdAt) : null;
        return date && date >= startOfPrevMonth && date < startOfMonth;
      });
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const systemdLast30 = paidSystemdOrders.filter((order) => order.createdAt && new Date(order.createdAt) >= thirtyDaysAgo);
      const systemdValue = (orders: typeof paidSystemdOrders) => orders.reduce((sum, order) => sum + order.amount / 100, 0);

      kpis.ordersThisMonth += systemdThisMonth.length;
      kpis.valueThisMonth += systemdValue(systemdThisMonth);
      kpis.ordersPrevMonth += systemdPrevMonth.length;
      kpis.valuePrevMonth += systemdValue(systemdPrevMonth);
      kpis.ordersLast30Days += systemdLast30.length;
      kpis.valueLast30Days += systemdValue(systemdLast30);
      kpis.ordersTrend = kpis.ordersPrevMonth > 0 ? Math.round(((kpis.ordersThisMonth - kpis.ordersPrevMonth) / kpis.ordersPrevMonth) * 100) : null;
      kpis.valueTrend = kpis.valuePrevMonth > 0 ? Math.round(((kpis.valueThisMonth - kpis.valuePrevMonth) / kpis.valuePrevMonth) * 100) : null;
      const systemdDates = paidSystemdOrders.map((order) => order.createdAt ? new Date(order.createdAt).getTime() : 0).filter(Boolean);
      if (systemdDates.length > 0) {
        const latestSystemd = Math.max(...systemdDates);
        const latestShopify = kpis.lastOrderAt ? new Date(kpis.lastOrderAt).getTime() : 0;
        kpis.lastOrderAt = new Date(Math.max(latestSystemd, latestShopify)).toISOString();
      }

      const perClient = allContacts.map((contact) => {
        const clientOrders = allOrders.filter((o) => o.contactId === contact.id && o.financialStatus !== "voided" && o.financialStatus !== "refunded");
        const clientSystemdOrders = paidSystemdOrders.filter((order) => order.contactId === contact.id);
        const thisMonthOrders = clientOrders.filter((o) => o.shopifyCreatedAt && new Date(o.shopifyCreatedAt) >= startOfMonth);
        const thisMonthSystemd = clientSystemdOrders.filter((order) => order.createdAt && new Date(order.createdAt) >= startOfMonth);
        const prevMonthOrders = clientOrders.filter((o) => {
          const d = o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt) : null;
          return d && d >= startOfPrevMonth && d < startOfMonth;
        });
        const prevMonthSystemd = clientSystemdOrders.filter((order) => {
          const date = order.createdAt ? new Date(order.createdAt) : null;
          return date && date >= startOfPrevMonth && date < startOfMonth;
        });
        const valueThisMonth = thisMonthOrders.reduce((s, o) => s + parseFloat(o.totalPrice || "0"), 0) + systemdValue(thisMonthSystemd);
        const valuePrevMonth = prevMonthOrders.reduce((s, o) => s + parseFloat(o.totalPrice || "0"), 0) + systemdValue(prevMonthSystemd);
        const dates = [
          ...clientOrders.map((o) => o.shopifyCreatedAt).filter(Boolean).map((d) => new Date(d!).getTime()),
          ...clientSystemdOrders.map((order) => order.createdAt ? new Date(order.createdAt).getTime() : 0).filter(Boolean),
        ];
        const lastOrderAt = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
        return {
          contactId: contact.id, contactName: contact.name, companyName: contact.companyName,
          ordersThisMonth: thisMonthOrders.length + thisMonthSystemd.length, valueThisMonth, ordersPrevMonth: prevMonthOrders.length + prevMonthSystemd.length, valuePrevMonth, lastOrderAt,
          totalOrders: clientOrders.length + clientSystemdOrders.length,
        };
      }).filter((c) => c.totalOrders > 0 || allProducts.some((p) => p.contactId === c.contactId));

      res.json({ ...kpis, lowStockProducts, perClient });
    } catch (error: any) {
      console.error("Error computing admin dashboard KPIs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin view-as client KPIs
  app.get("/api/admin/view-as/:contactId/dashboard/kpis", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const orders = await storage.getShopifyOrders({ contactId });
      const allProducts = await storage.getProductsByContactId(contactId);
      const kpis = computeOrderKpis(orders);
      const LOW_STOCK_THRESHOLD = 5;
      const lowStockProducts = allProducts
        .filter((p) => p.inventoryQuantity < LOW_STOCK_THRESHOLD && p.shopifyProductId)
        .map((p) => ({ id: p.id, name: p.name, sku: p.sku, inventoryQuantity: p.inventoryQuantity }))
        .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity).slice(0, 10);
      res.json({ ...kpis, lowStockProducts });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // All orders across all connected Shopify stores
  app.get("/api/admin/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allContacts = await storage.getContacts();
      const cachedOrders = dedupeShopifyOrders(await storage.getShopifyOrders());

      const enriched = cachedOrders.map((o) => {
        const contact = allContacts.find((c) => c.id === o.contactId);
        return {
          id: Number(o.shopifyOrderId),
          name: o.name,
          created_at: o.shopifyCreatedAt ? o.shopifyCreatedAt.toISOString() : new Date(0).toISOString(),
          financial_status: o.financialStatus,
          fulfillment_status: o.fulfillmentStatus,
          total_price: o.totalPrice,
          currency: o.currency,
          email: o.email,
          customer: (o.customerFirstName || o.customerLastName)
            ? { first_name: o.customerFirstName ?? "", last_name: o.customerLastName ?? "" }
            : null,
          line_items: (o.lineItems as any[]) ?? [],
          contactId: o.contactId,
          contactName: contact?.name ?? null,
          companyName: contact?.companyName ?? null,
          shopName: o.shopName,
          storeUrl: o.storeUrl,
          integrationId: o.integrationId,
        };
      });

      enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({ orders: enriched, totalCount: enriched.length });
    } catch (error: any) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: error.message || "Failed to fetch orders" });
    }
  });

  app.post("/api/admin/orders/sync", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { syncOrdersForIntegration } = await import("./shopify-orders-sync");
      const integrations = await storage.getShopifyIntegrations();
      const requestedIntegrationId = Number(req.body?.integrationId) || null;
      const active = integrations.filter((i) => i.isActive && (!requestedIntegrationId || i.id === requestedIntegrationId));
      if (active.length === 0) return res.json({ message: "No active integrations", synced: 0 });

      let total = 0;
      const errors: string[] = [];
      for (const integration of active) {
        try {
          const count = await syncOrdersForIntegration(integration);
          total += count;
        } catch (err: any) {
          errors.push(`${integration.storeUrl}: ${err.message}`);
        }
      }

      await storage.createActivityLog({
        type: "shopify_orders_sync",
        status: errors.length > 0 ? "error" : "success",
        message: `Manual orders sync: ${total} order${total !== 1 ? "s" : ""} updated across ${active.length} store${active.length !== 1 ? "s" : ""}${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
      });

      res.json({ message: `${total} orders synced from ${active.length} store(s)`, synced: total, errors });
    } catch (error: any) {
      console.error("Error syncing orders:", error);
      res.status(500).json({ message: error.message || "Failed to sync orders" });
    }
  });

  // Fetch full single order from Shopify (live)
  app.get("/api/admin/orders/:shopifyOrderId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const shopifyOrderId = String(req.params.shopifyOrderId);
      const integrations = await storage.getShopifyIntegrations();
      const integrationId = Number(req.query.integrationId) || null;
      const requestedStore = req.query.store as string | undefined;
      const cachedCandidates = dedupeShopifyOrders(await storage.getShopifyOrders())
        .filter((order) => order.shopifyOrderId === shopifyOrderId);
      const cached = cachedCandidates.find((order) => integrationId ? order.integrationId === integrationId : false)
        ?? cachedCandidates.find((order) => normalizeShopifyStoreUrl(order.storeUrl) === normalizeShopifyStoreUrl(requestedStore))
        ?? cachedCandidates[0];
      const integration = findShopifyIntegration(integrations, {
        integrationId: integrationId ?? cached?.integrationId,
        storeUrl: requestedStore ?? cached?.storeUrl,
        activeOnly: true,
      });
      const allContacts = await storage.getContacts();
      const contactId = integration?.contactId ?? cached?.contactId;
      const contact = allContacts.find((c) => c.id === contactId);

      if (integration) {
        try {
          const { fetchShopifyOrderDetail } = await import("./shopify-api");
          const order = await fetchShopifyOrderDetail(integration.storeUrl, integration.accessToken, shopifyOrderId);
          return res.json({ order, contactId, contactName: contact?.name ?? null, companyName: contact?.companyName ?? null, shopName: integration.shopName, storeUrl: normalizeShopifyStoreUrl(integration.storeUrl), integrationId: integration.id, liveUnavailable: false });
        } catch (liveError: any) {
          if (!cached) throw liveError;
          await storage.createActivityLog({ type: "shopify_order_live_fallback", status: "error", message: `Détail local affiché pour ${cached.name}; Shopify live indisponible` }).catch(() => {});
        }
      }
      if (!cached) return res.status(404).json({ message: "Commande introuvable" });
      return res.json({ order: cachedOrderAsShopify(cached), contactId, contactName: contact?.name ?? null, companyName: contact?.companyName ?? null, shopName: cached.shopName, storeUrl: normalizeShopifyStoreUrl(cached.storeUrl), integrationId: cached.integrationId, liveUnavailable: true, warning: "Détails locaux affichés. Shopify live indisponible." });
    } catch (error: any) {
      console.error("Error fetching order detail:", error);
      res.status(500).json({ message: error.message || "Failed to fetch order detail" });
    }
  });

  // Fetch Shopify customers across all active integrations (admin)
  app.get("/api/admin/customers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { fetchShopifyCustomers } = await import("./shopify-api");
      const integrations = await storage.getShopifyIntegrations();
      const active = integrations.filter((i) => i.isActive);
      const allContacts = await storage.getContacts();
      const contactMap = new Map(allContacts.map((c) => [c.id, c]));
      const systemdOrders = (await storage.getSystemdOrders()).filter((order) => order.status === "paid");

      const results: any[] = [];
      for (const integration of active) {
        const contact = contactMap.get(integration.contactId);
        try {
          const customers = await fetchShopifyCustomers(integration.storeUrl, integration.accessToken);
          for (const c of customers) {
            const customerGid = `gid://shopify/Customer/${c.id}`;
            const localOrders = systemdOrders.filter((order) =>
              order.contactId === integration.contactId && order.shopifyCustomerGid === customerGid,
            );
            results.push({
              ...c,
              orders_count: Number(c.orders_count ?? 0) + localOrders.length,
              total_spent: (Number(c.total_spent ?? 0) + localOrders.reduce((sum, order) => sum + order.amount / 100, 0)).toFixed(2),
              contactId: integration.contactId,
              contactName: contact?.name ?? null,
              companyName: contact?.companyName ?? null,
              shopName: integration.shopName ?? integration.storeUrl,
              storeUrl: integration.storeUrl,
              integrationId: integration.id,
            });
          }
        } catch (err: any) {
          console.error(`Failed to fetch customers from ${integration.storeUrl}: ${err.message}`);
        }
      }

      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const contactIdFilter = req.query.contactId ? Number(req.query.contactId) : null;
      const scopedContactIds = contactIdFilter ? await getProductContactIds(contactIdFilter) : null;
      const filtered = scopedContactIds ? results.filter((c) => scopedContactIds.includes(c.contactId)) : results;
      res.json({ customers: filtered, totalCount: filtered.length });
    } catch (error: any) {
      console.error("Error fetching admin customers:", error);
      res.status(500).json({ message: error.message || "Failed to fetch customers" });
    }
  });

  // Fetch full single customer from Shopify (live) + their orders
  app.get("/api/admin/customers/:shopifyCustomerId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const shopifyCustomerId = String(req.params.shopifyCustomerId);
      const integrations = await storage.getShopifyIntegrations();
      const integrationId = Number(req.query.integrationId) || null;
      const requestedStore = req.query.store as string | undefined;
      const integration = findShopifyIntegration(integrations, { integrationId, storeUrl: requestedStore, activeOnly: true });
      const localRep = await storage.getMapiRepByGid(`gid://shopify/Customer/${shopifyCustomerId}`);
      if (!integration && !localRep) return res.status(404).json({ message: "Rep Shopify introuvable" });
      const allContacts = await storage.getContacts();
      const contact = allContacts.find((c) => c.id === integration?.contactId);
      if (integration) {
        try {
          const { fetchShopifyCustomerDetail, fetchShopifyCustomerOrders } = await import("./shopify-api");
          const [customer, orders] = await Promise.all([
            fetchShopifyCustomerDetail(integration.storeUrl, integration.accessToken, shopifyCustomerId),
            fetchShopifyCustomerOrders(integration.storeUrl, integration.accessToken, shopifyCustomerId),
          ]);
          return res.json({ customer, orders, contactId: integration.contactId, contactName: contact?.name ?? null, companyName: contact?.companyName ?? null, shopName: integration.shopName, storeUrl: normalizeShopifyStoreUrl(integration.storeUrl), integrationId: integration.id, liveUnavailable: false });
        } catch (liveError: any) {
          if (!localRep) throw liveError;
        }
      }
      const cachedOrders = localRep
        ? dedupeShopifyOrders(await storage.getShopifyOrders()).filter((order) => order.email?.trim().toLowerCase() === localRep.email.trim().toLowerCase()).map(cachedOrderAsShopify)
        : [];
      return res.json({
        customer: { id: shopifyCustomerId, email: localRep!.email, first_name: localRep!.firstName, last_name: localRep!.lastName, orders_count: cachedOrders.length, total_spent: "0", state: localRep!.status, created_at: localRep!.createdAt },
        orders: cachedOrders,
        contactId: integration?.contactId ?? null,
        contactName: contact?.name ?? null,
        companyName: contact?.companyName ?? null,
        shopName: integration?.shopName ?? "Mapei",
        storeUrl: normalizeShopifyStoreUrl(integration?.storeUrl ?? requestedStore),
        integrationId: integration?.id ?? integrationId,
        liveUnavailable: true,
        warning: "Données Shopify live indisponibles. Dernières données synchronisées affichées.",
      });
    } catch (error: any) {
      console.error("Error fetching customer detail:", error);
      res.status(500).json({ message: error.message || "Failed to fetch customer detail" });
    }
  });

  app.get("/api/contacts/:id/shopify-orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.id);
      const all = await storage.getShopifyIntegrations();
      const integration = all.find((i) => i.contactId === contactId && i.isActive);
      if (!integration) {
        return res.json({ orders: [], storeUrl: null });
      }
      const orders = await fetchShopifyOrders(integration.storeUrl, integration.accessToken, 100);
      res.json({ orders, storeUrl: integration.storeUrl, shopName: integration.shopName });
    } catch (error: any) {
      console.error("Error fetching Shopify orders:", error);
      res.status(500).json({ message: error.message || "Failed to fetch orders" });
    }
  });

  // Zoho CRM Webhook (no auth - external webhook)
  // Accepts: single object, array of objects, or { contacts: [...] }
  app.post("/api/webhooks/zoho-crm", async (req, res) => {
    try {
      const body = req.body;

      // Normalize to array
      let entries: any[] = [];
      if (Array.isArray(body)) {
        entries = body;
      } else if (Array.isArray(body?.contacts)) {
        entries = body.contacts;
      } else if (body && typeof body === "object") {
        entries = [body];
      }

      if (entries.length === 0) {
        return res.status(400).json({ message: "No contact data received" });
      }

      const results: { email: string; status: "created" | "updated" | "skipped"; contact: any }[] = [];

      for (const entry of entries) {
        const { name, email, phone, company_name, company_address, zoho_contact_id, zoho_account_id } = entry;

        if (!name || !email) {
          results.push({ email: email || "(missing)", status: "skipped", contact: null });
          continue;
        }

        const existing = await storage.getContactByEmail(email);

        if (existing) {
          // Update Zoho IDs and any changed fields on the existing contact
          const updated = await storage.updateContact(existing.id, {
            name,
            phone: phone || existing.phone,
            companyName: company_name || existing.companyName,
            companyAddress: company_address || existing.companyAddress,
            zohoCrmContactId: zoho_contact_id || existing.zohoCrmContactId,
            zohoCrmAccountId: zoho_account_id || existing.zohoCrmAccountId,
          });
          results.push({ email, status: "updated", contact: updated });
        } else {
          const contact = await storage.createContact({
            name,
            email,
            phone: phone || null,
            companyName: company_name || null,
            companyAddress: company_address || null,
            status: "invited",
            shopifyConnected: false,
            zohoInventoryPushed: false,
            userId: null,
            zohoCrmContactId: zoho_contact_id || null,
            zohoCrmAccountId: zoho_account_id || null,
          });
          results.push({ email, status: "created", contact });

          // Send invite email (non-blocking — don't fail webhook if email fails)
          sendInviteEmail({ name, email, companyName: company_name || null }).catch((err) => {
            console.error(`Failed to send invite email to ${email}:`, err);
          });
        }
      }

      const created = results.filter(r => r.status === "created").length;
      const updated = results.filter(r => r.status === "updated").length;
      const skipped = results.filter(r => r.status === "skipped").length;

      res.status(201).json({
        message: `Processed ${entries.length} contact(s): ${created} created, ${updated} updated, ${skipped} skipped`,
        results,
      });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.get("/api/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const product = await storage.getProduct(Number(req.params.id));
      if (!product) return res.status(404).json({ message: "Product not found" });
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products/push-to-zoho", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds)) return res.status(400).json({ message: "productIds must be an array" });

      const settings = await storage.getAdminSettings();
      const isZohoConnected = !!settings?.zohoInventoryRefreshToken;

      const updated = [];
      const errors: string[] = [];

      for (const id of productIds) {
        const product = await storage.getProduct(id);
        if (!product) continue;

        if (isZohoConnected) {
          const contact = product.contactId ? await storage.getContact(product.contactId) : null;

          // Already pushed with a real Zoho ID → update cf_client + sync inventory
          if (product.pushedToZoho && product.zohoItemId && !product.zohoItemId.startsWith("pending-")) {
            if (contact?.email) {
              try {
                const zohoContactId = await ensureZohoContact({ name: contact.name, email: contact.email, companyName: contact.companyName });
                await updateZohoItemClient(product.zohoItemId, zohoContactId, product.name);
              } catch (err: any) {
                console.error(`[zoho] update cf_client failed for item ${product.zohoItemId}: ${err.message}`);
                errors.push(`${product.name}: ${err.message}`);
              }
            }
            if (product.inventoryQuantity > 0) {
              try {
                await setZohoItemStock(product.zohoItemId, product.inventoryQuantity);
              } catch (err: any) {
                console.error(`[zoho] setZohoItemStock failed for item ${product.zohoItemId}: ${err.message}`);
              }
            }
            updated.push(product);
            continue;
          }

          // Pending → skip, nothing to do
          if (product.pushedToZoho && product.zohoItemId) {
            updated.push(product);
            continue;
          }

          // New item → ensure contact exists in Zoho first, then create item
          try {
            let zohoContactId: string | null = null;
            if (contact?.email) {
              try {
                zohoContactId = await ensureZohoContact({ name: contact.name, email: contact.email, companyName: contact.companyName });
              } catch (contactErr: any) {
                console.error(`[zoho] ensureZohoContact failed (non-fatal): ${contactErr.message}`);
              }
            }
            const { item_id } = await pushItemToZoho({
              name: product.name,
              sku: product.sku,
              description: product.description,
              rate: product.price ? Number(product.price) : undefined,
              opening_stock: product.inventoryQuantity,
              imageUrl: product.imageUrl,
              clientId: zohoContactId,
            });
            const updatedProduct = await storage.updateProduct(id, {
              pushedToZoho: true,
              zohoItemId: item_id,
              zohoInventoryQuantity: product.inventoryQuantity,
              lastSyncedAt: new Date(),
            });
            if (updatedProduct) updated.push(updatedProduct);
          } catch (err: any) {
            errors.push(`${product.name}: ${err.message}`);
            const updatedProduct = await storage.updateProduct(id, {
              pushedToZoho: true,
              zohoItemId: `pending-${id}`,
              lastSyncedAt: new Date(),
            });
            if (updatedProduct) updated.push(updatedProduct);
          }
        } else {
          const updatedProduct = await storage.updateProduct(id, {
            pushedToZoho: true,
            zohoItemId: `pending-${id}`,
            lastSyncedAt: new Date(),
          });
          if (updatedProduct) updated.push(updatedProduct);
        }
      }

      const msg = errors.length > 0
        ? `${updated.length} products pushed (${errors.length} with errors)`
        : `${updated.length} products pushed to Zoho`;
      await storage.createActivityLog({ type: "zoho_push", status: errors.length > 0 ? "error" : "success", message: msg, metadata: errors.length > 0 ? JSON.stringify({ errors }) : undefined });
      res.json({ message: msg, products: updated, errors });
    } catch (error) {
      console.error("Error pushing to Zoho:", error);
      res.status(500).json({ message: "Failed to push products" });
    }
  });

  app.delete("/api/restock-requests/bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
      await storage.deleteRestockRequests(ids);
      res.json({ deleted: ids.length });
    } catch (error) {
      console.error("Error bulk deleting restock requests:", error);
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  app.get("/api/restock-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getRestockRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching restock requests:", error);
      res.status(500).json({ message: "Failed to fetch restock requests" });
    }
  });

  app.get("/api/shopify-integrations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integrations = await storage.getShopifyIntegrations();
      // Enrich each integration with product count for the contact
      const enriched = await Promise.all(
        integrations.map(async (integration) => {
          const [contactProducts, contactOrders, reps] = await Promise.all([
            storage.getProductsByContactId(integration.contactId),
            storage.getShopifyOrders({ contactId: integration.contactId }),
            normalizeShopifyStoreUrl(integration.storeUrl) === "tnt5ar-ki.myshopify.com"
              ? storage.getMapiReps()
              : Promise.resolve([]),
          ]);
          return {
            ...integration,
            productCount: contactProducts.length,
            orderCount: contactOrders.filter((order) => order.integrationId === integration.id).length,
            repCount: reps.length,
          };
        })
      );
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post("/api/shopify-integrations/connect", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { contactId, storeUrl, platform = "shopify", shopName, accessToken, consumerKey, consumerSecret } = req.body;
      if (!contactId || !storeUrl) {
        return res.status(400).json({ message: "contactId and storeUrl are required" });
      }

      if (platform === "woocommerce") {
        if (!consumerKey || !consumerSecret) {
          return res.status(400).json({ message: "consumerKey and consumerSecret are required for WooCommerce" });
        }
        const { testWooConnection } = await import("./woocommerce-api");
        const test = await testWooConnection(storeUrl, consumerKey, consumerSecret);
        if (!test.success) {
          return res.status(400).json({ message: `Could not connect to WooCommerce store: ${test.error || "invalid credentials or store URL"}` });
        }
        const normalizedStore = storeUrl.trim().replace(/\/$/, "");
        const integrations = await storage.getShopifyIntegrations();
        const existing = integrations.find((integration) =>
          integration.contactId === Number(contactId) &&
          integration.platform === "woocommerce" &&
          integration.storeUrl.trim().replace(/\/$/, "").toLowerCase() === normalizedStore.toLowerCase()
        );
        const integration = existing
          ? await storage.updateShopifyIntegration(existing.id, {
              accessToken: consumerKey,
              platformConfig: { consumerSecret },
              shopName: shopName?.trim() || test.shopName || normalizedStore,
              isActive: true,
              connectionStatus: "ok",
              lastConnectionTestedAt: new Date(),
              lastConnectionError: null,
            } as any)
          : await storage.createShopifyIntegration({
              contactId: Number(contactId),
              platform: "woocommerce",
              accessToken: consumerKey,
              platformConfig: { consumerSecret },
              storeUrl: normalizedStore,
              shopName: shopName?.trim() || test.shopName || normalizedStore,
              scope: null,
              isActive: true,
              connectionStatus: "ok",
              lastConnectionTestedAt: new Date(),
            } as any);
        await storage.updateContact(Number(contactId), { shopifyConnected: true });
        return res.json({ success: true, shopName: test.shopName, integrationId: integration?.id, reconnected: Boolean(existing) });
      }

      // Shopify
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required for Shopify" });
      }
      const normalizedStore = normalizeShopifyStoreUrl(storeUrl);
      if (!validateShopifyStoreUrl(normalizedStore)) {
        return res.status(400).json({ message: "Store URL must be a valid *.myshopify.com domain (e.g. mystore.myshopify.com)" });
      }
      const test = await testShopifyConnection(normalizedStore, accessToken);
      if (!test.success) {
        return res.status(400).json({ message: `Could not connect to Shopify store: ${test.error || "invalid token or store URL"}` });
      }
      const integrations = await storage.getShopifyIntegrations();
      const existing = integrations.find((integration) =>
        integration.contactId === Number(contactId) &&
        (integration.platform ?? "shopify") === "shopify" &&
        normalizeShopifyStoreUrl(integration.storeUrl) === normalizedStore
      );
      const integration = existing
        ? await storage.updateShopifyIntegration(existing.id, {
            accessToken,
            storeUrl: normalizedStore,
            shopName: shopName?.trim() || test.shopName || normalizedStore,
            isActive: true,
            connectionStatus: "ok",
            lastConnectionTestedAt: new Date(),
            lastConnectionError: null,
            consecutiveErrors: 0,
            syncPausedUntil: null,
          } as any)
        : await storage.createShopifyIntegration({
            contactId: Number(contactId),
            platform: "shopify",
            accessToken,
            storeUrl: normalizedStore,
            shopName: shopName?.trim() || test.shopName || normalizedStore,
            scope: null,
            isActive: true,
          } as any);
      await storage.updateContact(Number(contactId), { shopifyConnected: true });
      res.json({ success: true, shopName: test.shopName, integrationId: integration?.id, reconnected: Boolean(existing) });
    } catch (error: any) {
      console.error("Error connecting store:", error);
      res.status(500).json({ message: error.message || "Failed to connect store" });
    }
  });

  app.delete("/api/shopify-integrations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integration = await storage.getShopifyIntegration(Number(req.params.id));
      if (!integration) return res.status(404).json({ message: "Intégration introuvable" });
      await storage.updateShopifyIntegration(integration.id, {
        isActive: false,
        connectionStatus: "disconnected",
        syncFrequencyMinutes: 0,
        orderSyncFrequencyMinutes: 0,
        lastConnectionError: null,
      } as any);
      await storage.createActivityLog({
        type: "shopify_disconnect",
        status: "success",
        message: `Intégration ${(integration.platform ?? "shopify")} déconnectée : ${integration.storeUrl}. Produits, reps, commandes et historique conservés.`,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
      res.status(500).json({ message: "Failed to delete integration" });
    }
  });

  // ── Test connexion Shopify (intégration existante) ──────────────────────────
  app.post("/api/shopify-integrations/:id/test-connection", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integration = await storage.getShopifyIntegration(Number(req.params.id));
      if (!integration) return res.status(404).json({ message: "Intégration non trouvée" });

      const result = await testShopifyConnection(integration.storeUrl, integration.accessToken);
      const status = result.success
        ? "ok"
        : result.error?.includes("401") || result.error?.includes("403")
        ? "invalid_token"
        : "error";

      await storage.updateShopifyIntegration(integration.id, {
        connectionStatus: status,
        lastConnectionTestedAt: new Date(),
        lastConnectionError: result.success ? null : (result.error ?? null),
        ...(result.success ? { consecutiveErrors: 0, syncPausedUntil: null } : {}),
      } as any);

      await storage.createActivityLog({
        type: "shopify_connection_test",
        status: result.success ? "success" : "error",
        message: result.success
          ? `Connexion Shopify validée pour ${integration.storeUrl}`
          : `Échec du test Shopify pour ${integration.storeUrl} (aucun secret journalisé)`,
      });

      res.json({ status, shopName: result.shopName ?? null, error: result.success ? null : result.error });
    } catch (error: any) {
      console.error("Error testing Shopify connection:", error);
      res.status(500).json({ message: "Erreur lors du test de connexion" });
    }
  });

  app.post("/api/shopify-integrations/:id/import", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integration = await storage.getShopifyIntegration(Number(req.params.id));
      if (!integration) return res.status(404).json({ message: "Integration not found" });

      const platform = (integration as any).platform ?? "shopify";
      let normalized;
      if (platform === "woocommerce") {
        const { fetchWooProducts: fetchWoo } = await import("./woocommerce-api");
        const cfg = (integration as any).platformConfig as { consumerSecret?: string } | null;
        normalized = await fetchWoo(integration.storeUrl, integration.accessToken, cfg?.consumerSecret ?? "");
      } else {
        const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.accessToken);
        normalized = normalizeProducts(shopifyProducts);
      }

      const existingProducts = await storage.getProductsByContactId(integration.contactId);
      const existingByVariant = new Map(
        existingProducts.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId, p])
      );

      let created = 0;
      let updated = 0;
      for (const p of normalized) {
        const existing = existingByVariant.get(p.shopifyVariantId);
        const useZohoInventory = existing?.pushedToZoho && existing.zohoInventoryQuantity != null;

        await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
          contactId: integration.contactId,
          shopifyProductId: p.shopifyProductId,
          shopifyVariantId: p.shopifyVariantId,
          shopifyInventoryItemId: p.shopifyInventoryItemId,
          shopifyStoreUrl: integration.storeUrl,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          description: p.description,
          imageUrl: p.imageUrl,
          vendor: p.vendor,
          productType: p.productType,
          tags: p.tags,
          weight: p.weight,
          weightUnit: p.weightUnit,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          inventoryQuantity: useZohoInventory ? existing.zohoInventoryQuantity! : p.inventoryQuantity,
          zohoInventoryQuantity: existing?.zohoInventoryQuantity ?? null,
          shopifyStatus: p.shopifyStatus,
          shopifyHandle: p.shopifyHandle,
          pushedToZoho: existing?.pushedToZoho ?? false,
          zohoItemId: existing?.zohoItemId ?? null,
          lastSyncedAt: new Date(),
        });

        if (existingByVariant.has(p.shopifyVariantId)) updated++;
        else created++;
      }

      await storage.createActivityLog({ type: "shopify_import", status: "success", message: `Shopify import from ${integration.storeUrl}: ${created} new, ${updated} updated` });
      res.json({
        message: `${created} new products imported, ${updated} updated from ${integration.storeUrl}`,
        imported: created,
        updated,
        total: normalized.length,
      });
    } catch (error: any) {
      console.error("Error importing products:", error);
      res.status(500).json({ message: error.message || "Failed to import products from Shopify" });
    }
  });

  app.patch("/api/shopify-integrations/:id/sync-frequency", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { syncFrequencyMinutes } = req.body;
      if (typeof syncFrequencyMinutes !== "number" || syncFrequencyMinutes < 0) {
        return res.status(400).json({ message: "Invalid sync frequency" });
      }
      const updated = await storage.updateShopifyIntegration(Number(req.params.id), {
        syncFrequencyMinutes,
      });
      if (!updated) return res.status(404).json({ message: "Integration not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating sync frequency:", error);
      res.status(500).json({ message: "Failed to update sync frequency" });
    }
  });

  app.patch("/api/shopify-integrations/:id/order-sync-frequency", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { orderSyncFrequencyMinutes } = req.body;
      if (typeof orderSyncFrequencyMinutes !== "number" || orderSyncFrequencyMinutes < 0) {
        return res.status(400).json({ message: "Invalid order sync frequency" });
      }
      const updated = await storage.updateShopifyIntegration(Number(req.params.id), {
        orderSyncFrequencyMinutes,
      });
      if (!updated) return res.status(404).json({ message: "Integration not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating order sync frequency:", error);
      res.status(500).json({ message: "Failed to update order sync frequency" });
    }
  });

  app.post("/api/shopify-sync/run", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integrations = await storage.getShopifyIntegrationsDueForSync();
      if (integrations.length === 0) {
        return res.json({ message: "No integrations due for sync", synced: 0 });
      }

      let totalUpdated = 0;
      const results: { integrationId: number; updated: number; error?: string }[] = [];

      for (const integration of integrations) {
        try {
          const existingProducts = await storage.getProductsByContactId(integration.contactId);
          const importedVariantIds = new Set(
            existingProducts.filter((p) => p.shopifyVariantId).map((p) => p.shopifyVariantId!)
          );

          if (importedVariantIds.size === 0) {
            await storage.updateShopifyIntegration(integration.id, { lastAutoSyncAt: new Date() } as any);
            results.push({ integrationId: integration.id, updated: 0 });
            continue;
          }

          const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.accessToken);
          const normalized = normalizeProducts(shopifyProducts);

          let updated = 0;
          for (const p of normalized) {
            if (!importedVariantIds.has(p.shopifyVariantId)) continue;

            await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
              contactId: integration.contactId,
              shopifyProductId: p.shopifyProductId,
              shopifyVariantId: p.shopifyVariantId,
              shopifyInventoryItemId: p.shopifyInventoryItemId,
              shopifyStoreUrl: integration.storeUrl,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode,
              description: p.description,
              imageUrl: p.imageUrl,
              vendor: p.vendor,
              productType: p.productType,
              tags: p.tags,
              weight: p.weight,
              weightUnit: p.weightUnit,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              inventoryQuantity: p.inventoryQuantity,
              shopifyStatus: p.shopifyStatus,
              shopifyHandle: p.shopifyHandle,
              pushedToZoho: false,
              zohoItemId: null,
              lastSyncedAt: new Date(),
            });
            updated++;
          }

          await storage.updateShopifyIntegration(integration.id, { lastAutoSyncAt: new Date() } as any);
          totalUpdated += updated;
          results.push({ integrationId: integration.id, updated });
        } catch (err: any) {
          console.error(`Sync error for integration ${integration.id}:`, err);
          results.push({ integrationId: integration.id, updated: 0, error: err.message });
        }
      }

      res.json({ message: `Synced ${totalUpdated} products across ${integrations.length} integrations`, synced: totalUpdated, results });
    } catch (error: any) {
      console.error("Error running auto-sync:", error);
      res.status(500).json({ message: "Failed to run auto-sync" });
    }
  });

  app.get("/api/admin-settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post("/api/admin-settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = insertAdminSettingsSchema.parse(req.body);
      const settings = await storage.upsertAdminSettings(parsed);
      res.json(settings);
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

  app.patch("/api/admin-settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const existing = await storage.getAdminSettings();
      const settings = await storage.upsertAdminSettings({
        ...(existing || {}),
        ...req.body,
      });
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // ====== ZOHO INVENTORY OAUTH ======

  // Step 1: Generate OAuth URL and redirect user
  app.get("/api/auth/zoho/callback-url", isAuthenticated, isAdmin, (req, res) => {
    res.json({ callbackUrl: getCallbackUrl() });
  });

  app.post("/api/auth/zoho/connect", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const region = req.body.region || "us";
      // Log credential state before redirecting — helps confirm correct app is used
      logZohoCredentialDiagnostic("connect-initiated");
      const authUrl = buildAuthUrl(region);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Zoho connect error:", error);
      res.status(500).json({ message: error.message || "Failed to build auth URL" });
    }
  });

  // Step 2: OAuth callback — exchange code for tokens, fetch orgs
  app.get("/api/auth/zoho/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) {
        return res.redirect(`/admin/settings?zoho_error=${encodeURIComponent(error)}`);
      }
      if (!code) {
        return res.redirect("/admin/settings?zoho_error=no_code");
      }

      // Extract region from state: "region:{region}:{timestamp}"
      const region = state?.split(":")?.[1] || "us";

      const tokens = await exchangeCodeForTokens(code, region).catch((err) => {
        const msg = err.message || "";
        if (msg.includes("invalid_code")) {
          throw new Error(
            `invalid_code — the authorization code was rejected. This usually means the region you selected (${region.toUpperCase()}) does not match the datacenter your Zoho API Console app was created on. Please go back to Settings and select the correct region.`
          );
        }
        throw err;
      });
      const apiDomain = (tokens.api_domain || "www.zohoapis.com").replace(/^https?:\/\//, "");

      // Fetch organizations
      const orgs = await fetchZohoOrganizations(tokens.access_token, apiDomain);
      if (!orgs || orgs.length === 0) {
        return res.redirect("/admin/settings?zoho_error=no_organizations");
      }

      // Auto-pick if only one org
      const org = orgs[0];
      const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000);

      const existing = await storage.getAdminSettings();
      await storage.upsertAdminSettings({
        ...(existing || {}),
        zohoInventoryRefreshToken: tokens.refresh_token,
        zohoInventoryOrgId: org.organization_id,
        zohoInventoryOrgName: org.name,
        zohoAccessToken: tokens.access_token,
        zohoTokenExpiresAt: expiresAt,
        zohoRegion: region,
      });

      if (orgs.length > 1) {
        // Store pending orgs in memory for selection step
        (global as any).__zoho_pending_orgs = orgs;
        (global as any).__zoho_pending_tokens = { ...tokens, region, apiDomain };
        return res.redirect("/admin/settings?zoho_select_org=true");
      }

      res.redirect("/admin/settings?zoho_connected=true");
    } catch (error: any) {
      console.error("Zoho callback error:", error);
      res.redirect(`/admin/settings?zoho_error=${encodeURIComponent(error.message || "callback_failed")}`);
    }
  });

  // Get pending organizations (multiple org selection)
  app.get("/api/auth/zoho/pending-organizations", isAuthenticated, isAdmin, async (req, res) => {
    const orgs = (global as any).__zoho_pending_orgs || [];
    res.json({ organizations: orgs });
  });

  // Select organization when multiple exist
  app.post("/api/auth/zoho/select-organization", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { organizationId } = req.body;
      const orgs: any[] = (global as any).__zoho_pending_orgs || [];
      const tokens = (global as any).__zoho_pending_tokens;
      if (!tokens || !orgs.length) {
        return res.status(400).json({ message: "No pending organization selection" });
      }
      const org = orgs.find((o: any) => o.organization_id === organizationId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000);
      const existing = await storage.getAdminSettings();
      await storage.upsertAdminSettings({
        ...(existing || {}),
        zohoInventoryRefreshToken: tokens.refresh_token,
        zohoInventoryOrgId: org.organization_id,
        zohoInventoryOrgName: org.name,
        zohoAccessToken: tokens.access_token,
        zohoTokenExpiresAt: expiresAt,
        zohoRegion: tokens.region,
      });

      delete (global as any).__zoho_pending_orgs;
      delete (global as any).__zoho_pending_tokens;
      res.json({ message: "Organization selected", org });
    } catch (error: any) {
      console.error("Org select error:", error);
      res.status(500).json({ message: error.message || "Failed to select organization" });
    }
  });

  // Disconnect Zoho Inventory
  app.post("/api/auth/zoho/disconnect", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Targeted update — only clears Inventory columns.
      // Zoho Projects settings (portalId, portalName) are preserved intentionally
      // so they survive reconnection without requiring reconfiguration.
      await storage.disconnectZohoInventory();
      await storage.createActivityLog({
        type: "zoho_inventory_disconnect",
        status: "success",
        message: "Zoho Inventory déconnecté. La configuration Zoho Projects est conservée.",
      });
      res.json({ message: "Disconnected" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Test Zoho connection
  app.get("/api/auth/zoho/test", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const result = await testZohoConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Sync items from Zoho Inventory into the app for a contact
  // Fetch all Zoho Inventory items with cf_client custom field, enriched with contact info
  // ── Zoho Inventory list — lit depuis zoho_catalog (aucun appel Zoho) ─────────
  app.get("/api/zoho/inventory", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Lecture depuis le cache local — ZÉRO appel vers l'API Zoho
      const catalogItems = await storage.getZohoCatalogItems(false);

      // Contacts locaux pour résolution nom/entreprise
      const allContacts = await storage.getContacts();
      const contactById = new Map(allContacts.map((c) => [c.id, c]));

      // Produits locaux pour résolution localProductId
      const allLocalProducts = await storage.getProducts();
      const localProductByZohoId = new Map<string, number>();
      for (const p of allLocalProducts) {
        if (p.zohoItemId) localProductByZohoId.set(p.zohoItemId, p.id);
      }

      const enriched = catalogItems.map((item) => {
        const contact = item.contactId ? contactById.get(item.contactId) : undefined;
        return {
          zohoItemId:       item.zohoItemId,
          localProductId:   localProductByZohoId.get(item.zohoItemId) ?? null,
          name:             item.name,
          sku:              item.sku ?? null,
          description:      item.description ?? null,
          imageUrl:         item.imageName ? `/api/zoho/item-image/${item.zohoItemId}` : null,
          price:            item.price != null ? String(item.price) : null,
          inventoryQuantity: item.stock != null ? Math.round(Number(item.stock)) : 0,
          cfClient:         contact ? (contact.companyName || contact.name) : null,
          contactId:        item.contactId ?? null,
          contactName:      contact ? (contact.companyName || contact.name) : null,
          status:           item.status,
          unit:             item.unit ?? null,
          productType:      item.productType ?? null,
          assignmentState:  item.assignmentState,
        };
      });

      res.json({ items: enriched, total: enriched.length });
    } catch (error: any) {
      console.error("Zoho inventory fetch error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch Zoho inventory" });
    }
  });

  app.post("/api/zoho/sync-items/:contactId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const result = await syncZohoItemsForContact(contactId);
      res.json({ message: `Synced: ${result.added} added, ${result.updated} updated`, ...result });
    } catch (error: any) {
      console.error("Zoho sync error:", error);
      res.status(500).json({ message: error.message || "Sync failed" });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const product = await storage.getProduct(Number(req.params.id));
      if (!product) return res.status(404).json({ message: "Product not found" });
      await storage.deleteProduct(product.id);
      await storage.createActivityLog({ type: "product_delete", status: "success", message: `Product "${product.name}" (SKU: ${product.sku || "—"}) deleted` });
      res.json({ message: "Product deleted" });
    } catch (error: any) {
      console.error("Delete product error:", error);
      res.status(500).json({ message: error.message || "Failed to delete product" });
    }
  });

  app.delete("/api/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "No product IDs provided" });
      await Promise.all(ids.map((id) => storage.deleteProduct(id)));
      await storage.createActivityLog({ type: "product_delete", status: "success", message: `Bulk deleted ${ids.length} product${ids.length !== 1 ? "s" : ""}` });
      res.json({ message: `Deleted ${ids.length} products` });
    } catch (error: any) {
      console.error("Bulk delete products error:", error);
      res.status(500).json({ message: error.message || "Failed to delete products" });
    }
  });

  // Push a product to Zoho Inventory
  app.post("/api/zoho/push-item/:productId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const product = await storage.getProduct(Number(req.params.productId));
      if (!product) return res.status(404).json({ message: "Product not found" });
      const contact = product.contactId ? await storage.getContact(product.contactId) : null;
      let zohoContactId: string | null = null;
      if (contact?.email) {
        try {
          zohoContactId = await ensureZohoContact({ name: contact.name, email: contact.email, companyName: contact.companyName });
        } catch (contactErr: any) {
          console.error(`[zoho] ensureZohoContact failed (non-fatal): ${contactErr.message}`);
        }
      }
      const { item_id } = await pushItemToZoho({
        name: product.name,
        sku: product.sku,
        description: product.description,
        rate: product.price ? Number(product.price) : undefined,
        opening_stock: product.inventoryQuantity,
        imageUrl: product.imageUrl,
        clientId: zohoContactId,
      });
      await storage.updateProduct(product.id, {
        zohoItemId: item_id,
        pushedToZoho: true,
        zohoInventoryQuantity: product.inventoryQuantity,
        lastSyncedAt: new Date(),
      });
      await storage.createActivityLog({ type: "zoho_push", status: "success", message: `Product "${product.name}" pushed to Zoho Inventory (ID: ${item_id})` });
      res.json({ message: "Pushed to Zoho", zohoItemId: item_id });
    } catch (error: any) {
      await storage.createActivityLog({ type: "zoho_push", status: "error", message: `Failed to push product to Zoho: ${error.message}` }).catch(() => {});
      console.error("Push to Zoho error:", error);
      res.status(500).json({ message: error.message || "Push failed" });
    }
  });

  app.put("/api/products/:id/zoho-link", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { zohoItemId } = req.body;
      if (!zohoItemId || typeof zohoItemId !== "string") return res.status(400).json({ message: "zohoItemId requis" });
      const product = await storage.getProduct(id);
      if (!product) return res.status(404).json({ message: "Produit introuvable" });
      const updated = await storage.updateProduct(id, { zohoItemId, pushedToZoho: true, lastSyncedAt: new Date() });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  app.delete("/api/zoho/items/:zohoItemId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { deleteZohoItem } = await import("./zoho-api");
      const zohoItemId = String(req.params.zohoItemId);
      await deleteZohoItem(zohoItemId);
      // Also delete the local product if one exists
      const allProducts = await storage.getProducts();
      const local = allProducts.find((p) => p.zohoItemId === zohoItemId);
      if (local) await storage.deleteProduct(local.id);
      res.json({ message: "Item deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete Zoho item" });
    }
  });

  app.get("/api/zoho/item-image/:itemId", isAuthenticated, async (req, res) => {
    try {
      const { getImageFromCache, storeImageInCache } = await import("./zoho-catalog");
      const { getValidAccessToken, getZohoDomains } = await import("./zoho-auth");
      const { getZohoRegion } = await import("./zoho-api");

      const itemId = req.params.itemId;
      // Use imageDocumentId as version param for cache-busting when the image changes
      const version = (req.query.v as string) || "latest";
      const cacheKey = `${itemId}:${version}`;

      // Serve from in-memory cache if still fresh (avoids repeated Zoho API calls)
      const cached = getImageFromCache(cacheKey);
      if (cached) {
        res.setHeader("Content-Type", cached.contentType);
        const maxAge = version !== "latest" ? 604800 : 86400; // versioned=7d, latest=1d
        res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
        return res.send(cached.data);
      }

      const region = await getZohoRegion();
      const token = await getValidAccessToken(region);
      const settings = await storage.getAdminSettings();
      const orgId = settings?.zohoInventoryOrgId;
      if (!orgId) return res.status(400).json({ message: "Zoho not configured" });

      const { api } = getZohoDomains(region);
      const url = `https://${api}/inventory/v1/items/${itemId}/image?organization_id=${orgId}`;
      const zohoRes = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });

      if (!zohoRes.ok) return res.status(404).end();

      const contentType = zohoRes.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await zohoRes.arrayBuffer());

      // Store in server-side cache so subsequent requests (any user) skip the Zoho call
      storeImageInCache(cacheKey, buf, contentType);

      const maxAge = version !== "latest" ? 604800 : 86400;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
      res.send(buf);
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/zoho/sync-inventory", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allProducts = await storage.getProducts();
      const pushedProducts = allProducts.filter((p) => p.pushedToZoho && p.zohoItemId && !p.zohoItemId.startsWith("pending-"));

      if (pushedProducts.length === 0) {
        return res.json({ message: "No products synced with Zoho", updated: 0 });
      }

      const zohoItems = await fetchZohoItemsMap();
      let updated = 0;

      for (const product of pushedProducts) {
        const zohoData = zohoItems.get(product.zohoItemId!);
        if (zohoData) {
          await storage.updateProduct(product.id, {
            zohoInventoryQuantity: zohoData.stock,
            lastSyncedAt: new Date(),
          });
          updated++;
        }
      }

      await storage.createActivityLog({ type: "zoho_inventory_sync", status: "success", message: `Zoho inventory sync: updated stock for ${updated} product${updated !== 1 ? "s" : ""}` });
      res.json({ message: `Updated inventory for ${updated} products from Zoho`, updated });
    } catch (error: any) {
      await storage.createActivityLog({ type: "zoho_inventory_sync", status: "error", message: `Zoho inventory sync failed: ${error.message}` }).catch(() => {});
      console.error("Zoho inventory sync error:", error);
      res.status(500).json({ message: error.message || "Failed to sync Zoho inventory" });
    }
  });

  // ── Zoho Catalog: manual full sync trigger ────────────────────────────────
  app.post("/api/zoho/full-sync", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { syncFullZohoCatalog } = await import("./zoho-catalog");
      const result = await syncFullZohoCatalog("manual");
      if (result.skipped) {
        return res.status(409).json({ message: "Une synchronisation est déjà en cours.", reason: result.reason });
      }
      res.json({
        message: `Synchronisation terminée : ${result.upserted} articles mis à jour, ${result.softDeleted} supprimés logiquement.`,
        syncRunId: result.syncRunId,
        upserted: result.upserted,
        softDeleted: result.softDeleted,
      });
    } catch (error: any) {
      const is429 = error.message?.includes("429") || error.message?.includes("QUOTA_EXHAUSTED");
      if (is429) {
        return res.status(429).json({
          message: "Quota Zoho épuisé (7 500 appels/jour). La synchronisation sera possible après minuit.",
          code: "ZOHO_RATE_LIMITED",
        });
      }
      console.error("Zoho full-sync error:", error);
      res.status(500).json({ message: error.message || "Échec de la synchronisation" });
    }
  });

  // ── Zoho Catalog: list recent sync runs ───────────────────────────────────
  app.get("/api/zoho/sync-runs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const runs = await storage.getZohoSyncRuns(20);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Zoho Catalog: stats for validation (Étape 3 du déploiement progressif) ─
  app.get("/api/zoho/catalog-stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getZohoCatalogStats();
      const lastRuns = await storage.getZohoSyncRuns(5);
      res.json({ stats, lastRuns });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Zoho Inventory webhook (inbound from Zoho — unauthenticated, secured by secret) ─
  //
  // Configure manually in Zoho Inventory → Paramètres → Automatisations → Webhooks:
  //   URL    : https://{DOMAIN}/api/webhooks/zoho-inventory
  //   Méthode: POST
  //   En-tête: X-Zoho-Webhook-Secret: {ZOHO_INVENTORY_WEBHOOK_SECRET}
  //   Événements: Item Created, Item Edited, Item Deleted
  app.post("/api/webhooks/zoho-inventory", async (req: any, res) => {
    try {
      // ── Security: verify shared secret ─────────────────────────────────────
      const expectedSecret = process.env.ZOHO_INVENTORY_WEBHOOK_SECRET;
      if (!expectedSecret) {
        // Webhook not configured — reject all requests
        console.warn("[zoho-webhook] ZOHO_INVENTORY_WEBHOOK_SECRET not set — rejecting request");
        return res.status(401).json({ message: "Webhook not configured" });
      }

      const providedSecret = req.headers["x-zoho-webhook-secret"] as string | undefined;
      if (!providedSecret) {
        console.warn("[zoho-webhook] Missing X-Zoho-Webhook-Secret header");
        return res.status(401).json({ message: "Missing webhook secret" });
      }

      // Use timingSafeEqual to prevent timing attacks
      const { timingSafeEqual } = await import("crypto");
      const expected = Buffer.from(expectedSecret, "utf8");
      const provided = Buffer.from(providedSecret, "utf8");
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        console.warn("[zoho-webhook] Invalid webhook secret — request rejected");
        return res.status(401).json({ message: "Invalid webhook secret" });
      }

      // ── Payload size guard ─────────────────────────────────────────────────
      const contentLength = Number(req.headers["content-length"] || 0);
      if (contentLength > 1_048_576) { // 1 MB
        return res.status(413).json({ message: "Payload too large" });
      }

      // ── Parse event type and item ID ───────────────────────────────────────
      // Zoho Inventory webhook payloads vary by event type.
      // Common shapes:
      //   Item Created/Edited: { "item": { "item_id": "...", ... } }
      //   Item Deleted:        { "item_id": "...", "event": "item.delete" }
      const payload = req.body;
      const itemId: string | undefined =
        payload?.item?.item_id ||
        payload?.item_id ||
        payload?.data?.item_id;

      if (!itemId || typeof itemId !== "string") {
        console.warn("[zoho-webhook] No item_id in payload:", JSON.stringify(payload).substring(0, 200));
        return res.status(400).json({ message: "Missing item_id in payload" });
      }

      const isDelete =
        payload?.event === "item.delete" ||
        payload?.action === "delete" ||
        payload?.type === "item_deleted";

      // ── Deduplication: skip if we already have this version ────────────────
      if (!isDelete && payload?.item?.last_modified_time) {
        const existing = await storage.getZohoCatalogItem(itemId);
        if (
          existing?.zohoLastModifiedTime &&
          existing.zohoLastModifiedTime >= payload.item.last_modified_time
        ) {
          console.log(`[zoho-webhook] Skipping duplicate/out-of-order event for item ${itemId}`);
          return res.status(200).json({ received: true, skipped: true });
        }
      }

      // ── Process event ──────────────────────────────────────────────────────
      const { upsertZohoCatalogItemFromWebhook } = await import("./zoho-catalog");
      const { fetchZohoContactsMap } = await import("./zoho-api");

      if (isDelete) {
        // Soft-delete locally
        const { db } = await import("./db");
        const { zohoCatalog } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db
          .update(zohoCatalog)
          .set({ isDeleted: true, deletedAt: new Date() })
          .where(eq(zohoCatalog.zohoItemId, itemId));
        console.log(`[zoho-webhook] Soft-deleted item ${itemId}`);
      } else {
        // Upsert: fetch full detail from Zoho and update local catalog
        const [allContacts, zohoContactsMap] = await Promise.all([
          storage.getContacts(),
          fetchZohoContactsMap().catch(() => new Map()),
        ]);
        await upsertZohoCatalogItemFromWebhook(itemId, allContacts, zohoContactsMap);
      }

      await storage.createActivityLog({
        type: "zoho_catalog_webhook",
        status: "success",
        message: `Webhook Zoho Inventory reçu : item ${itemId} — ${isDelete ? "supprimé" : "mis à jour"}`,
      }).catch(() => {});

      res.status(200).json({ received: true });

    } catch (error: any) {
      const is429 = error.message?.includes("429");
      if (is429) {
        // Can't fetch Zoho detail — mark item as unresolved for next full sync
        console.warn("[zoho-webhook] Rate-limited during webhook processing:", error.message);
        return res.status(200).json({ received: true, warning: "rate_limited" });
      }
      console.error("[zoho-webhook] Processing error:", error.message);
      res.status(500).json({ message: error.message || "Webhook processing failed" });
    }
  });

  // ====== ADMIN VIEW-AS ENDPOINTS ======
  app.get("/api/admin/view-as/:contactId/profile", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const contact = await storage.getContact(contactId);
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (error) {
      console.error("Error fetching view-as profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/admin/view-as/:contactId/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const productContactIds = await getProductContactIds(contactId);
      const products = await storage.getProductsByContactIds(productContactIds);
      res.json(products);
    } catch (error) {
      console.error("Error fetching view-as products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/admin/view-as/:contactId/notifications", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const notifs = await storage.getNotificationsByContactId(contactId);
      res.json(notifs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/view-as/:contactId/restock-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const requests = await storage.getRestockRequestsByContactId(contactId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching view-as restock requests:", error);
      res.status(500).json({ message: "Failed to fetch restock requests" });
    }
  });

  app.get("/api/admin/view-as/:contactId/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const contactIds = await getProductContactIds(contactId);
      const orders = dedupeShopifyOrders(await storage.getShopifyOrdersByContactIds(contactIds));
      res.json({ orders });
    } catch (error) {
      console.error("Error fetching view-as orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // ====== CLIENT PORTAL ENDPOINTS ======
  app.get("/api/portal/profile", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(404).json({ message: "No contact profile found" });
      }
      const contact = await storage.getContact(role.contactId);
      res.json(contact);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/portal/profile", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { name, phone, companyName, companyAddress } = req.body;
      const updated = await storage.updateContact(role.contactId, {
        name,
        phone,
        companyName,
        companyAddress,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/portal/related-contacts", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) return res.json([]);
      const contact = await storage.getContact(role.contactId);
      if (!contact || !contact.companyName) return res.json([]);
      const all = await storage.getContacts();
      const related = all.filter(
        (c) => c.id !== role.contactId && c.companyName && c.companyName.toLowerCase() === contact.companyName!.toLowerCase()
      );
      res.json(related);
    } catch (error) {
      console.error("Error fetching related contacts:", error);
      res.status(500).json({ message: "Failed to fetch related contacts" });
    }
  });

  app.get("/api/admin/view-as/:contactId/related-contacts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const contact = await storage.getContact(contactId);
      if (!contact || !contact.companyName) return res.json([]);
      const all = await storage.getContacts();
      const related = all.filter(
        (c) => c.id !== contactId && c.companyName && c.companyName.toLowerCase() === contact.companyName!.toLowerCase()
      );
      res.json(related);
    } catch (error) {
      console.error("Error fetching related contacts:", error);
      res.status(500).json({ message: "Failed to fetch related contacts" });
    }
  });

  app.get("/api/portal/products", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json([]);
      }
      const productContactIds = await getProductContactIds(role.contactId);
      const products = await storage.getProductsByContactIds(productContactIds);
      res.json(products);
    } catch (error) {
      console.error("Error fetching portal products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/portal/products/:id", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const product = await storage.getProduct(Number(req.params.id));
      const productContactIds = await getProductContactIds(role.contactId);
      if (!product || !productContactIds.includes(product.contactId)) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching portal product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.get("/api/admin/view-as/:contactId/products/:productId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const product = await storage.getProduct(Number(req.params.productId));
      const productContactIds = await getProductContactIds(contactId);
      if (!product || !productContactIds.includes(product.contactId)) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching view-as product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Portal client dashboard KPIs
  app.get("/api/portal/dashboard/kpis", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) return res.json({ ordersThisMonth: 0, valueThisMonth: 0, ordersLast30Days: 0, valueLast30Days: 0, topProducts: [], lowStockProducts: [], lastOrderAt: null, lastSyncedAt: null, currency: "CAD" });
      const contactId = role.contactId;
      const orders = await storage.getShopifyOrders({ contactId });
      const allProducts = await storage.getProducts();
      const clientProducts = allProducts.filter((p) => p.contactId === contactId);
      const kpis = computeOrderKpis(orders);
      const lowStockProducts = clientProducts
        .filter((p) => p.inventoryQuantity < 5 && p.shopifyProductId)
        .map((p) => ({ id: p.id, name: p.name, sku: p.sku, inventoryQuantity: p.inventoryQuantity }))
        .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity).slice(0, 10);
      res.json({ ...kpis, lowStockProducts });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/portal/orders", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json({ orders: [] });
      }
      const contactIds = await getProductContactIds(role.contactId);
      const orders = await storage.getShopifyOrdersByContactIds(contactIds);
      res.json({ orders });
    } catch (error) {
      console.error("Error fetching portal orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/portal/orders/:shopifyOrderId", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(403).json({ message: "Forbidden" });

      const { shopifyOrderId } = req.params;
      const integrations = await storage.getShopifyIntegrations();
      const integrationId = Number(req.query.integrationId) || null;
      const requestedStore = req.query.store as string | undefined;
      const allowedContactIds = role.role === "client" && role.contactId ? await getProductContactIds(role.contactId) : undefined;
      if (role.role === "client" && !allowedContactIds) return res.status(403).json({ message: "Forbidden" });
      const cachedCandidates = dedupeShopifyOrders(allowedContactIds
        ? await storage.getShopifyOrdersByContactIds(allowedContactIds)
        : await storage.getShopifyOrders()).filter((order) => order.shopifyOrderId === shopifyOrderId);
      const cached = cachedCandidates.find((order) => integrationId ? order.integrationId === integrationId : false)
        ?? cachedCandidates.find((order) => normalizeShopifyStoreUrl(order.storeUrl) === normalizeShopifyStoreUrl(requestedStore))
        ?? cachedCandidates[0];
      const integration = findShopifyIntegration(integrations, { integrationId: integrationId ?? cached?.integrationId, storeUrl: requestedStore ?? cached?.storeUrl, allowedContactIds, activeOnly: true });
      if (integration) {
        try {
          const { fetchShopifyOrderDetail } = await import("./shopify-api");
          const order = await fetchShopifyOrderDetail(integration.storeUrl, integration.accessToken, shopifyOrderId);
          return res.json({ order, shopName: integration.shopName, storeUrl: normalizeShopifyStoreUrl(integration.storeUrl), integrationId: integration.id, liveUnavailable: false });
        } catch (liveError: any) {
          if (!cached) throw liveError;
        }
      }
      if (!cached) return res.status(404).json({ message: "Commande introuvable" });
      return res.json({ order: cachedOrderAsShopify(cached), shopName: cached.shopName, storeUrl: normalizeShopifyStoreUrl(cached.storeUrl), integrationId: cached.integrationId, liveUnavailable: true, warning: "Détails locaux affichés. Shopify live indisponible." });
    } catch (error: any) {
      console.error("Error fetching portal order detail:", error);
      res.status(500).json({ message: error.message || "Failed to fetch order detail" });
    }
  });

  app.get("/api/portal/customers/:shopifyCustomerId", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(403).json({ message: "Forbidden" });

      const { shopifyCustomerId } = req.params;
      const integrations = await storage.getShopifyIntegrations();
      const integrationId = Number(req.query.integrationId) || null;
      const requestedStore = req.query.store as string | undefined;
      const allowedContactIds = role.role === "client" && role.contactId ? await getProductContactIds(role.contactId) : undefined;
      if (role.role === "client" && !allowedContactIds) return res.status(403).json({ message: "Forbidden" });
      const authorizedIntegration = findShopifyIntegration(integrations, { integrationId, storeUrl: requestedStore, allowedContactIds });
      const integration = findShopifyIntegration(integrations, { integrationId, storeUrl: requestedStore, allowedContactIds, activeOnly: true });
      const localRep = await storage.getMapiRepByGid(`gid://shopify/Customer/${shopifyCustomerId}`);
      if (role.role === "client" && !authorizedIntegration) return res.status(403).json({ message: "Accès refusé" });
      if (integration) {
        try {
          const { fetchShopifyCustomerDetail, fetchShopifyCustomerOrders } = await import("./shopify-api");
          const [customer, orders] = await Promise.all([
            fetchShopifyCustomerDetail(integration.storeUrl, integration.accessToken, shopifyCustomerId),
            fetchShopifyCustomerOrders(integration.storeUrl, integration.accessToken, shopifyCustomerId),
          ]);
          return res.json({ customer, orders, shopName: integration.shopName, storeUrl: normalizeShopifyStoreUrl(integration.storeUrl), integrationId: integration.id, liveUnavailable: false });
        } catch (liveError: any) {
          if (!localRep) throw liveError;
        }
      }
      if (!localRep) return res.status(404).json({ message: "Rep Shopify introuvable" });
      const cachedOrders = dedupeShopifyOrders(allowedContactIds ? await storage.getShopifyOrdersByContactIds(allowedContactIds) : await storage.getShopifyOrders())
        .filter((order) => order.email?.trim().toLowerCase() === localRep.email.trim().toLowerCase()).map(cachedOrderAsShopify);
      return res.json({ customer: { id: shopifyCustomerId, email: localRep.email, first_name: localRep.firstName, last_name: localRep.lastName, orders_count: cachedOrders.length, total_spent: "0", state: localRep.status, created_at: localRep.createdAt }, orders: cachedOrders, shopName: integration?.shopName ?? "Mapei", storeUrl: normalizeShopifyStoreUrl(integration?.storeUrl ?? authorizedIntegration?.storeUrl ?? requestedStore), integrationId: integration?.id ?? authorizedIntegration?.id ?? integrationId, liveUnavailable: true, warning: "Données Shopify live indisponibles. Dernières données synchronisées affichées." });
    } catch (error: any) {
      console.error("Error fetching portal customer detail:", error);
      res.status(500).json({ message: error.message || "Failed to fetch customer detail" });
    }
  });

  // Fetch Shopify customers for the authenticated client (portal)
  app.get("/api/portal/customers", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json({ customers: [] });
      }
      const { fetchShopifyCustomers } = await import("./shopify-api");
      const integrations = await storage.getShopifyIntegrations();
      const contactIds = await getProductContactIds(role.contactId);
      const scopedActive = integrations.filter((i) => i.isActive && contactIds.includes(i.contactId));
      const mapiActive = scopedActive.filter(
        (integration) => normalizeShopifyStoreUrl(integration.storeUrl) === "tnt5ar-ki.myshopify.com",
      );
      const active = mapiActive.length > 0 ? mapiActive : scopedActive;
      const results: any[] = [];
      let failedStores = 0;
      for (const integration of active) {
        try {
          const customers = await fetchShopifyCustomers(integration.storeUrl, integration.accessToken, 5_000);
          for (const c of customers) {
            results.push({
              ...c,
              shopName: integration.shopName ?? integration.storeUrl,
              storeUrl: integration.storeUrl,
              integrationId: integration.id,
            });
          }
        } catch (err: any) {
          failedStores++;
          console.error(`Failed to fetch portal customers from ${integration.storeUrl}: ${err.message}`);
          await storage.createActivityLog({
            type: /401|invalid.?token/i.test(err.message) ? "shopify_token_invalid" : "shopify_reps_sync_error",
            status: "error",
            message: `Échec lecture reps Shopify pour ${integration.storeUrl} (aucun secret journalisé)`,
          }).catch(() => {});
        }
      }
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      await storage.createActivityLog({
        type: "shopify_reps_sync",
        status: failedStores === 0 ? "success" : "error",
        message: `Lecture reps Shopify: ${results.length} rep(s), ${failedStores} boutique(s) en erreur`,
      }).catch(() => {});
      res.json({ customers: results, totalCount: results.length, failedStores });
    } catch (error: any) {
      console.error("Error fetching portal customers:", error);
      res.status(500).json({ message: error.message || "Failed to fetch customers" });
    }
  });

  app.get("/api/portal/restock-requests", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json([]);
      }
      const requests = await storage.getRestockRequestsByContactIds(await getProductContactIds(role.contactId));
      res.json(requests);
    } catch (error) {
      console.error("Error fetching portal restock requests:", error);
      res.status(500).json({ message: "Failed to fetch restock requests" });
    }
  });

  app.post("/api/portal/restock-requests", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { productId, requestedQuantity } = req.body;
      if (!productId || !requestedQuantity || requestedQuantity < 1) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      // Verify product belongs to the authenticated client's organization.
      const product = await storage.getProduct(productId);
      const productContactIds = await getProductContactIds(role.contactId);
      if (!product || !productContactIds.includes(product.contactId)) {
        return res.status(403).json({ message: "Product not found or not yours" });
      }

      const request = await storage.createRestockRequest({
        contactId: role.contactId,
        productId,
        requestedQuantity,
        status: "Processing",
        zohoSalesOrderId: `SO-${Date.now()}`,
        zohoSalesOrderRef: `SO-REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      });

      await storage.createActivityLog({ type: "restock_request", status: "info", message: `Restock request submitted for "${product.name}" — ${requestedQuantity} unit${requestedQuantity !== 1 ? "s" : ""}` });
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating restock request:", error);
      res.status(500).json({ message: "Failed to create restock request" });
    }
  });

  app.post("/api/portal/product-work-orders", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(403).json({ message: "Non autorisé" });
      }
      const productId = Number(req.body.productId);
      const requestedQuantity = Number(req.body.requestedQuantity);
      if (!Number.isInteger(productId) || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        return res.status(400).json({ message: "Produit ou quantité invalide." });
      }

      const product = await storage.getProduct(productId);
      const contactIds = await getProductContactIds(role.contactId);
      if (!product || !contactIds.includes(product.contactId)) {
        return res.status(403).json({ message: "Ce produit n'appartient pas à votre entreprise." });
      }

      const [contact, formNumber] = await Promise.all([
        storage.getContact(role.contactId),
        storage.getNextFormNumber("product_work_order"),
      ]);
      const userId = req.user?.claims?.sub;
      const userName = `${req.user?.claims?.first_name || ""} ${req.user?.claims?.last_name || ""}`.trim() || contact?.name || "Utilisateur portail";
      const submission = await storage.createFormSubmission({
        formType: "product_work_order",
        formNumber,
        contactId: role.contactId,
        submittedBy: userId,
        submittedByName: userName,
        status: "submitted",
        data: {
          source: "portal_product",
          sourceProductId: product.id,
          sourceProductName: product.name,
          sourceProductSku: product.sku,
          requestedQuantity,
        },
        revision: 1,
        revisionHistory: [{
          date: new Date().toISOString(),
          rev: 1,
          description: `Bon de travail créé depuis le produit ${product.name}`,
          modifiedBy: userName,
        }],
      });

      if (await storage.isNotificationEnabled(role.contactId, "compte")) {
        await storage.createNotification({
          contactId: role.contactId,
          category: "compte",
          type: "reception_soumission",
          title: "Bon de travail soumis",
          message: `Votre demande ${formNumber} pour ${product.name} a été reçue et attend une révision.`,
          metadata: { formId: submission.id, formNumber, formType: "product_work_order", productId: product.id },
        });
      }

      if (contact?.email) {
        sendFormSubmissionEmail({
          email: contact.email,
          name: contact.name,
          formType: "product_work_order",
          formNumber,
        }).catch((error) => console.error("Product work order client email error:", error));
      }
      const settings = await storage.getAdminSettings();
      if (settings?.adminUserId) {
        const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, settings.adminUserId));
        if (adminUser?.email) {
          sendFormAdminNotificationEmail({
            adminEmail: adminUser.email,
            clientName: contact?.name || `Contact #${role.contactId}`,
            formType: "product_work_order",
            formNumber,
          }).catch((error) => console.error("Product work order admin email error:", error));
        }
      }
      await storage.createActivityLog({
        type: "product_work_order_create",
        status: "success",
        message: `Bon de travail ${formNumber} soumis depuis le produit "${product.name}" par ${userName}`,
      });
      res.status(201).json({ ...submission, viewUrl: `/portal/forms/${submission.id}` });
    } catch (error: any) {
      console.error("Error creating product work order:", error);
      res.status(500).json({ message: error.message || "Impossible de créer le bon de travail." });
    }
  });

  app.get("/api/activity-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const logs = await storage.getActivityLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // ====== AVATAR UPLOAD ======

  const avatarsDir = path.join(process.cwd(), "uploads", "avatars");
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: avatarsDir,
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  app.post("/api/auth/avatar", isAuthenticated, avatarUpload.single("avatar"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const userId = req.user.claims.sub;
      const url = `/api/avatars/${req.file.filename}`;
      const user = await authStorage.updateUserAvatar(userId, url);
      res.json(user);
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.get("/api/avatars/:filename", async (req, res) => {
    try {
      const sanitized = path.basename(req.params.filename);
      const filePath = path.join(avatarsDir, sanitized);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Not found" });
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ message: "Error serving avatar" });
    }
  });

  // ====== FORMS SYSTEM ======

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".jpg", ".jpeg", ".png", ".heic", ".pdf", ".mp4", ".mov"];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  app.post("/api/forms/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const fileUrl = `/api/uploads/${req.file.filename}`;
      res.json({
        fileName: req.file.originalname,
        fileUrl,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.get("/api/uploads/:filename", isAuthenticated, async (req: any, res) => {
    try {
      const sanitized = path.basename(req.params.filename);
      const filePath = path.join(uploadsDir, sanitized);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });

      const role = await getUserRole(req);
      if (role?.role === "admin") return res.sendFile(filePath);

      const upload = await storage.getUploadByFilename(sanitized);
      if (!upload) return res.status(404).json({ message: "File not found" });

      const form = await storage.getFormSubmission(upload.formSubmissionId);
      if (!form) return res.status(404).json({ message: "File not found" });

      const contact = await storage.getContactByEmail(req.user.claims.email);
      if (!contact || form.contactId !== contact.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.sendFile(filePath);
    } catch (error: any) {
      console.error("Error serving upload:", error);
      res.status(500).json({ message: "Error serving file" });
    }
  });

  app.get("/api/forms", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const filters: { formType?: string; status?: string; contactId?: number } = {};
      if (req.query.formType) filters.formType = req.query.formType as string;
      if (req.query.status) filters.status = req.query.status as string;

      if (role.role === "admin") {
        if (req.query.contactId) filters.contactId = Number(req.query.contactId);
        const forms = await storage.getFormSubmissions(filters);
        return res.json(forms);
      }

      filters.contactId = role.contactId;
      const forms = await storage.getFormSubmissions(filters);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.post("/api/forms", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const { formType, contactId, data } = req.body;
      if (!formType) return res.status(400).json({ message: "formType is required" });

      const resolvedContactId = role.role === "admin" ? (contactId || 0) : role.contactId;
      if (!resolvedContactId) return res.status(400).json({ message: "contactId is required" });

      const formNumber = await storage.getNextFormNumber(formType);
      const userId = req.user?.claims?.sub;
      const userName = `${req.user?.claims?.first_name || ""} ${req.user?.claims?.last_name || ""}`.trim() || "Unknown";

      const submission = await storage.createFormSubmission({
        formType,
        formNumber,
        contactId: resolvedContactId,
        submittedBy: userId,
        submittedByName: userName,
        status: "draft",
        data: data || {},
        revision: 1,
        revisionHistory: [],
      });

      res.status(201).json(submission);
    } catch (error: any) {
      console.error("Error creating form:", error);
      res.status(500).json({ message: error.message || "Failed to create form" });
    }
  });

  app.get("/api/forms/:id", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });

      if (role.role === "client" && form.contactId !== role.contactId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const uploads = await storage.getFormUploadsBySubmission(form.id);
      res.json({ ...form, uploads });
    } catch (error) {
      console.error("Error fetching form:", error);
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  app.put("/api/forms/:id", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });

      if (role.role === "client") {
        if (form.contactId !== role.contactId) return res.status(403).json({ message: "Not authorized" });
        if (form.status !== "draft") return res.status(403).json({ message: "Cannot edit submitted forms" });
      }

      const { data, status, revisionDescription, price, approvedQuantity } = req.body;
      const userName = `${req.user?.claims?.first_name || ""} ${req.user?.claims?.last_name || ""}`.trim() || "Unknown";

      // Flux isolé : les bons de travail créés depuis un produit ne passent jamais
      // dans les validations ni les automatisations Zoho des formulaires existants.
      if (form.formType === "product_work_order") {
        if (role.role !== "admin") return res.status(403).json({ message: "Ce bon de travail est en lecture seule." });
        if (!status || status === form.status) return res.json(form);
        const allowedTransitions: Record<string, string[]> = {
          submitted: ["in_review"],
          in_review: ["approved"],
          approved: ["completed"],
        };
        if (!(allowedTransitions[form.status] ?? []).includes(status)) {
          return res.status(403).json({ message: `Transition impossible de ${form.status} vers ${status}` });
        }
        let updated = await storage.updateFormSubmission(form.id, { status });
        const contact = await storage.getContact(form.contactId);
        if (contact?.email) {
          sendFormStatusEmail({ email: contact.email, name: contact.name, formNumber: form.formNumber, newStatus: status })
            .catch((error) => console.error("Product work order status email error:", error));
        }
        if (await storage.isNotificationEnabled(form.contactId, "compte")) {
          await storage.createNotification({
            contactId: form.contactId,
            category: "compte",
            type: "statut_soumission",
            title: `Mise à jour du bon de travail ${form.formNumber}`,
            message: `Le statut de votre bon de travail est maintenant « ${status} ».` ,
            metadata: { formId: form.id, formNumber: form.formNumber, formType: form.formType },
          });
        }
        await storage.createActivityLog({
          type: "product_work_order_status",
          status: "success",
          message: `Bon de travail produit ${form.formNumber}: ${form.status} → ${status} par ${userName}`,
        });

        // Le BTP est hors facturation : aucun Sales Order. À l'approbation, il
        // crée uniquement un Zoho Project si Projects est configuré. L'échec
        // externe est journalisé mais ne revient jamais sur l'approbation.
        if (status === "approved" && !form.zohoProjectId) {
          try {
            const settings = await storage.getAdminSettings();
            if (settings?.zohoProjectsPortalId && contact) {
              const rawDomain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
              const domain = rawDomain.split(",").map((value) => value.trim()).filter(Boolean)[0];
              const appDomain = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
              const payload = buildProjectPayload(
                {
                  id: form.id,
                  formNumber: form.formNumber,
                  formType: form.formType,
                  data: form.data,
                  createdAt: form.createdAt,
                  updatedAt: new Date(),
                },
                { name: contact.name, email: contact.email, companyName: contact.companyName },
                appDomain,
              );
              const project = await createZohoProject(settings.zohoProjectsPortalId, payload);
              await storage.updateFormZohoProjectId(form.id, project.id);
              updated = await storage.getFormSubmission(form.id);
              await storage.createActivityLog({
                type: "zoho_project_create",
                status: "success",
                message: `Projet Zoho ${project.id} créé pour le BTP ${form.formNumber}`,
              });
            } else {
              await storage.createActivityLog({
                type: "zoho_project_skipped",
                status: "info",
                message: `BTP ${form.formNumber} approuvé — Zoho Projects non configuré`,
              });
            }
          } catch (error: any) {
            await storage.createActivityLog({
              type: "zoho_project_create_error",
              status: "error",
              message: `BTP ${form.formNumber} approuvé, mais création Zoho Project échouée: ${error.message}`,
            }).catch(() => {});
          }
        }
        return res.json(updated);
      }

      if (status && status !== form.status) {
        const clientAllowed: Record<string, string[]> = { draft: ["submitted"] };
        const adminAllowed: Record<string, string[]> = {
          draft: ["submitted"],
          submitted: ["in_review"],
          in_review: ["approved", "submitted"],
          approved: ["completed", "in_review"],
        };
        const allowed = role.role === "admin" ? adminAllowed : clientAllowed;
        const validTransitions = allowed[form.status] || [];
        if (!validTransitions.includes(status)) {
          return res.status(403).json({ message: `Cannot transition from ${form.status} to ${status}` });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data !== undefined) updateData.data = data;
      if (price !== undefined && role.role === "admin") updateData.price = price === "" || price === null ? null : String(price);
      if (approvedQuantity !== undefined && role.role === "admin") updateData.approvedQuantity = approvedQuantity === "" || approvedQuantity === null ? null : String(approvedQuantity);

      if (status && status !== form.status) {
        updateData.status = status;

        // ── Validation numérique côté serveur — soumission de brouillon ─────────
        // S'applique uniquement au passage draft→submitted.
        // Empêche les valeurs négatives ou nulles de passer si le frontend est contourné.
        if (status === "submitted" && form.status === "draft") {
          const effectiveData = (data !== undefined ? data : form.data) as Record<string, unknown> || {};
          const checkPositive = (val: unknown, label: string): string | null => {
            if (val === undefined || val === null || val === "") return null;
            const n = Number(val);
            if (isNaN(n) || n <= 0) return `${label} doit être un nombre positif.`;
            return null;
          };
          let validationError: string | null = null;
          if (form.formType === "entreposage") {
            validationError =
              checkPositive(effectiveData.longueur, "La longueur") ||
              checkPositive(effectiveData.largeur, "La largeur") ||
              checkPositive(effectiveData.hauteur, "La hauteur") ||
              checkPositive(effectiveData.poids, "Le poids") ||
              checkPositive(effectiveData.paletteNbUnites, "Le nombre d'unités par palette");
          } else if (form.formType === "livraison") {
            validationError =
              checkPositive(effectiveData.nbUnites, "Le nombre d'unités") ||
              checkPositive(effectiveData.poidsTotal, "Le poids total");
          } else if (form.formType === "tri") {
            validationError =
              checkPositive(effectiveData.uniteParBoite, "Le nombre d'unités par boîte") ||
              checkPositive(effectiveData.besoinQuotidien, "Le besoin quotidien") ||
              checkPositive(effectiveData.cycleTri, "La durée du cycle");
          } else if (form.formType === "inspection") {
            const pct = effectiveData.customSamplePercent;
            if (pct !== undefined && pct !== null && pct !== "") {
              const n = Number(pct);
              if (isNaN(n) || n < 0 || n > 100)
                validationError = "Le pourcentage d'échantillonnage doit être compris entre 0 et 100.";
            }
          }
          if (validationError) {
            return res.status(400).json({ message: validationError });
          }
        }

        if (status === "submitted" && form.status === "draft") {
          const history = Array.isArray(form.revisionHistory) ? [...(form.revisionHistory as Record<string, unknown>[])] : [];
          history.push({
            date: new Date().toISOString(),
            rev: form.revision,
            description: revisionDescription || "Initial submission",
            modifiedBy: userName,
          });
          updateData.revisionHistory = history;

          if (form.formType === "tri") {
            const insFormNumber = await storage.getNextFormNumber("inspection");
            const effectiveData = data !== undefined ? data : form.data;
            const formData = (effectiveData || {}) as Record<string, string>;
            const insData = {
              customer: formData.client || "",
              partNumber: formData.codePiece || "",
              partName: formData.description || "",
              workInstruction: `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${formData.codePiece || ""}`,
            };
            const insForm = await storage.createFormSubmission({
              formType: "inspection",
              formNumber: insFormNumber,
              contactId: form.contactId,
              submittedBy: form.submittedBy,
              submittedByName: form.submittedByName,
              status: "draft",
              data: insData,
              revision: 1,
              linkedFormId: form.id,
              revisionHistory: [{
                date: new Date().toISOString(),
                rev: 1,
                description: `Créé automatiquement à partir du formulaire TRI ${form.formNumber}`,
                modifiedBy: userName,
              }],
            });
            updateData.linkedFormId = insForm.id;
          }

          const contact = await storage.getContact(form.contactId);
          if (contact?.email) {
            sendFormSubmissionEmail({
              email: contact.email,
              name: contact.name,
              formType: form.formType,
              formNumber: form.formNumber,
            }).catch((err) => console.error("Form email error:", err));
          }

          ;(async () => {
            const enabled = await storage.isNotificationEnabled(form.contactId, "compte");
            if (enabled) {
              await storage.createNotification({
                contactId: form.contactId,
                category: "compte",
                type: "reception_soumission",
                title: "Demande de soumission reçue",
                message: `Votre demande ${form.formNumber} a bien été reçue et est en cours de traitement.`,
                metadata: { formId: form.id, formNumber: form.formNumber, formType: form.formType },
              });
            }
          })().catch((err) => console.error("Notification error:", err));

          const settings = await storage.getAdminSettings();
          if (settings?.adminUserId) {
            const adminUsers = await db.select().from(usersTable).where(eq(usersTable.id, settings.adminUserId));
            const adminUser = adminUsers[0];
            if (adminUser?.email) {
              sendFormAdminNotificationEmail({
                adminEmail: adminUser.email,
                clientName: contact?.name || `Contact #${form.contactId}`,
                formType: form.formType,
                formNumber: form.formNumber,
              }).catch((err) => console.error("Admin form notification error:", err));
            }
          }

          await storage.createActivityLog({
            type: "form_submission",
            status: "success",
            message: `Form ${form.formNumber} submitted by ${userName}`,
          });
        }

        if (status === "approved" && form.status === "in_review") {
          try {
            const contact = await storage.getContact(form.contactId);
            if (contact) {
              const qty = updateData.approvedQuantity != null ? Number(updateData.approvedQuantity) : 1;
              const rate = updateData.price != null ? Number(updateData.price) : 0;
              const { salesOrderId, salesOrderNumber } = await createFormSalesOrder({
                formNumber: form.formNumber,
                formType: form.formType,
                formData: form.data,
                quantity: qty,
                rate,
                contact: { name: contact.name, email: contact.email, companyName: contact.companyName },
              });
              const region = await getZohoRegion();
              updateData.zohoSalesOrderId = salesOrderId;
              updateData.zohoSalesOrderNumber = salesOrderNumber;
              updateData.zohoSalesOrderUrl = getZohoSOUrl(region, salesOrderId);
              console.log(`[zoho] Created SO ${salesOrderNumber} for form ${form.formNumber}`);
            }
          } catch (err: any) {
            console.error(`[zoho] Failed to create SO for ${form.formNumber}: ${err.message}`);
          }

          // ── Zoho Projects : créer un projet pour cette soumission approuvée ──
          // Ne s'exécute que si Zoho Projects est configuré (portalId présent).
          // Anti-doublon : si zoho_project_id est déjà présent, on skip.
          // L'approbation continue même si la création du projet échoue.
          ;(async () => {
            try {
              if (form.zohoProjectId) {
                console.log(`[zoho-projects] Projet déjà associé à ${form.formNumber} (${form.zohoProjectId}), skip.`);
                return;
              }
              const settings = await storage.getAdminSettings();
              if (!settings?.zohoProjectsPortalId) {
                console.log(`[zoho-projects] portalId non configuré — skip pour ${form.formNumber}`);
                return;
              }
              const contact = await storage.getContact(form.contactId);
              if (!contact) return;

              const appDomain = (() => {
                const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
                const domains = raw.split(",").map((d: string) => d.trim()).filter(Boolean);
                const preferred = domains.find((d: string) => !d.endsWith(".replit.app")) || domains[0];
                return `https://${preferred}`;
              })();

              const payload = buildProjectPayload(
                {
                  formNumber: form.formNumber,
                  formType: form.formType,
                  data: form.data,
                  price: (updateData.price ?? form.price) as string | null,
                  approvedQuantity: (updateData.approvedQuantity ?? form.approvedQuantity) as string | null,
                  zohoSalesOrderNumber: (updateData.zohoSalesOrderNumber ?? form.zohoSalesOrderNumber) as string | null,
                  createdAt: form.createdAt,
                  updatedAt: new Date(),
                },
                { name: contact.name, email: contact.email, companyName: contact.companyName },
                appDomain
              );

              const project = await createZohoProject(settings.zohoProjectsPortalId, payload);
              await storage.updateFormZohoProjectId(form.id, project.id);
              console.log(`[zoho-projects] Projet créé : ${project.id} (${project.name}) pour ${form.formNumber}`);
            } catch (err: any) {
              console.error(`[zoho-projects] Échec création projet pour ${form.formNumber}: ${err.message}`);
            }
          })();
        }

        if (status !== form.status && status !== "draft" && form.status !== "draft") {
          const contact = await storage.getContact(form.contactId);
          if (contact?.email) {
            sendFormStatusEmail({
              email: contact.email,
              name: contact.name,
              formNumber: form.formNumber,
              newStatus: status,
            }).catch((err) => console.error("Status email error:", err));
          }

          const notifData = buildStatusNotification(form.formType, form.status, status, form.formNumber, form.id);
          if (notifData) {
            ;(async () => {
              const enabled = await storage.isNotificationEnabled(form.contactId, notifData.category);
              if (enabled) {
                await storage.createNotification({ contactId: form.contactId, ...notifData });
              }
            })().catch((err) => console.error("Notification error:", err));
          }

          const statusLabels: Record<string, string> = { submitted: "Soumis", in_review: "En révision", approved: "Approuvé", completed: "Complété" };
          await storage.createActivityLog({
            type: "form_status_change",
            status: "success",
            message: `${form.formNumber} : ${statusLabels[form.status] || form.status} → ${statusLabels[status] || status} par ${userName}`,
          });
        }
      }

      if (revisionDescription && status !== "submitted") {
        const newRevision = form.revision + 1;
        updateData.revision = newRevision;
        const history = Array.isArray(form.revisionHistory) ? [...(form.revisionHistory as Record<string, unknown>[])] : [];
        history.push({
          date: new Date().toISOString(),
          rev: newRevision,
          description: revisionDescription,
          modifiedBy: userName,
        });
        updateData.revisionHistory = history;
      }

      const updated = await storage.updateFormSubmission(form.id, updateData);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating form:", error);
      res.status(500).json({ message: error.message || "Failed to update form" });
    }
  });

  app.post("/api/forms/:id/create-zoho-so", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });
      if (form.status !== "approved") return res.status(400).json({ message: "Form must be approved" });

      // LOT 3 — Deduplication: if a SO already exists, return it without creating a duplicate
      if (form.zohoSalesOrderId) {
        const region = await getZohoRegion();
        return res.status(409).json({
          message: "Un bon de commande Zoho existe déjà pour cette soumission.",
          salesOrderId: form.zohoSalesOrderId,
          salesOrderNumber: form.zohoSalesOrderNumber,
          zohoSalesOrderUrl: form.zohoSalesOrderUrl ?? getZohoSOUrl(region, form.zohoSalesOrderId),
          alreadyExists: true,
        });
      }

      const contact = await storage.getContact(form.contactId);
      if (!contact) return res.status(404).json({ message: "Contact not found" });

      const qty = form.approvedQuantity != null ? Number(form.approvedQuantity) : 1;
      const rate = form.price != null ? Number(form.price) : 0;

      const { salesOrderId, salesOrderNumber } = await createFormSalesOrder({
        formNumber: form.formNumber,
        formType: form.formType,
        formData: form.data,
        quantity: qty,
        rate,
        contact: { name: contact.name, email: contact.email, companyName: contact.companyName },
      });
      const region = await getZohoRegion();
      const zohoSalesOrderUrl = getZohoSOUrl(region, salesOrderId);

      await storage.updateFormSubmission(form.id, {
        zohoSalesOrderId: salesOrderId,
        zohoSalesOrderNumber: salesOrderNumber,
        zohoSalesOrderUrl,
      });

      console.log(`[zoho] Manually created SO ${salesOrderNumber} for form ${form.formNumber}`);
      res.json({ salesOrderId, salesOrderNumber, zohoSalesOrderUrl });
    } catch (error: any) {
      console.error(`[zoho] Failed to create SO:`, error.message);
      const msg = error.message || "";
      if (msg.includes("invalid_code") || msg.includes("refresh error") || msg.includes("Token refresh failed")) {
        return res.status(401).json({ message: "Votre connexion Zoho a expiré. Reconnectez Zoho dans Paramètres → Zoho Inventory.", code: "ZOHO_TOKEN_EXPIRED" });
      }
      res.status(500).json({ message: msg || "Failed to create Zoho sales order" });
    }
  });

  // ── Zoho Projects : récupérer les portails accessibles ──────────────────────
  app.get("/api/zoho/projects/portals", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const portals = await getZohoProjectsPortals();
      res.json({ portals });
    } catch (err: any) {
      console.error("[zoho-projects] Portals error:", err.message);
      const msg = err.message || "";
      if (msg.includes("4") && (msg.includes("03") || msg.includes("01"))) {
        return res.status(403).json({
          message: "Accès refusé — reconnectez Zoho pour autoriser les scopes Zoho Projects.",
          code: "ZOHO_PROJECTS_SCOPE_MISSING",
        });
      }
      res.status(500).json({ message: msg || "Impossible de récupérer les portails Zoho Projects" });
    }
  });

  // ── Zoho Projects : sauvegarder le portalId sélectionné ─────────────────────
  app.patch("/api/admin-settings/zoho-projects", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { portalId, portalName } = req.body as { portalId: string | null; portalName: string | null };
      await storage.updateZohoProjectsSettings({
        portalId: portalId || null,
        portalName: portalName || null,
        lastTestedAt: new Date(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur lors de la sauvegarde" });
    }
  });

  // ── Zoho Projects : retry manuel de création de projet ──────────────────────
  app.post("/api/forms/:id/create-zoho-project", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Soumission introuvable" });
      if (form.status !== "approved" && form.status !== "completed") {
        return res.status(400).json({ message: "La soumission doit être approuvée ou complétée" });
      }
      if (form.zohoProjectId) {
        return res.json({ projectId: form.zohoProjectId, alreadyExists: true });
      }

      const settings = await storage.getAdminSettings();
      if (!settings?.zohoProjectsPortalId) {
        return res.status(400).json({ message: "Zoho Projects n'est pas configuré (portalId manquant)" });
      }

      const contact = await storage.getContact(form.contactId);
      if (!contact) return res.status(404).json({ message: "Contact introuvable" });

      const appDomain = (() => {
        const raw = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
        const domains = raw.split(",").map((d: string) => d.trim()).filter(Boolean);
        const preferred = domains.find((d: string) => !d.endsWith(".replit.app")) || domains[0];
        return `https://${preferred}`;
      })();

      const payload = buildProjectPayload(
        {
          formNumber: form.formNumber,
          formType: form.formType,
          data: form.data,
          price: form.price,
          approvedQuantity: form.approvedQuantity,
          zohoSalesOrderNumber: form.zohoSalesOrderNumber,
          createdAt: form.createdAt,
          updatedAt: form.updatedAt,
        },
        { name: contact.name, email: contact.email, companyName: contact.companyName },
        appDomain
      );

      const project = await createZohoProject(settings.zohoProjectsPortalId, payload);
      await storage.updateFormZohoProjectId(form.id, project.id);

      await storage.createActivityLog({
        type: "zoho_project_create",
        status: "success",
        message: `Projet Zoho Projects créé manuellement : ${project.id} pour ${form.formNumber}`,
      });

      console.log(`[zoho-projects] Retry manuel OK : projet ${project.id} pour ${form.formNumber}`);
      res.json({ projectId: project.id, projectName: project.name });
    } catch (err: any) {
      console.error("[zoho-projects] Retry error:", err.message);
      res.status(500).json({ message: err.message || "Échec de la création du projet Zoho" });
    }
  });

  app.get("/api/forms/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });

      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      if (role.role === "client") {
        if (!("contactId" in role) || form.contactId !== role.contactId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      if (form.status === "draft") {
        return res.status(400).json({ message: "Cannot generate PDF for draft forms" });
      }
      if (form.formType === "product_work_order") {
        return res.status(400).json({ message: "Aucun PDF n'est généré pour les bons de travail produit." });
      }

      const contact = await storage.getContact(form.contactId);
      const uploads = await storage.getFormUploadsBySubmission(form.id);

      const pdfBuffer = await generateFormPdf(form, contact, uploads);

      // Nom de fichier : Soumission-{id}-{nom-client-sécurisé}.pdf
      const rawName = contact?.name ?? "inconnu";
      const safeName =
        rawName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")   // supprimer les accents
          .replace(/[^a-zA-Z0-9\-]/g, "-")   // tout caractère non alphanum/tiret → tiret
          .replace(/-{2,}/g, "-")             // tirets multiples → un seul
          .replace(/^-+|-+$/g, "")           // supprimer tirets en début/fin
          .toLowerCase() || "inconnu";
      const pdfFilename = `Soumission-${form.id}-${safeName}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  app.post("/api/forms/:id/create-linked-livraison", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });
      if (form.formType !== "copacking") return res.status(400).json({ message: "Only co-packing forms can create linked livraison" });
      if (form.linkedFormId) return res.status(400).json({ message: "This form already has a linked form" });

      const formData = (form.data && typeof form.data === "object") ? form.data as Record<string, unknown> : {};
      const userId = req.user?.claims?.sub;
      const userName = `${req.user?.claims?.first_name || ""} ${req.user?.claims?.last_name || ""}`.trim() || "Unknown";

      const livFormNumber = await storage.getNextFormNumber("livraison");
      const livData = {
        reference: `${form.formNumber}`,
        typeMarchandise: "",
        nbUnites: "",
        poidsTotal: "",
        unitePoids: "kg",
        destinationType: "local",
        hasTailgate: false,
        hasRendezVous: false,
        rvDate: "",
        rvTime: "",
        destinations: [{ adresse: "", contact: "", telephone: "", notes: "" }],
        modeBilling: "forfaitaire",
        documentation: [],
        instructionsSpeciales: formData.projet ? `Lié au projet co-packing: ${formData.projet}` : "",
      };

      const livForm = await storage.createFormSubmission({
        formType: "livraison",
        formNumber: livFormNumber,
        contactId: form.contactId,
        submittedBy: userId,
        submittedByName: userName,
        status: "draft",
        data: livData,
        revision: 1,
        linkedFormId: form.id,
        revisionHistory: [{
          date: new Date().toISOString(),
          rev: 1,
          description: `Créé automatiquement à partir du bon de travail ${form.formNumber}`,
          modifiedBy: userName,
        }],
      });

      await storage.updateFormSubmission(form.id, { linkedFormId: livForm.id });

      res.status(201).json(livForm);
    } catch (error: unknown) {
      console.error("Error creating linked livraison:", error);
      res.status(500).json({ message: "Failed to create linked livraison" });
    }
  });

  app.delete("/api/forms/bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids must be a non-empty array" });
      }
      await storage.bulkDeleteFormSubmissions(ids.map(Number));
      res.json({ message: `${ids.length} form(s) deleted` });
    } catch (error) {
      console.error("Error bulk deleting forms:", error);
      res.status(500).json({ message: "Failed to delete forms" });
    }
  });

  app.delete("/api/forms/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteFormSubmission(Number(req.params.id));
      res.json({ message: "Form deleted" });
    } catch (error) {
      console.error("Error deleting form:", error);
      res.status(500).json({ message: "Failed to delete form" });
    }
  });

  app.post("/api/forms/:id/uploads", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const form = await storage.getFormSubmission(Number(req.params.id));
      if (!form) return res.status(404).json({ message: "Form not found" });

      if (role.role === "client") {
        if (form.contactId !== role.contactId) {
          return res.status(403).json({ message: "Not authorized" });
        }
        if (form.status !== "draft") {
          return res.status(403).json({ message: "Cannot upload to non-draft form" });
        }
      }

      const { fieldKey, fileName, fileUrl, fileType, fileSize } = req.body;
      const upload = await storage.createFormUpload({
        formSubmissionId: form.id,
        fieldKey,
        fileName,
        fileUrl,
        fileType,
        fileSize,
      });
      res.status(201).json(upload);
    } catch (error) {
      console.error("Error creating upload record:", error);
      res.status(500).json({ message: "Failed to create upload record" });
    }
  });

  app.delete("/api/form-uploads/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteFormUpload(Number(req.params.id));
      res.json({ message: "Upload deleted" });
    } catch (error) {
      console.error("Error deleting upload:", error);
      res.status(500).json({ message: "Failed to delete upload" });
    }
  });

  app.get("/api/admin/view-as/:contactId/forms", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contactId = Number(req.params.contactId);
      const forms = await storage.getFormSubmissionsByContact(contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching view-as forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.get("/api/portal/forms", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) return res.json([]);
      const forms = await storage.getFormSubmissionsByContact(role.contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching portal forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  // ── Commandes (approved/completed form submissions) ──────────────────────

  app.get("/api/admin/commandes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
      const forms = await storage.getCommandeForms(contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching commandes:", error);
      res.status(500).json({ message: "Failed to fetch commandes" });
    }
  });

  app.get("/api/portal/commandes", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });
      if (role.role === "admin") {
        const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
        const forms = await storage.getCommandeForms(contactId);
        return res.json(forms);
      }
      if (!role.contactId) return res.json([]);
      const forms = await storage.getCommandeForms(role.contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching portal commandes:", error);
      res.status(500).json({ message: "Failed to fetch commandes" });
    }
  });

  // ── Livraisons (outbound inventory) ──────────────────────────────────────

  app.get("/api/portal/livraisons", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });
      if (role.role === "admin") {
        const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
        const forms = await storage.getLivraisonForms(contactId);
        return res.json(forms);
      }
      if (!role.contactId) return res.json([]);
      const forms = await storage.getLivraisonForms(role.contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching portal livraisons:", error);
      res.status(500).json({ message: "Failed to fetch livraisons" });
    }
  });

  app.get("/api/admin/livraisons", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
      const forms = await storage.getLivraisonForms(contactId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching livraisons:", error);
      res.status(500).json({ message: "Failed to fetch livraisons" });
    }
  });

  app.post("/api/forms/:id/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      const original = await storage.getFormSubmission(Number(req.params.id));
      if (!original) return res.status(404).json({ message: "Form not found" });

      if (role.role === "client" && original.contactId !== role.contactId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const contactId = role.role === "admin" ? original.contactId : role.contactId!;
      const formNumber = await storage.getNextFormNumber(original.formType);
      const userId = req.user?.claims?.sub;
      const userName = `${req.user?.claims?.first_name || ""} ${req.user?.claims?.last_name || ""}`.trim() || "Unknown";

      const newForm = await storage.createFormSubmission({
        formType: original.formType,
        formNumber,
        contactId,
        submittedBy: userId,
        submittedByName: userName,
        status: "submitted",
        data: original.data || {},
        revision: 1,
        revisionHistory: [{
          date: new Date().toISOString(),
          rev: 1,
          description: `Re-commande basée sur ${original.formNumber}`,
          modifiedBy: userName,
        }],
      });

      // Send submission confirmation email to client
      const contact = await storage.getContact(contactId);
      if (contact?.email) {
        sendFormSubmissionEmail({
          email: contact.email,
          name: contact.name,
          formType: newForm.formType,
          formNumber: newForm.formNumber,
        }).catch((err) => console.error("Reorder email error:", err));
      }

      // Notify admin
      const settings = await storage.getAdminSettings();
      if (settings?.adminUserId) {
        const adminUsers = await db.select().from(usersTable).where(eq(usersTable.id, settings.adminUserId));
        const adminUser = adminUsers[0];
        if (adminUser?.email) {
          sendFormAdminNotificationEmail({
            adminEmail: adminUser.email,
            clientName: contact?.name || `Contact #${contactId}`,
            formType: newForm.formType,
            formNumber: newForm.formNumber,
          }).catch((err) => console.error("Reorder admin notification error:", err));
        }
      }

      await storage.createActivityLog({
        type: "form_submission",
        status: "success",
        message: `Re-commande ${newForm.formNumber} soumise par ${userName} (basée sur ${original.formNumber})`,
      });

      res.status(201).json(newForm);
    } catch (error: any) {
      console.error("Error reordering form:", error);
      res.status(500).json({ message: error.message || "Failed to reorder" });
    }
  });

  // ─── Notification Preferences ───────────────────────────────────
  app.get("/api/portal/notifications/preferences", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.json({});
      const prefs = await storage.getNotificationPreferences(role.contactId);
      const map: Record<string, boolean> = {};
      prefs.forEach((p) => { map[p.category] = p.enabled; });
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/portal/notifications/preferences", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.json({ ok: true });
      const { category, enabled } = req.body;
      if (!category || typeof enabled !== "boolean") {
        return res.status(400).json({ message: "Missing category or enabled" });
      }
      await storage.upsertNotificationPreference(role.contactId, category, enabled);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Notifications ──────────────────────────────────────────────
  app.get("/api/portal/notifications", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.status(403).json({ message: "Client contact not found" });
      const notifs = await storage.getNotificationsByContactId(role.contactId);
      res.json(notifs.filter((notification) => !(notification.metadata as any)?.adminOnly));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/portal/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.json({ count: 0 });
      const notifs = await storage.getNotificationsByContactId(role.contactId);
      const count = notifs.filter((notification) => !notification.isRead && !(notification.metadata as any)?.adminOnly).length;
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/portal/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.status(403).json({ message: "Client contact not found" });
      await storage.markAllNotificationsRead(role.contactId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || !role.contactId) return res.status(401).json({ message: "Non autorisé" });

      const notifId = Number(req.params.id);

      // Vérification d'appartenance — seul le propriétaire peut marquer comme lu
      const ownedNotifs = await storage.getNotificationsByContactId(role.contactId);
      const belongs = ownedNotifs.some((n) => n.id === notifId && !(n.metadata as any)?.adminOnly);
      if (!belongs) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      await storage.markNotificationRead(notifId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Admin : notifications opérationnelles réellement non lues ─────────────
  app.get("/api/admin/notifications/new-count", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (role?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const notifs = await storage.getAllNotifications();
      const count = notifs.filter((n) =>
        (n.metadata as any)?.adminOnly && !n.isRead
      ).length;
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (role?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const notifs = await storage.getAllNotifications();
      const contacts = await storage.getContacts();
      const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c]));
      const enriched = notifs
        .filter((n) => n.type !== "systemd_order_paid")
        .map((n) => ({ ...n, contact: contactMap[n.contactId] || null }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (role?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const id = Number(req.params.id);
      const notification = (await storage.getAllNotifications()).find((item) => item.id === id);
      if (!notification || !(notification.metadata as any)?.adminOnly) return res.status(404).json({ message: "Notification opérationnelle introuvable" });
      await storage.markNotificationRead(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin-settings/zoho-projects/disconnect", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const settings = await storage.getAdminSettings();
      await storage.updateZohoProjectsSettings({ portalId: null, portalName: null, lastTestedAt: null });
      await storage.createActivityLog({
        type: "zoho_projects_disconnect",
        status: "success",
        message: `Zoho Projects déconnecté${settings?.zohoProjectsPortalName ? ` (${settings.zohoProjectsPortalName})` : ""}. Zoho Inventory et les identifiants de projets historiques sont conservés.`,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur lors de la déconnexion Zoho Projects" });
    }
  });

  app.post("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (role?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { contactId, category, type, title, message } = req.body;
      if (!contactId || !category || !type || !title || !message) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const notif = await storage.createNotification({ contactId: Number(contactId), category, type, title, message, metadata: {} });
      res.status(201).json(notif);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/notifications/:id", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (role?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      await storage.deleteNotification(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPI Rep Budgets
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const {
      createRep,
      creditRep,
      debitRep,
      getRepBalance,
      getRepTransactionHistory,
      renewRepBudget,
      deactivateRepInShopify,
      listRepsFromShopify,
      MAPI_STORE_URL,
      MAPI_CREDIT_REQUIRED_SCOPES,
    } = await import("./mapi-rep-budget");

    const getMapiIntegration = async () => {
      const integrations = await storage.getShopifyIntegrations();
      const matching = integrations.filter(
        (integration) => normalizeShopifyStoreUrl(integration.storeUrl) === MAPI_STORE_URL,
      );
      return matching.find((integration) => integration.isActive && integration.accessToken)
        ?? matching.find((integration) => integration.accessToken)
        ?? matching[0];
    };

    const roleCanAccessMapi = async (role: Awaited<ReturnType<typeof getUserRole>>, integration: { contactId: number } | undefined) => {
      if (!role || !integration) return false;
      if (role.role === "admin") return true;
      if (!role.contactId) return false;
      const contactIds = await getProductContactIds(role.contactId);
      return contactIds.includes(integration.contactId);
    };

    const findMapiRepByEmail = async (email: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await listRepsFromShopify(cursor);
        const match = page.reps.find((rep) => rep.email?.trim().toLowerCase() === normalizedEmail);
        if (match) return match;
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 100);
      return null;
    };

    const creditErrorStatus = shopifyCreditHttpStatus;
    const creditErrorActivityType = (error: any, fallback: string) => {
      if (error?.code === "SHOPIFY_PERMISSION_INSUFFICIENT" || /scope|permission|access denied|403/i.test(error?.message ?? "")) {
        return "shopify_permission_insufficient";
      }
      if (error?.code === "SHOPIFY_TOKEN_INVALID" || /invalid.?token|401|connexion shopify requise/i.test(error?.message ?? "")) {
        return "shopify_token_invalid";
      }
      return fallback;
    };

    const getOrCreateRepDetail = async (input: {
      customerId: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      performedByUserId?: string | null;
    }) => {
      const gid = `gid://shopify/Customer/${input.customerId}`;
      let rep = await storage.getMapiRepByGid(gid);
      if (!rep) {
        rep = await storage.createMapiRep({
          shopifyCustomerGid: gid,
          email: input.email || `customer-${input.customerId}@placeholder.local`,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          status: "active",
          currentBalance: "0.00",
          currentBalanceCurrency: "CAD",
        });
      }

      const balances = await getRepBalance(rep.shopifyCustomerGid);
      const cad = balances.find((balance: any) => balance.currencyCode === "CAD") ?? balances[0];
      if (cad) {
        const updated = await storage.updateMapiRep(rep.id, {
          currentBalance: cad.amount,
          currentBalanceCurrency: cad.currencyCode,
          lastBalanceRefreshAt: new Date(),
        });
        if (updated) rep = updated;
      }

      const [logs, shopifyTransactions] = await Promise.all([
        storage.getMapiRepCreditLogs(rep.id),
        getRepTransactionHistory(rep.shopifyCustomerGid).catch(() => []),
      ]);
      await storage.createActivityLog({
        type: "shopify_credit_read",
        status: "success",
        message: `Solde crédit Shopify consulté pour le rep ${rep.email}`,
      }).catch(() => {});
      return { rep, logs, shopifyTransactions };
    };

    app.post("/api/admin/mapi/reps/sync", isAuthenticated, isAdmin, async (_req, res) => {
      try {
        const integration = await getMapiIntegration();
        if (!integration?.isActive || !integration.accessToken) {
          return res.status(503).json({ message: "Connexion Shopify requise." });
        }

        let cursor: string | undefined;
        let synced = 0;
        let pages = 0;
        do {
          const page = await listRepsFromShopify(cursor);
          for (const shopifyRep of page.reps) {
            const cad = shopifyRep.balances.find((balance) => balance.currencyCode === "CAD") ?? shopifyRep.balances[0];
            const existing = await storage.getMapiRepByGid(shopifyRep.shopifyCustomerId);
            await storage.upsertMapiRepByGid(shopifyRep.shopifyCustomerId, {
              shopifyCustomerGid: shopifyRep.shopifyCustomerId,
              email: shopifyRep.email || existing?.email || "email-indisponible@placeholder.local",
              firstName: shopifyRep.firstName,
              lastName: shopifyRep.lastName,
              status: existing?.status ?? "active",
              monthlyBudgetAmount: existing?.monthlyBudgetAmount ?? null,
              monthlyBudgetCurrency: existing?.monthlyBudgetCurrency ?? "CAD",
              currentBalance: cad?.amount ?? existing?.currentBalance ?? "0.00",
              currentBalanceCurrency: cad?.currencyCode ?? existing?.currentBalanceCurrency ?? "CAD",
              lastBalanceRefreshAt: new Date(),
            });
            synced++;
          }
          cursor = page.nextCursor;
          pages++;
        } while (cursor && pages < 100);

        await storage.createActivityLog({
          type: "shopify_reps_sync",
          status: "success",
          message: `Synchronisation reps Mapei terminée: ${synced} rep(s)`,
        });
        res.json({ synced, requiredScopes: MAPI_CREDIT_REQUIRED_SCOPES });
      } catch (err: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(err, "shopify_reps_sync_error"),
          status: "error",
          message: `Synchronisation reps Mapei échouée: ${err.message}`,
        }).catch(() => {});
        res.status(creditErrorStatus(err.message)).json({ message: err.message || "Crédit Shopify indisponible." });
      }
    });

    app.get("/api/portal/mapi/reps/by-shopify-customer/:customerId", isAuthenticated, async (req: any, res) => {
      try {
        const role = await getUserRole(req);
        const integration = await getMapiIntegration();
        if (!integration?.isActive || !integration.accessToken) {
          return res.status(503).json({ message: "Connexion Shopify requise." });
        }
        if (!await roleCanAccessMapi(role, integration)) {
          return res.status(403).json({ message: "Accès refusé." });
        }

        const customerId = String(req.params.customerId);
        if (!/^\d+$/.test(customerId)) return res.status(400).json({ message: "Rep Shopify invalide." });
        const { fetchShopifyCustomerDetail } = await import("./shopify-api");
        const customer: any = await fetchShopifyCustomerDetail(integration.storeUrl, integration.accessToken, customerId);
        const payload = await getOrCreateRepDetail({
          customerId,
          email: customer.email,
          firstName: customer.first_name,
          lastName: customer.last_name,
          performedByUserId: req.user?.claims?.sub ?? null,
        });
        res.json({ ...payload, canManageCredit: true });
      } catch (err: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(err, "shopify_credit_error"),
          status: "error",
          message: `Lecture crédit Shopify échouée: ${err.message}`,
        }).catch(() => {});
        res.status(creditErrorStatus(err.message)).json({ message: err.message || "Crédit Shopify indisponible." });
      }
    });

    app.get("/api/portal/mapi/reps", isAuthenticated, async (req: any, res) => {
      try {
        const role = await getUserRole(req);
        const integration = await getMapiIntegration();
        if (!integration?.isActive || !integration.accessToken) {
          return res.status(503).json({ message: "Connexion Shopify requise." });
        }
        if (!await roleCanAccessMapi(role, integration) || role?.role !== "client" || !role.contactId) {
          return res.status(403).json({ message: "Accès refusé." });
        }
        const authenticatedEmail = await getAuthenticatedEmail(req);
        const allowedContactIds = await getProductContactIds(role.contactId);
        const localOrders = (await storage.getSystemdOrders()).filter((order) =>
          order.status === "paid" && allowedContactIds.includes(order.contactId),
        );
        const reps: any[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await listRepsFromShopify(cursor);
          for (const rep of page.reps) {
            const cad = rep.balances.find((balance) => balance.currencyCode === "CAD") ?? rep.balances[0];
            const repSystemdOrders = localOrders.filter((order) => order.shopifyCustomerGid === rep.shopifyCustomerId);
            reps.push({
              id: rep.shopifyCustomerId.split("/").pop(),
              gid: rep.shopifyCustomerId,
              firstName: rep.firstName,
              lastName: rep.lastName,
              email: rep.email || null,
              balance: cad?.amount ?? "0.00",
              currency: cad?.currencyCode ?? "CAD",
              numberOfOrders: Number(rep.numberOfOrders ?? 0) + repSystemdOrders.length,
              amountSpent: (Number(rep.amountSpent ?? 0) + repSystemdOrders.reduce((sum, order) => sum + order.amount / 100, 0)).toFixed(2),
              createdAt: rep.createdAt,
              status: "active",
              isCurrentContact: !!authenticatedEmail && rep.email?.trim().toLowerCase() === authenticatedEmail,
              integrationId: integration.id,
              storeUrl: normalizeShopifyStoreUrl(integration.storeUrl),
            });
            const existing = await storage.getMapiRepByGid(rep.shopifyCustomerId);
            await storage.upsertMapiRepByGid(rep.shopifyCustomerId, {
              shopifyCustomerGid: rep.shopifyCustomerId,
              email: rep.email || existing?.email || "email-indisponible@placeholder.local",
              firstName: rep.firstName,
              lastName: rep.lastName,
              status: existing?.status ?? "active",
              monthlyBudgetAmount: existing?.monthlyBudgetAmount ?? null,
              monthlyBudgetCurrency: existing?.monthlyBudgetCurrency ?? "CAD",
              currentBalance: cad?.amount ?? existing?.currentBalance ?? "0.00",
              currentBalanceCurrency: cad?.currencyCode ?? existing?.currentBalanceCurrency ?? "CAD",
              lastBalanceRefreshAt: new Date(),
            });
          }
          cursor = page.nextCursor;
          pages++;
        } while (cursor && pages < 100);
        await storage.createActivityLog({
          type: "shopify_credit_read",
          status: "success",
          message: `Liste des reps et soldes Shopify consultée par le contact #${role.contactId}`,
        }).catch(() => {});
        res.json({ reps });
      } catch (error: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(error, "shopify_credit_error"),
          status: "error",
          message: `Lecture de la liste des crédits reps échouée: ${error.message}`,
        }).catch(() => {});
        const role = await getUserRole(req);
        const integration = await getMapiIntegration();
        if (role?.role === "client" && role.contactId && await roleCanAccessMapi(role, integration)) {
          const authenticatedEmail = await getAuthenticatedEmail(req);
          const cached = await storage.getMapiReps("active");
          if (cached.length > 0) {
            return res.json({
              stale: true,
              reps: cached.map((rep) => ({
                id: rep.shopifyCustomerGid.split("/").pop(),
                gid: rep.shopifyCustomerGid,
                firstName: rep.firstName,
                lastName: rep.lastName,
                email: rep.email,
                balance: rep.currentBalance ?? "0.00",
                currency: rep.currentBalanceCurrency ?? "CAD",
                numberOfOrders: 0,
                amountSpent: "0",
                createdAt: rep.createdAt,
                status: rep.status,
                isCurrentContact: !!authenticatedEmail && rep.email.trim().toLowerCase() === authenticatedEmail,
                integrationId: integration?.id ?? null,
                storeUrl: normalizeShopifyStoreUrl(integration?.storeUrl),
              })),
            });
          }
        }
        res.status(creditErrorStatus(error.message)).json({ message: error.message || "Crédit Shopify indisponible." });
      }
    });

    app.post("/api/portal/mapi/reps/:id/credit", isAuthenticated, async (req: any, res) => {
      return res.status(410).json({ message: "Les crédits reps se gèrent dans Shopify. Système D est en lecture et synchronisation uniquement." });
      /* Couche historique conservée temporairement pour audit; aucun appel UI ne peut l'atteindre.
      try {
        const role = await getUserRole(req);
        const integration = await getMapiIntegration();
        if (!integration?.isActive || !integration.accessToken) {
          return res.status(503).json({ message: "Connexion Shopify requise." });
        }
        if (!await roleCanAccessMapi(role, integration)) {
          return res.status(403).json({ message: "Accès refusé." });
        }

        const { amount, currency = "CAD", reason } = req.body;
        if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: "Montant invalide." });
        const rep = await storage.getMapiRep(String(req.params.id));
        if (!rep) return res.status(404).json({ message: "Rep Shopify introuvable." });

        const result = await creditRep({
          shopifyCustomerId: rep.shopifyCustomerGid,
          amount: parseFloat(amount).toFixed(2),
          currencyCode: currency,
        });
        const updatedRep = await storage.updateMapiRep(rep.id, {
          currentBalance: result.newBalance.amount,
          currentBalanceCurrency: result.newBalance.currencyCode,
          lastBalanceRefreshAt: new Date(),
        });
        await storage.createMapiRepCreditLog({
          repId: rep.id,
          shopifyCustomerGid: rep.shopifyCustomerGid,
          action: "credit",
          amount: parseFloat(amount).toFixed(2),
          currency,
          reason: reason ?? "Crédit assigné depuis le portail Mapei",
          performedByUserId: req.user?.claims?.sub ?? null,
          shopifyTransactionId: result.transactionId,
        });
        await storage.createActivityLog({
          type: "shopify_credit_add",
          status: "success",
          message: `Crédit Shopify ajouté au rep ${rep.email}: ${parseFloat(amount).toFixed(2)} ${currency}`,
        });
        res.json({ rep: updatedRep, message: "Crédit ajouté avec succès." });
      } catch (err: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(err, "shopify_credit_error"),
          status: "error",
          message: `Ajout crédit Shopify échoué: ${err.message}`,
        }).catch(() => {});
        res.status(creditErrorStatus(err.message)).json({ message: err.message || "Crédit Shopify indisponible." });
      }
      */
    });

    // List all reps
    app.get("/api/mapi/reps", isAuthenticated, isAdmin, async (req, res) => {
      try {
        const reps = await storage.getMapiReps();
        res.json(reps);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    // Create a new rep
    app.post("/api/mapi/reps", isAuthenticated, isAdmin, async (req: any, res) => {
      try {
        const { email, firstName, lastName } = req.body;
        if (!email) return res.status(400).json({ message: "Email requis" });

        const { shopifyCustomerId } = await createRep({ email, firstName, lastName });

        const rep = await storage.createMapiRep({
          shopifyCustomerGid: shopifyCustomerId,
          email,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          status: "active",
          currentBalance: "0.00",
          currentBalanceCurrency: "CAD",
        });

        res.json({ rep });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    // Bulk monthly renewal for all active reps with a budget set
    app.post("/api/mapi/reps/bulk-monthly-renewal", isAuthenticated, isAdmin, async (req: any, res) => {
      return res.status(410).json({ message: "Les crédits reps se gèrent dans Shopify." });
      /* Flux historique désactivé.
      try {
        const userId = req.user?.id ?? null;
        const reps = await storage.getMapiReps("active");
        const eligible = reps.filter((r) => r.monthlyBudgetAmount && parseFloat(r.monthlyBudgetAmount) > 0);
        let renewed = 0;
        const errors: string[] = [];

        for (const rep of eligible) {
          try {
            const result = await renewRepBudget({
              shopifyCustomerId: rep.shopifyCustomerGid,
              monthlyBudgetAmount: rep.monthlyBudgetAmount!,
              currencyCode: rep.monthlyBudgetCurrency ?? "CAD",
            });
            const newBalance = result.newBalance.amount;
            await storage.updateMapiRep(rep.id, {
              currentBalance: newBalance,
              lastBalanceRefreshAt: new Date(),
            });
            await storage.createMapiRepCreditLog({
              repId: rep.id,
              shopifyCustomerGid: rep.shopifyCustomerGid,
              action: "monthly_renewal",
              amount: rep.monthlyBudgetAmount!,
              currency: rep.monthlyBudgetCurrency ?? "CAD",
              reason: "Renouvellement mensuel global",
              performedByUserId: userId,
            });
            renewed++;
          } catch (e: any) {
            errors.push(`${rep.email}: ${e.message}`);
          }
        }

        res.json({ renewed, errors });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
      */
    });

    // Lookup rep by Shopify numeric customer ID (returns full detail with logs + transactions)
    app.get("/api/mapi/reps/by-shopify-customer/:customerId", isAuthenticated, isAdmin, async (req, res) => {
      try {
        const gid = `gid://shopify/Customer/${req.params.customerId}`;
        const allReps = await storage.getMapiReps();
        let rep = allReps.find((r) => r.shopifyCustomerGid === gid);

        // Auto-create rep record if not found — all Shopify customers are treated as reps
        if (!rep) {
          const email = (req.query.email as string) || `customer-${req.params.customerId}@placeholder.local`;
          const firstName = (req.query.firstName as string) || null;
          const lastName = (req.query.lastName as string) || null;
          rep = await storage.createMapiRep({
            shopifyCustomerGid: gid,
            email,
            firstName,
            lastName,
            status: "active",
            currentBalance: "0.00",
            currentBalanceCurrency: "CAD",
          });
        }

        const [logs, shopifyTransactions] = await Promise.all([
          storage.getMapiRepCreditLogs(rep.id),
          getRepTransactionHistory(rep.shopifyCustomerGid).catch(() => []),
        ]);

        try {
          const balances = await getRepBalance(rep.shopifyCustomerGid);
          const cad = balances.find((b: any) => b.currencyCode === "CAD") ?? balances[0];
          if (cad) {
            await storage.updateMapiRep(rep.id, { currentBalance: cad.amount, lastBalanceRefreshAt: new Date() });
            rep.currentBalance = cad.amount;
          }
        } catch (_) {}

        res.json({ rep, logs, shopifyTransactions });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    // Get rep detail with live balance + history
    app.get("/api/mapi/reps/:id", isAuthenticated, isAdmin, async (req, res) => {
      try {
        const rep = await storage.getMapiRep(String(req.params.id));
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });

        const [logs, shopifyTransactions] = await Promise.all([
          storage.getMapiRepCreditLogs(rep.id),
          getRepTransactionHistory(rep.shopifyCustomerGid).catch(() => []),
        ]);

        // Refresh balance from Shopify
        try {
          const balances = await getRepBalance(rep.shopifyCustomerGid);
          const cad = balances.find((b) => b.currencyCode === "CAD") ?? balances[0];
          if (cad) {
            await storage.updateMapiRep(rep.id, {
              currentBalance: cad.amount,
              lastBalanceRefreshAt: new Date(),
            });
            rep.currentBalance = cad.amount;
          }
        } catch (_) {}

        res.json({ rep, logs, shopifyTransactions });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    // Credit a rep
    app.post("/api/mapi/reps/:id/credit", isAuthenticated, isAdmin, async (req: any, res) => {
      return res.status(410).json({ message: "Les crédits reps se gèrent dans Shopify. Système D est en lecture et synchronisation uniquement." });
      /* Flux historique désactivé.
      try {
        const { amount, currency = "CAD", reason } = req.body;
        if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: "Montant invalide" });

        const rep = await storage.getMapiRep(req.params.id);
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });

        const result = await creditRep({
          shopifyCustomerId: rep.shopifyCustomerGid,
          amount: parseFloat(amount).toFixed(2),
          currencyCode: currency,
        });

        const updatedRep = await storage.updateMapiRep(rep.id, {
          currentBalance: result.newBalance.amount,
          lastBalanceRefreshAt: new Date(),
        });

        await storage.createMapiRepCreditLog({
          repId: rep.id,
          shopifyCustomerGid: rep.shopifyCustomerGid,
          action: "credit",
          amount: parseFloat(amount).toFixed(2),
          currency,
          reason: reason ?? null,
          performedByUserId: req.user?.id ?? null,
          shopifyTransactionId: result.transactionId,
        });

        await storage.createActivityLog({
          type: "shopify_credit_add",
          status: "success",
          message: `Crédit Shopify ajouté au rep ${rep.email}: ${parseFloat(amount).toFixed(2)} ${currency}`,
        });

        res.json({ rep: updatedRep });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
      */
    });

    // Debit a rep
    app.post("/api/mapi/reps/:id/debit", isAuthenticated, isAdmin, async (req: any, res) => {
      return res.status(410).json({ message: "Les ajustements de crédit reps se gèrent dans Shopify." });
      /* Flux historique désactivé.
      try {
        const { amount, currency = "CAD", reason } = req.body;
        if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: "Montant invalide" });

        const rep = await storage.getMapiRep(req.params.id);
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });

        const result = await debitRep({
          shopifyCustomerId: rep.shopifyCustomerGid,
          amount: parseFloat(amount).toFixed(2),
          currencyCode: currency,
        });

        const updatedRep = await storage.updateMapiRep(rep.id, {
          currentBalance: result.newBalance.amount,
          lastBalanceRefreshAt: new Date(),
        });

        await storage.createMapiRepCreditLog({
          repId: rep.id,
          shopifyCustomerGid: rep.shopifyCustomerGid,
          action: "debit",
          amount: parseFloat(amount).toFixed(2),
          currency,
          reason: reason ?? null,
          performedByUserId: req.user?.id ?? null,
          shopifyTransactionId: result.transactionId,
        });

        await storage.createActivityLog({
          type: "shopify_credit_debit",
          status: "success",
          message: `Crédit Shopify débité pour le rep ${rep.email}: ${parseFloat(amount).toFixed(2)} ${currency}`,
        });

        res.json({ rep: updatedRep });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
      */
    });

    // Monthly renewal for a single rep (RESET: debit to zero, then credit budget)
    app.post("/api/mapi/reps/:id/monthly-renewal", isAuthenticated, isAdmin, async (req: any, res) => {
      return res.status(410).json({ message: "Les renouvellements de crédit reps se gèrent dans Shopify." });
      /* Flux historique désactivé.
      try {
        const rep = await storage.getMapiRep(req.params.id);
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });
        if (!rep.monthlyBudgetAmount || parseFloat(rep.monthlyBudgetAmount) <= 0) {
          return res.status(400).json({ message: "Aucun budget mensuel configuré pour ce rep" });
        }

        const result = await renewRepBudget({
          shopifyCustomerId: rep.shopifyCustomerGid,
          monthlyBudgetAmount: rep.monthlyBudgetAmount,
          currencyCode: rep.monthlyBudgetCurrency ?? "CAD",
        });

        const updatedRep = await storage.updateMapiRep(rep.id, {
          currentBalance: result.newBalance.amount,
          lastBalanceRefreshAt: new Date(),
        });

        await storage.createMapiRepCreditLog({
          repId: rep.id,
          shopifyCustomerGid: rep.shopifyCustomerGid,
          action: "monthly_renewal",
          amount: rep.monthlyBudgetAmount,
          currency: rep.monthlyBudgetCurrency ?? "CAD",
          reason: "Renouvellement mensuel",
          performedByUserId: req.user?.id ?? null,
        });

        res.json({ rep: updatedRep });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
      */
    });

    // Update monthly budget
    app.post("/api/mapi/reps/:id/budget", isAuthenticated, isAdmin, async (req, res) => {
      return res.status(410).json({ message: "Les budgets de crédit reps se gèrent dans Shopify." });
      /* Flux historique désactivé.
      try {
        const { monthlyBudgetAmount } = req.body;
        const rep = await storage.getMapiRep(String(req.params.id));
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });

        const updatedRep = await storage.updateMapiRep(rep.id, {
          monthlyBudgetAmount: monthlyBudgetAmount ? parseFloat(monthlyBudgetAmount).toFixed(2) : null,
        });
        res.json({ rep: updatedRep });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
      */
    });

    // ─── SystemD Products & Checkout ────────────────────────────────────────

  const isOperationalCatalogItem = (item: { name: string; sku: string | null; productType: string | null }) =>
    item.productType === "service" && /^(ENT|LIV|TRI|INS|BTP|F\d+)-/i.test(item.sku || item.name);

  // ── Boutique SystemD — lit depuis zoho_catalog (aucun appel Zoho) ─────────────
  // Filtre strict : assignment_state = systemd, status = active, is_deleted = false.
  // Les produits client et unresolved ne sont JAMAIS exposés ici.
  app.get("/api/portal/systemd-products", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });

      // Lecture depuis le cache local — ZÉRO appel vers l'API Zoho
      const [catalogItems, reservedQuantities] = await Promise.all([
        storage.getZohoCatalogByAssignmentState("systemd"),
        storage.getReservedSystemdStockQuantities(),
      ]);
      const systemdItems = catalogItems
        .filter((item) => item.status === "active" && !isOperationalCatalogItem(item)) // is_deleted déjà filtré
        .map((item) => ({
          zohoItemId:  item.zohoItemId,
          name:        item.name,
          sku:         item.sku ?? null,
          description: item.description ?? null,
          imageUrl:    item.imageName ? `/api/zoho/item-image/${item.zohoItemId}` : null,
          price:       item.price != null ? Number(item.price) : 0,
          stock:       Math.max(0, (item.stock != null ? Math.round(Number(item.stock)) : 0) - (reservedQuantities[item.zohoItemId] ?? 0)),
          zohoStock:   item.stock != null ? Math.round(Number(item.stock)) : 0,
          reserved:    reservedQuantities[item.zohoItemId] ?? 0,
        }));

      res.json(systemdItems);
    } catch (error: any) {
      console.error("Error fetching SystemD products:", error);
      res.status(500).json({ message: error.message || "Failed to fetch SystemD products" });
    }
  });

  // ── Résolution d'un produit Système D (source swappable) ──────────────────
  // Pour basculer vers zoho_catalog : remplacer uniquement resolveSystemdProductDetail().
  // L'endpoint HTTP lui-même ne change pas.
  type SystemdResolveStatus = "ok" | "not_found" | "client_product" | "unverifiable" | "rate_limited";

  interface SystemdProductDetail {
    zohoItemId: string;
    name: string;
    sku: string | null;
    description: string | null;
    imageUrl: string | null;
    price: number;
    stock: number;
  }

  type SystemdResolveResult =
    | { status: "ok"; product: SystemdProductDetail }
    | { status: Exclude<SystemdResolveStatus, "ok"> };

  // ── Résolution d'un produit SystemD — lit depuis zoho_catalog (aucun appel Zoho) ──
  // assignment_state = 'systemd'    → ok (vérifié lors du full-sync per-item)
  // assignment_state = 'client'     → 403 client_product
  // assignment_state = 'unresolved' → 503 unverifiable (jamais exposé au client)
  // introuvable / soft-deleted      → 404 not_found
  const resolveSystemdProductDetail = async (zohoItemId: string): Promise<SystemdResolveResult> => {
    const [item, reservedQuantities] = await Promise.all([
      storage.getZohoCatalogItem(zohoItemId),
      storage.getReservedSystemdStockQuantities(),
    ]); // exclut is_deleted=true
    if (!item) return { status: "not_found" };

    switch (item.assignmentState) {
      case "systemd":
        if (item.status !== "active" || isOperationalCatalogItem(item)) return { status: "not_found" };
        return {
          status: "ok",
          product: {
            zohoItemId:  item.zohoItemId,
            name:        item.name,
            sku:         item.sku ?? null,
            description: item.description ?? null,
            imageUrl:    item.imageName ? `/api/zoho/item-image/${item.zohoItemId}` : null,
            price:       item.price != null ? Number(item.price) : 0,
            stock:       Math.max(0, (item.stock != null ? Math.round(Number(item.stock)) : 0) - (reservedQuantities[item.zohoItemId] ?? 0)),
          },
        };
      case "client":
        return { status: "client_product" };
      case "unresolved":
      default:
        return { status: "unverifiable" };
    }
  };

  app.get("/api/portal/systemd-products/:zohoItemId", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Non autorisé" });

      const { zohoItemId } = req.params;
      if (!zohoItemId || typeof zohoItemId !== "string") {
        return res.status(400).json({ message: "Identifiant produit manquant" });
      }

      const result = await resolveSystemdProductDetail(zohoItemId);

      switch (result.status) {
        case "ok":
          return res.json(result.product);
        case "not_found":
          return res.status(404).json({
            message: "Produit introuvable dans l'inventaire Zoho",
            code: "NOT_FOUND",
          });
        case "client_product":
          return res.status(403).json({
            message: "Ce produit appartient à un client et n'est pas disponible dans le catalogue Système D",
            code: "CLIENT_PRODUCT",
          });
        case "rate_limited":
          return res.status(429).json({
            message: "Limite d'appels Zoho atteinte pour aujourd'hui. Ce produit sera accessible à nouveau demain.",
            code: "ZOHO_RATE_LIMITED",
          });
        case "unverifiable":
          return res.status(503).json({
            message: "Impossible de vérifier ce produit pour le moment. Réessayez dans quelques instants.",
            code: "UNVERIFIABLE",
          });
      }
    } catch (error: any) {
      console.error("Error fetching SystemD product detail:", error);
      if (error.message?.includes("429")) {
        return res.status(429).json({
          message: "Limite d'appels Zoho atteinte pour aujourd'hui.",
          code: "ZOHO_RATE_LIMITED",
        });
      }
      res.status(500).json({ message: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/portal/systemd-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.status(403).json({ message: "Non autorisé" });
      }

      const { items } = req.body as {
        items: { zohoItemId: string; quantity: number }[];
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Le panier est vide" });
      }
      if (items.some((i) => !i.zohoItemId || !Number.isInteger(i.quantity) || i.quantity < 1)) {
        return res.status(400).json({ message: "Articles du panier invalides" });
      }
      const integration = await getMapiIntegration();
      if (!integration?.isActive || !integration.accessToken || integration.connectionStatus === "invalid_token") {
        await storage.createActivityLog({
          type: "shopify_token_invalid",
          status: "error",
          message: "Checkout crédit refusé: connexion Shopify Mapei requise",
        }).catch(() => {});
        return res.status(503).json({ message: "Connexion Shopify requise." });
      }
      if (!await roleCanAccessMapi(role, integration)) {
        return res.status(403).json({ message: "Ce compte n'est pas autorisé à utiliser le crédit Mapei." });
      }

      const authenticatedEmail = await getAuthenticatedEmail(req);
      if (!authenticatedEmail) {
        return res.status(400).json({
          message: "Aucun compte crédit Shopify n’est associé à votre utilisateur. Veuillez contacter l’administration.",
        });
      }

      let shopifyCustomer: Awaited<ReturnType<typeof findMapiRepByEmail>>;
      try {
        shopifyCustomer = await findMapiRepByEmail(authenticatedEmail);
      } catch (error: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(error, "shopify_credit_error"),
          status: "error",
          message: `Checkout crédit: recherche du compte Shopify par email échouée (${error.message})`,
        }).catch(() => {});
        return res.status(error.message?.includes("401") ? 503 : 400).json({
          message: error.message?.includes("401") ? "Connexion Shopify requise." : "Crédit Shopify indisponible.",
        });
      }
      if (!shopifyCustomer) {
        await storage.createActivityLog({
          type: "shopify_credit_account_missing",
          status: "error",
          message: `Checkout crédit refusé: aucun rep Shopify ne correspond à l’utilisateur ${authenticatedEmail}`,
        }).catch(() => {});
        return res.status(400).json({
          message: "Aucun compte crédit Shopify n’est associé à votre utilisateur. Veuillez contacter l’administration.",
        });
      }
      const shopifyCustomerGid = shopifyCustomer.shopifyCustomerId;
      const shopifyCustomerId = shopifyCustomerGid.split("/").pop()!;

      // Résolution depuis zoho_catalog — ZÉRO appel vers l'API Zoho.
      const resolvedItems: { zohoItemId: string; name: string; sku: string | null; quantity: number; unitPrice: number }[] = [];
      for (const cartItem of items) {
        const catalogItem = await storage.getZohoCatalogItem(cartItem.zohoItemId);
        if (!catalogItem) {
          return res.status(400).json({ message: `Produit introuvable dans le catalogue : ${cartItem.zohoItemId}` });
        }
        if (catalogItem.assignmentState !== "systemd") {
          return res.status(403).json({ message: `Ce produit n'est pas disponible dans la boutique SystemD : ${cartItem.zohoItemId}` });
        }
        if (isOperationalCatalogItem(catalogItem)) {
          return res.status(403).json({ message: `Ce service opérationnel n'est pas achetable : ${cartItem.zohoItemId}` });
        }
        if (catalogItem.status !== "active") {
          return res.status(400).json({ message: `Produit non disponible : ${catalogItem.name}` });
        }
        resolvedItems.push({
          zohoItemId: cartItem.zohoItemId,
          name:       catalogItem.name,
          sku:        catalogItem.sku ?? null,
          quantity:   cartItem.quantity,
          unitPrice:  Number(catalogItem.price ?? 0),
        });
      }

      const contactId = role.contactId;
      const totalAmountCents = resolvedItems.reduce(
        (sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity, 0
      );
      const totalAmount = (totalAmountCents / 100).toFixed(2);

      // ── Idempotence : clé d'intention ────────────────────────────────────────
      // SHA256(contactId | items triés par zohoItemId | total en centimes)
      // Fenêtre : 10 minutes. Si une commande pending identique existe, on réutilise son URL.
      const intentPayload = [
        String(contactId),
        resolvedItems
          .slice()
          .sort((a, b) => a.zohoItemId.localeCompare(b.zohoItemId))
          .map((i) => `${i.zohoItemId}:${i.quantity}`)
          .join(","),
        String(totalAmountCents),
        shopifyCustomerGid,
      ].join("|");
      const intentKey = createHash("sha256").update(intentPayload).digest("hex").slice(0, 64);

      // Protection atomique : une intention identique ne peut créer qu'une seule
      // commande active (pending ou paid) pendant la fenêtre d'idempotence.
      const previousOrder = await storage.getSystemdOrderByIntentKey(intentKey, 10);
      const host = `${req.protocol}://${req.get("host")}`;
      if (previousOrder?.status === "paid") {
        await storage.reserveSystemdOrderStock(previousOrder.id).catch(async () => {
          await storage.updateSystemdOrder(previousOrder.id, {
            stockReservationStatus: "stock_to_reserve",
            fulfillmentStatus: "stock_to_reserve",
          }).catch(() => {});
          return { status: "stock_to_reserve" as const };
        });
        return res.json({
          url: `${host}/portal/boutique?tab=orders&payment=success&orderId=${previousOrder.id}`,
          orderId: previousOrder.id,
          reused: true,
        });
      }
      if (previousOrder?.status === "pending") {
        // Auto-cancel if the pending order is older than 90 seconds (stuck/failed)
        const pendingAge = previousOrder.createdAt
          ? Date.now() - new Date(previousOrder.createdAt as unknown as string).getTime()
          : 999999;
        if (pendingAge < 90_000) {
          return res.status(409).json({ message: "Paiement crédit déjà en cours. Réessayez dans quelques instants." });
        }
        // Stale pending order — cancel and proceed
        await storage.updateSystemdOrder(previousOrder.id, { status: "cancelled" }).catch(() => {});
      }

      const reservedQuantities = await storage.getReservedSystemdStockQuantities();
      for (const item of resolvedItems) {
        const catalogItem = await storage.getZohoCatalogItem(item.zohoItemId);
        const availableStock = Math.max(0, Math.round(Number(catalogItem?.stock ?? 0)) - (reservedQuantities[item.zohoItemId] ?? 0));
        if (item.quantity > availableStock) {
          return res.status(400).json({ message: `Stock disponible insuffisant pour : ${item.name}` });
        }
      }

      let balances: Awaited<ReturnType<typeof getRepBalance>>;
      try {
        balances = await getRepBalance(shopifyCustomerGid);
      } catch (error: any) {
        await storage.createActivityLog({
          type: creditErrorActivityType(error, "shopify_credit_error"),
          status: "error",
          message: `Lecture crédit checkout échouée: ${error.message}`,
        }).catch(() => {});
        return res.status(503).json({ message: error.message || "Crédit Shopify indisponible." });
      }
      const cadBalance = balances.find((balance) => balance.currencyCode === "CAD");
      const availableCredit = Number(cadBalance?.amount ?? 0);
      if (!isShopifyCreditSufficient(availableCredit, totalAmount)) {
        await storage.createActivityLog({
          type: "shopify_credit_insufficient",
          status: "error",
          message: `Checkout crédit refusé pour ${shopifyCustomer.email || shopifyCustomerGid}: solde insuffisant`,
        }).catch(() => {});
        return res.status(400).json({ message: "Crédit insuffisant." });
      }

      const { order, created } = await storage.tryInsertSystemdOrder({
        contactId,
        stripeCheckoutSessionId: null,
        stripeCheckoutUrl: null,
        checkoutIntentKey: intentKey,
        paymentMethod: "shopify_credit",
        shopifyCustomerGid,
        amount: totalAmountCents,
        currency: "cad",
        status: "pending",
        fulfillmentStatus: "to_process",
        stockReservationStatus: "pending",
        lineItems: resolvedItems as any,
      });
      if (!created) {
        return res.status(409).json({ message: "Paiement crédit déjà en cours. Réessayez dans quelques instants." });
      }

      let debitResult: Awaited<ReturnType<typeof debitRep>> | null = null;
      try {
        debitResult = await debitRep({
          shopifyCustomerId: shopifyCustomerGid,
          amount: totalAmount,
          currencyCode: "CAD",
        });
        const paidOrder = await storage.updateSystemdOrder(order.id, {
          status: "paid",
          shopifyCreditAccountId: debitResult.accountId,
          shopifyCreditTransactionId: debitResult.transactionId,
        });
        if (!paidOrder) throw new Error("Impossible d'enregistrer la commande payée.");
      } catch (error: any) {
        if (debitResult) {
          await creditRep({
            shopifyCustomerId: shopifyCustomerGid,
            amount: totalAmount,
            currencyCode: "CAD",
          }).catch(async (compensationError: any) => {
            await storage.createActivityLog({
              type: "shopify_credit_compensation_error",
              status: "error",
              message: `ÉCHEC compensation crédit commande #${order.id}: ${compensationError.message}`,
            }).catch(() => {});
          });
        }
        await storage.updateSystemdOrder(order.id, { status: "cancelled" }).catch(() => {});
        await storage.createActivityLog({
          type: creditErrorActivityType(error, "shopify_credit_checkout_error"),
          status: "error",
          message: `Checkout crédit commande #${order.id} échoué: ${error.message}`,
        }).catch(() => {});
        return res.status(creditErrorStatus(error.message)).json({
          message: error.message || "Crédit Shopify indisponible.",
        });
      }

      if (!debitResult) {
        await storage.updateSystemdOrder(order.id, { status: "cancelled" }).catch(() => {});
        return res.status(503).json({ message: "Crédit Shopify indisponible." });
      }

      const existingRep = await storage.getMapiRepByGid(shopifyCustomerGid);
      const rep = existingRep ?? await storage.createMapiRep({
        shopifyCustomerGid,
        email: shopifyCustomer.email || `customer-${shopifyCustomerId}@placeholder.local`,
        firstName: shopifyCustomer.firstName ?? null,
        lastName: shopifyCustomer.lastName ?? null,
        status: "active",
        currentBalance: debitResult.newBalance.amount,
        currentBalanceCurrency: debitResult.newBalance.currencyCode,
      });
      await storage.updateMapiRep(rep.id, {
        currentBalance: debitResult.newBalance.amount,
        currentBalanceCurrency: debitResult.newBalance.currencyCode,
        lastBalanceRefreshAt: new Date(),
      }).catch(() => {});
      const reservation = await storage.reserveSystemdOrderStock(order.id).catch(async (error: any) => {
        await storage.updateSystemdOrder(order.id, {
          stockReservationStatus: "stock_to_reserve",
          fulfillmentStatus: "stock_to_reserve",
        }).catch(() => {});
        return { status: "stock_to_reserve" as const, message: error.message || "Réservation locale indisponible." };
      });
      await storage.createActivityLog({
        type: reservation.status === "stock_to_reserve" ? "systemd_stock_to_reserve" : "systemd_stock_reserved",
        status: reservation.status === "stock_to_reserve" ? "error" : "success",
        message: reservation.status === "stock_to_reserve"
          ? `Commande #${order.id} payée — stock à réserver manuellement. ${reservation.message ?? ""}`.trim()
          : `Stock local réservé pour la commande #${order.id}`,
      }).catch(() => {});
      await storage.createMapiRepCreditLog({
        repId: rep.id,
        shopifyCustomerGid,
        action: "checkout_debit",
        amount: totalAmount,
        currency: "CAD",
        reason: `Commande Système D #${order.id}`,
        performedByUserId: req.user?.claims?.sub ?? null,
        shopifyTransactionId: debitResult.transactionId,
      }).catch(() => {});
      await storage.createActivityLog({
        type: "shopify_credit_checkout",
        status: "success",
        message: `Crédit déduit avec succès pour la commande #${order.id}: ${totalAmount} CAD — rep ${shopifyCustomer.email || shopifyCustomerGid}`,
      }).catch(() => {});

      const repName = [shopifyCustomer.firstName, shopifyCustomer.lastName].filter(Boolean).join(" ") || shopifyCustomer.email || `Rep #${shopifyCustomerId}`;
      const contact = await storage.getContact(contactId);
      await storage.createNotification({
        contactId,
        category: "commande",
        type: "systemd_order_admin_action",
        title: `Nouvelle commande Système D #${order.id} à traiter`,
        message: `${contact?.name ?? contact?.companyName ?? `Contact #${contactId}`} a passé une commande de ${totalAmount} CAD avec le crédit de ${repName}.`,
        metadata: { adminOnly: true, systemdOrderId: order.id, tab: "orders", repName, amount: totalAmount },
      }).catch((error) => console.error("SystemD admin notification error:", error));
      if (await storage.isNotificationEnabled(contactId, "commande")) {
        await storage.createNotification({
          contactId,
          category: "commande",
          type: "systemd_order_paid",
          title: `Commande Système D #${order.id} confirmée`,
          message: `Le crédit de ${repName} a été débité. Votre commande est maintenant à traiter.`,
          metadata: { systemdOrderId: order.id, tab: "orders", repName, amount: totalAmount },
        }).catch((error) => console.error("SystemD order notification error:", error));
      }
      if (contact?.email) {
        sendSystemdOrderConfirmationEmail({
          email: contact.email,
          name: contact.name,
          orderId: order.id,
          amount: `${totalAmount} CAD`,
          repName,
        }).catch((error) => console.error("SystemD order email error:", error));
      }
      const settings = await storage.getAdminSettings();
      if (settings?.adminUserId) {
        const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, settings.adminUserId));
        if (adminUser?.email) {
          sendSystemdOrderAdminEmail({
            email: adminUser.email,
            orderId: order.id,
            clientName: contact?.name ?? contact?.companyName ?? `Contact #${contactId}`,
            amount: `${totalAmount} CAD`,
            repName,
            repEmail: shopifyCustomer.email || "Email indisponible",
            items: resolvedItems.map((item) => ({ name: item.name, quantity: item.quantity })),
            stockStatus: reservation.status === "stock_to_reserve" ? "À vérifier / réserver manuellement" : "Réservé localement",
          }).catch((error) => console.error("SystemD admin order email error:", error));
        }
      }

      return res.json({
        url: `${host}/portal/boutique?tab=orders&payment=success&orderId=${order.id}`,
        orderId: order.id,
        message: "Commande confirmée. Le crédit associé à votre utilisateur a été débité. Vous pouvez suivre cette commande dans Mes commandes.",
      });
    } catch (error: any) {
      // Log technique conservé côté serveur uniquement
      console.error("Erreur création session checkout SystemD :", error);
      res.status(500).json({
        message: "Paiement temporairement indisponible. Veuillez réessayer plus tard ou contacter Système D.",
      });
    }
  });

  app.get("/api/admin/systemd-orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allOrders = await storage.getSystemdOrders();
      const allContacts = await storage.getContacts();
      const contactMap = new Map(allContacts.map((c) => [c.id, c]));
      const enriched = await Promise.all(allOrders.map(async (order) => {
        const contact = contactMap.get(order.contactId);
        const rep = order.shopifyCustomerGid ? await storage.getMapiRepByGid(order.shopifyCustomerGid) : undefined;
        return {
          ...order,
          contactName: contact?.name ?? null,
          companyName: contact?.companyName ?? null,
          repName: rep ? ([rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email) : null,
          repEmail: rep?.email ?? null,
        };
      }));
      res.json(enriched);
    } catch (error: any) {
      console.error("Error fetching SystemD orders:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/systemd-orders/:id/fulfillment", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const orderId = Number(req.params.id);
      const fulfillmentStatus = String(req.body?.fulfillmentStatus ?? "");
      if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: "Commande invalide" });
      if (!(["processing", "completed"] as const).includes(fulfillmentStatus as "processing" | "completed")) {
        return res.status(400).json({ message: "Statut de traitement invalide" });
      }

      const order = (await storage.getSystemdOrders()).find((candidate) => candidate.id === orderId);
      if (!order) return res.status(404).json({ message: "Commande Système D introuvable" });
      if (order.status !== "paid") return res.status(409).json({ message: "Seule une commande payée peut être traitée" });
      const allowedNext = order.fulfillmentStatus === "to_process" || order.fulfillmentStatus === "stock_to_reserve"
        ? "processing"
        : order.fulfillmentStatus === "processing" ? "completed" : null;
      if (fulfillmentStatus !== allowedNext) {
        return res.status(409).json({ message: "Transition de traitement invalide" });
      }

      const updated = await storage.updateSystemdOrder(orderId, { fulfillmentStatus });
      await storage.createActivityLog({
        type: "systemd_order_fulfillment",
        status: "success",
        message: `Commande Système D #${orderId}: ${order.fulfillmentStatus} → ${fulfillmentStatus}`,
        metadata: JSON.stringify({ orderId, from: order.fulfillmentStatus, to: fulfillmentStatus, userId: req.user?.id ?? null }),
      });
      if (await storage.isNotificationEnabled(order.contactId, "commande")) {
        await storage.createNotification({
          contactId: order.contactId,
          category: "commande",
          type: fulfillmentStatus === "completed" ? "systemd_order_completed" : "systemd_order_processing",
          title: fulfillmentStatus === "completed" ? `Commande Système D #${orderId} traitée` : `Commande Système D #${orderId} en cours de traitement`,
          message: fulfillmentStatus === "completed" ? "Votre commande a été traitée par notre équipe." : "Notre équipe a commencé le traitement de votre commande.",
          metadata: { systemdOrderId: orderId, tab: "orders" },
        }).catch((error) => console.error("SystemD fulfillment notification error:", error));
      }
      return res.json(updated);
    } catch (error: any) {
      console.error("Error updating SystemD fulfillment:", error);
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/portal/systemd-orders", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role) return res.status(401).json({ message: "Unauthorized" });
      const orders = role.role === "client" && role.contactId
        ? await storage.getSystemdOrdersByContactIds(await getProductContactIds(role.contactId))
        : await storage.getSystemdOrders();
      const enriched = await Promise.all(orders.map(async (order) => {
        const rep = order.shopifyCustomerGid ? await storage.getMapiRepByGid(order.shopifyCustomerGid) : undefined;
        return {
          ...order,
          repName: rep ? ([rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email) : null,
          repEmail: rep?.email ?? null,
        };
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

    // Deactivate a rep
    app.post("/api/mapi/reps/:id/deactivate", isAuthenticated, isAdmin, async (req: any, res) => {
      try {
        const rep = await storage.getMapiRep(req.params.id);
        if (!rep) return res.status(404).json({ message: "Rep introuvable" });
        if (rep.status === "archived") return res.status(400).json({ message: "Rep déjà archivé" });

        const currentBalance = parseFloat(rep.currentBalance ?? "0");

        await deactivateRepInShopify(rep.shopifyCustomerGid);

        if (currentBalance > 0.005) {
          await storage.createMapiRepCreditLog({
            repId: rep.id,
            shopifyCustomerGid: rep.shopifyCustomerGid,
            action: "deactivate",
            amount: currentBalance.toFixed(2),
            currency: rep.currentBalanceCurrency ?? "CAD",
            reason: "Désactivation — solde final débité",
            performedByUserId: req.user?.id ?? null,
          });
        }

        const updatedRep = await storage.updateMapiRep(rep.id, {
          status: "archived",
          currentBalance: "0.00",
          lastBalanceRefreshAt: new Date(),
        });

        res.json({ rep: updatedRep });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    });
  }

  // Rattrapage des commandes payées créées avant l'alerte Admin dédiée.
  // La clé systemdOrderId rend cette opération idempotente à chaque redémarrage.
  try {
    const [orders, notifications] = await Promise.all([
      storage.getSystemdOrders(),
      storage.getAllNotifications(),
    ]);
    const notifiedOrderIds = new Set(
      notifications
        .filter((notification) => notification.type === "systemd_order_admin_action")
        .map((notification) => Number((notification.metadata as any)?.systemdOrderId))
        .filter(Number.isFinite),
    );
    for (const order of orders) {
      if (order.status !== "paid" || order.fulfillmentStatus === "completed" || notifiedOrderIds.has(order.id)) continue;
      const contact = await storage.getContact(order.contactId);
      const rep = order.shopifyCustomerGid ? await storage.getMapiRepByGid(order.shopifyCustomerGid) : undefined;
      const repName = rep ? ([rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email) : "rep Shopify";
      await storage.createNotification({
        contactId: order.contactId,
        category: "commande",
        type: "systemd_order_admin_action",
        title: `Nouvelle commande Système D #${order.id} à traiter`,
        message: `${contact?.name ?? contact?.companyName ?? `Contact #${order.contactId}`} a une commande payée de ${(order.amount / 100).toFixed(2)} ${order.currency.toUpperCase()} à traiter (${repName}).`,
        metadata: { adminOnly: true, systemdOrderId: order.id, tab: "orders", backfilled: true },
      });
    }
  } catch (error) {
    console.error("SystemD admin notification backfill error:", error);
  }

  return httpServer;
}

// SYSTEMD_CACHE_TTL_MS supprimé — la boutique lit depuis zoho_catalog, aucun quota Zoho à protéger
