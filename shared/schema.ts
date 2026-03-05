export * from "./models/auth";

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  companyName: text("company_name"),
  companyAddress: text("company_address"),
  status: text("status").notNull().default("invited"),
  shopifyConnected: boolean("shopify_connected").notNull().default(false),
  zohoInventoryPushed: boolean("zoho_inventory_pushed").notNull().default(false),
  userId: varchar("user_id"),
  zohoCrmContactId: text("zoho_crm_contact_id"),
  zohoCrmAccountId: text("zoho_crm_account_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const shopifyIntegrations = pgTable("shopify_integrations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  accessToken: text("access_token").notNull(),
  storeUrl: text("store_url").notNull(),
  shopName: text("shop_name"),
  scope: text("scope"),
  syncFrequencyMinutes: integer("sync_frequency_minutes").notNull().default(0),
  lastAutoSyncAt: timestamp("last_auto_sync_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopifyIntegrationSchema = createInsertSchema(shopifyIntegrations).omit({ id: true, createdAt: true });
export type InsertShopifyIntegration = z.infer<typeof insertShopifyIntegrationSchema>;
export type ShopifyIntegration = typeof shopifyIntegrations.$inferSelect;

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  shopifyProductId: text("shopify_product_id"),
  shopifyVariantId: text("shopify_variant_id"),
  shopifyStoreUrl: text("shopify_store_url"),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  description: text("description"),
  imageUrl: text("image_url"),
  vendor: text("vendor"),
  productType: text("product_type"),
  tags: text("tags"),
  weight: decimal("weight", { precision: 10, scale: 2 }),
  weightUnit: text("weight_unit"),
  price: decimal("price", { precision: 10, scale: 2 }),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  inventoryQuantity: integer("inventory_quantity").notNull().default(0),
  zohoInventoryQuantity: integer("zoho_inventory_quantity"),
  shopifyStatus: text("shopify_status"),
  shopifyHandle: text("shopify_handle"),
  pushedToZoho: boolean("pushed_to_zoho").notNull().default(false),
  zohoItemId: text("zoho_item_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const restockRequests = pgTable("restock_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  productId: integer("product_id").notNull(),
  requestedQuantity: integer("requested_quantity").notNull(),
  status: text("status").notNull().default("Processing"),
  zohoSalesOrderId: text("zoho_sales_order_id"),
  zohoSalesOrderRef: text("zoho_sales_order_ref"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRestockRequestSchema = createInsertSchema(restockRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRestockRequest = z.infer<typeof insertRestockRequestSchema>;
export type RestockRequest = typeof restockRequests.$inferSelect;

export const adminSettings = pgTable("admin_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  adminUserId: varchar("admin_user_id"),
  shopifyAppClientId: text("shopify_app_client_id"),
  shopifyAppClientSecret: text("shopify_app_client_secret"),
  zohoInventoryClientId: text("zoho_inventory_client_id"),
  zohoInventoryClientSecret: text("zoho_inventory_client_secret"),
  zohoInventoryRefreshToken: text("zoho_inventory_refresh_token"),
  zohoInventoryOrgId: text("zoho_inventory_org_id"),
  zohoInventoryOrgName: text("zoho_inventory_org_name"),
  zohoAccessToken: text("zoho_access_token"),
  zohoTokenExpiresAt: timestamp("zoho_token_expires_at"),
  zohoRegion: text("zoho_region").default("us"),
  zohoSyncFrequencyMinutes: integer("zoho_sync_frequency_minutes").notNull().default(0),
  zohoLastAutoSyncAt: timestamp("zoho_last_auto_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ id: true, createdAt: true });
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: text("type").notNull(),
  status: text("status").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
