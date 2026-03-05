import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { insertShopifyIntegrationSchema, insertAdminSettingsSchema } from "@shared/schema";
import { sendInviteEmail } from "./resend";
import { buildAuthUrl, exchangeCodeForTokens, fetchZohoOrganizations, getCallbackUrl } from "./zoho-auth";
import { syncZohoItemsForContact, testZohoConnection, pushItemToZoho } from "./zoho-api";
import { fetchAllProducts, normalizeProducts, testShopifyConnection } from "./shopify-api";

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
    const email = req.user?.claims?.email;
    if (!userId) return null;

    const adminId = await getAdminUserId();
    if (!adminId) {
      await setAdminUserId(userId);
      return { role: "admin" as const };
    }

    if (userId === adminId) {
      return { role: "admin" as const };
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
      res.json({ message: "Access revoked", contact: updated });
    } catch (error) {
      console.error("Error revoking access:", error);
      res.status(500).json({ message: "Failed to revoke access" });
    }
  });

  app.delete("/api/contacts/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contact = await storage.getContact(Number(req.params.id));
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      await storage.deleteContact(contact.id);
      res.json({ message: "Contact deleted" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
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

  app.post("/api/products/push-to-zoho", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds)) return res.status(400).json({ message: "productIds must be an array" });

      const updated = [];
      for (const id of productIds) {
        const product = await storage.updateProduct(id, {
          pushedToZoho: true,
          zohoItemId: `ZOHO-${id}-${Date.now()}`,
          lastSyncedAt: new Date(),
        });
        if (product) updated.push(product);
      }

      res.json({ message: `${updated.length} products pushed to Zoho`, products: updated });
    } catch (error) {
      console.error("Error pushing to Zoho:", error);
      res.status(500).json({ message: "Failed to push products" });
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

  app.post("/api/shopify-integrations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = insertShopifyIntegrationSchema.parse(req.body);

      const connectionTest = await testShopifyConnection(parsed.storeUrl, parsed.apiKey);
      if (!connectionTest.success) {
        return res.status(400).json({
          message: `Failed to connect to Shopify store: ${connectionTest.error}`,
        });
      }

      const integration = await storage.createShopifyIntegration(parsed);
      await storage.updateContact(parsed.contactId, { shopifyConnected: true });
      res.status(201).json({ ...integration, shopName: connectionTest.shopName });
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(500).json({ message: "Failed to create integration" });
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

      const shopifyProducts = await fetchAllProducts(integration.storeUrl, integration.apiKey);
      const normalized = normalizeProducts(shopifyProducts);

      const existingProducts = await storage.getProductsByContactId(integration.contactId);
      const existingByVariant = new Map(
        existingProducts.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId, p])
      );

      let created = 0;
      let updated = 0;
      for (const p of normalized) {
        await storage.upsertProductByShopifyVariant(integration.contactId, p.shopifyVariantId, {
          contactId: integration.contactId,
          shopifyProductId: p.shopifyProductId,
          shopifyVariantId: p.shopifyVariantId,
          shopifyStoreUrl: integration.storeUrl,
          name: p.name,
          sku: p.sku,
          description: p.description,
          imageUrl: p.imageUrl,
          price: p.price,
          inventoryQuantity: p.inventoryQuantity,
          pushedToZoho: false,
          zohoItemId: null,
          lastSyncedAt: null,
        });

        if (existingByVariant.has(p.shopifyVariantId)) updated++;
        else created++;
      }

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

  // ====== ZOHO INVENTORY OAUTH ======

  // Step 1: Generate OAuth URL and redirect user
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
      });
      await storage.updateProduct(product.id, {
        zohoItemId: item_id,
        pushedToZoho: true,
        lastSyncedAt: new Date(),
      });
      res.json({ message: "Pushed to Zoho", zohoItemId: item_id });
    } catch (error: any) {
      console.error("Push to Zoho error:", error);
      res.status(500).json({ message: error.message || "Push failed" });
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

      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating restock request:", error);
      res.status(500).json({ message: "Failed to create restock request" });
    }
  });

  return httpServer;
}
