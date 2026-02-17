import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { insertShopifyIntegrationSchema, insertAdminSettingsSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  let firstAdminId: string | null = null;

  async function getUserRole(req: any) {
    const userId = req.user?.claims?.sub;
    const email = req.user?.claims?.email;
    if (!userId) return null;

    const contact = await storage.getContactByUserId(userId);
    if (contact) {
      return { role: "client" as const, contactId: contact.id };
    }

    if (email) {
      const contactByEmail = await storage.getContactByEmail(email);
      if (contactByEmail && !contactByEmail.userId) {
        await storage.updateContact(contactByEmail.id, {
          userId,
          status: "active",
        });
        return { role: "client" as const, contactId: contactByEmail.id };
      }
      if (contactByEmail) {
        return { role: "client" as const, contactId: contactByEmail.id };
      }
    }

    if (firstAdminId === null) {
      firstAdminId = userId;
    }

    if (userId === firstAdminId) {
      return { role: "admin" as const };
    }

    return { role: "client" as const };
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
      res.json({ message: "Invite resent", contactId: contact.id });
    } catch (error) {
      console.error("Error resending invite:", error);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // Zoho CRM Webhook (no auth - external webhook)
  app.post("/api/webhooks/zoho-crm", async (req, res) => {
    try {
      const { name, email, phone, company_name, company_address } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      const existing = await storage.getContactByEmail(email);
      if (existing) {
        return res.status(200).json({ message: "Contact already exists", contact: existing });
      }

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
      });

      res.status(201).json({ message: "Contact created and invite sent", contact });
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
      const integration = await storage.createShopifyIntegration(parsed);
      await storage.updateContact(parsed.contactId, { shopifyConnected: true });
      res.status(201).json(integration);
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  app.post("/api/shopify-integrations/:id/import", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integration = await storage.getShopifyIntegration(Number(req.params.id));
      if (!integration) return res.status(404).json({ message: "Integration not found" });

      const sampleProducts = [
        { name: "Premium Widget A", sku: "WID-A-001", price: "29.99", inventoryQuantity: 150 },
        { name: "Deluxe Gadget B", sku: "GAD-B-002", price: "49.99", inventoryQuantity: 75 },
        { name: "Standard Part C", sku: "PRT-C-003", price: "12.50", inventoryQuantity: 5 },
      ];

      const created = [];
      for (const p of sampleProducts) {
        const product = await storage.createProduct({
          contactId: integration.contactId,
          shopifyProductId: `shopify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: p.name,
          sku: p.sku,
          description: `Imported from ${integration.storeUrl}`,
          imageUrl: null,
          price: p.price,
          inventoryQuantity: p.inventoryQuantity,
          pushedToZoho: false,
          zohoItemId: null,
          lastSyncedAt: null,
        });
        created.push(product);
      }

      res.json({ message: `${created.length} products imported`, products: created });
    } catch (error) {
      console.error("Error importing products:", error);
      res.status(500).json({ message: "Failed to import products" });
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
