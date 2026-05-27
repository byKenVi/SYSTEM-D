import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { insertShopifyIntegrationSchema, insertAdminSettingsSchema } from "@shared/schema";
import { sendInviteEmail, sendFormSubmissionEmail, sendFormStatusEmail, sendFormAdminNotificationEmail } from "./resend";
import { db } from "./db";
import { users as usersTable } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { buildAuthUrl, exchangeCodeForTokens, fetchZohoOrganizations, getCallbackUrl } from "./zoho-auth";
import { syncZohoItemsForContact, testZohoConnection, pushItemToZoho, fetchZohoItemsMap, createFormSalesOrder, getZohoSOUrl, getZohoRegion } from "./zoho-api";
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
        if (!contactByEmail.userId) {
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
    } catch (error) {
      console.error("Error resending invite:", error);
      res.status(500).json({ message: "Failed to resend invite" });
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

  // All orders across all connected Shopify stores
  app.get("/api/admin/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allContacts = await storage.getContacts();
      const cachedOrders = await storage.getShopifyOrders();

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
      const active = integrations.filter((i) => i.isActive);
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

        if (product.pushedToZoho && product.zohoItemId) {
          updated.push(product);
          continue;
        }

        if (isZohoConnected) {
          try {
            const { item_id } = await pushItemToZoho({
              name: product.name,
              sku: product.sku,
              description: product.description,
              rate: product.price ? Number(product.price) : undefined,
              opening_stock: product.inventoryQuantity,
              imageUrl: product.imageUrl,
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
      res.json(integrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post("/api/shopify-integrations/connect", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { contactId, storeUrl, accessToken } = req.body;
      if (!contactId || !storeUrl || !accessToken) {
        return res.status(400).json({ message: "contactId, storeUrl, and accessToken are required" });
      }

      if (!validateShopifyStoreUrl(storeUrl)) {
        return res.status(400).json({ message: "Store URL must be a valid *.myshopify.com domain (e.g. mystore.myshopify.com)" });
      }

      const test = await testShopifyConnection(storeUrl, accessToken);
      if (!test.success) {
        return res.status(400).json({ message: `Could not connect to Shopify store: ${test.error || "invalid token or store URL"}` });
      }

      await storage.createShopifyIntegration({
        contactId: Number(contactId),
        accessToken,
        storeUrl,
        shopName: test.shopName || storeUrl,
        scope: null,
        isActive: true,
      });

      await storage.updateContact(Number(contactId), { shopifyConnected: true });

      res.json({ success: true, shopName: test.shopName });
    } catch (error: any) {
      console.error("Error connecting Shopify store:", error);
      res.status(500).json({ message: error.message || "Failed to connect Shopify store" });
    }
  });

  app.delete("/api/shopify-integrations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteShopifyIntegration(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting integration:", error);
      res.status(500).json({ message: "Failed to delete integration" });
    }
  });

  app.post("/api/shopify-integrations/:id/import", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integration = await storage.getShopifyIntegration(Number(req.params.id));
      if (!integration) return res.status(404).json({ message: "Integration not found" });

      const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.accessToken);
      const normalized = normalizeProducts(shopifyProducts);

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
      const existing = await storage.getAdminSettings();
      await storage.upsertAdminSettings({
        ...(existing || {}),
        zohoInventoryRefreshToken: null,
        zohoInventoryOrgId: null,
        zohoInventoryOrgName: null,
        zohoAccessToken: null,
        zohoTokenExpiresAt: null,
        zohoRegion: "us",
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
  app.get("/api/zoho/inventory", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { fetchZohoItems } = await import("./zoho-api");
      const zohoItems = await fetchZohoItems();
      const allContacts = await storage.getContacts();

      // Build a lookup map by company name / name (lowercase for fuzzy match)
      const contactByCompany = new Map<string, typeof allContacts[number]>();
      const contactByName = new Map<string, typeof allContacts[number]>();
      for (const c of allContacts) {
        if (c.companyName) contactByCompany.set(c.companyName.toLowerCase().trim(), c);
        contactByName.set(c.name.toLowerCase().trim(), c);
      }

      // Build a lookup map of local products by zohoItemId
      const allLocalProducts = await storage.getProducts();
      const localProductByZohoId = new Map<string, number>();
      for (const p of allLocalProducts) {
        if (p.zohoItemId) localProductByZohoId.set(p.zohoItemId, p.id);
      }

      const enriched = zohoItems.map((item: any) => {
        // Read the cf_client custom field value
        let cfClient: string | null = null;
        if (Array.isArray(item.custom_fields)) {
          const cf = item.custom_fields.find((f: any) => f.api_name === "cf_client" || f.label?.toLowerCase() === "client");
          if (cf) cfClient = cf.value ?? null;
        }
        // Try to match to a contact
        let contact: typeof allContacts[number] | undefined;
        if (cfClient) {
          const key = cfClient.toLowerCase().trim();
          contact = contactByCompany.get(key) || contactByName.get(key);
        }

        return {
          zohoItemId: item.item_id,
          localProductId: localProductByZohoId.get(item.item_id) ?? null,
          name: item.name,
          sku: item.sku || null,
          description: item.description || null,
          imageUrl: item.image_document_id ? null : null,
          price: item.rate != null ? String(item.rate) : null,
          inventoryQuantity: item.stock_on_hand != null ? Math.round(item.stock_on_hand) : 0,
          cfClient,
          contactId: contact?.id ?? null,
          contactName: contact ? (contact.companyName || contact.name) : null,
          status: item.status,
          unit: item.unit || null,
          productType: item.product_type || null,
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
      const { item_id } = await pushItemToZoho({
        name: product.name,
        sku: product.sku,
        description: product.description,
        rate: product.price ? Number(product.price) : undefined,
        opening_stock: product.inventoryQuantity,
        imageUrl: product.imageUrl,
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
      const products = await storage.getProductsByContactId(contactId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching view-as products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
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
      const orders = await storage.getShopifyOrders({ contactId });
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
      const products = await storage.getProductsByContactId(role.contactId);
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
      if (!product || product.contactId !== role.contactId) {
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
      if (!product || product.contactId !== contactId) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching view-as product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.get("/api/portal/orders", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json({ orders: [] });
      }
      const orders = await storage.getShopifyOrders({ contactId: role.contactId });
      res.json({ orders });
    } catch (error) {
      console.error("Error fetching portal orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/portal/restock-requests", isAuthenticated, async (req: any, res) => {
    try {
      const role = await getUserRole(req);
      if (!role || role.role !== "client" || !role.contactId) {
        return res.json([]);
      }
      const requests = await storage.getRestockRequestsByContactId(role.contactId);
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

      // Verify product belongs to this client
      const product = await storage.getProduct(productId);
      if (!product || product.contactId !== role.contactId) {
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

  app.get("/api/activity-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const logs = await storage.getActivityLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
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

      const contact = await storage.getContact(form.contactId);
      const uploads = await storage.getFormUploadsBySubmission(form.id);

      const pdfBuffer = await generateFormPdf(form, contact, uploads);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${form.formNumber}.pdf"`);
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
      if (!role?.contactId) return res.status(403).json({ message: "Client contact not found" });
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
      res.json(notifs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/portal/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const role = await getUserRole(req);
      if (!role?.contactId) return res.json({ count: 0 });
      const count = await storage.getUnreadNotificationCount(role.contactId);
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

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationRead(Number(req.params.id));
      res.json({ ok: true });
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
      const enriched = notifs.map((n) => ({ ...n, contact: contactMap[n.contactId] || null }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  return httpServer;
}
