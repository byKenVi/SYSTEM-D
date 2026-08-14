export * from "./models/auth";

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb, unique, uuid } from "drizzle-orm/pg-core";
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

export const insertContactSchema = createInsertSchema(contacts).omit({ createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const shopifyIntegrations = pgTable("shopify_integrations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  platform: text("platform").notNull().default("shopify"),
  accessToken: text("access_token").notNull(),
  platformConfig: jsonb("platform_config"),
  storeUrl: text("store_url").notNull(),
  shopName: text("shop_name"),
  scope: text("scope"),
  syncFrequencyMinutes: integer("sync_frequency_minutes").notNull().default(0),
  lastAutoSyncAt: timestamp("last_auto_sync_at"),
  orderSyncFrequencyMinutes: integer("order_sync_frequency_minutes").notNull().default(0),
  lastOrderSyncAt: timestamp("last_order_sync_at"),
  isActive: boolean("is_active").notNull().default(true),
  connectionStatus: text("connection_status").notNull().default("unknown"), // 'ok' | 'invalid_token' | 'error' | 'unknown'
  lastConnectionTestedAt: timestamp("last_connection_tested_at"),
  lastConnectionError: text("last_connection_error"),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  syncPausedUntil: timestamp("sync_paused_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shopifyOrders = pgTable("shopify_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").notNull(),
  contactId: integer("contact_id").notNull(),
  shopifyOrderId: text("shopify_order_id").notNull(),
  name: text("name").notNull(),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  financialStatus: text("financial_status"),
  fulfillmentStatus: text("fulfillment_status"),
  totalPrice: text("total_price").notNull().default("0"),
  currency: text("currency").notNull().default("CAD"),
  email: text("email"),
  customerFirstName: text("customer_first_name"),
  customerLastName: text("customer_last_name"),
  lineItems: jsonb("line_items").notNull().default([]),
  shopName: text("shop_name"),
  storeUrl: text("store_url").notNull(),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => ({
  integrationOrderUnique: unique().on(table.integrationId, table.shopifyOrderId),
}));

export const insertShopifyIntegrationSchema = createInsertSchema(shopifyIntegrations).omit({ createdAt: true });
export type InsertShopifyIntegration = z.infer<typeof insertShopifyIntegrationSchema>;
export type ShopifyIntegration = typeof shopifyIntegrations.$inferSelect;

export const insertShopifyOrderSchema = createInsertSchema(shopifyOrders).omit({ syncedAt: true });
export type InsertShopifyOrder = z.infer<typeof insertShopifyOrderSchema>;
export type ShopifyOrder = typeof shopifyOrders.$inferSelect;

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
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  pushedToZoho: boolean("pushed_to_zoho").notNull().default(false),
  zohoItemId: text("zoho_item_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ createdAt: true });
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

export const insertRestockRequestSchema = createInsertSchema(restockRequests).omit({ createdAt: true, updatedAt: true });
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
  shopifyWritebackFrequencyMinutes: integer("shopify_writeback_frequency_minutes").notNull().default(0),
  shopifyWritebackLastSyncAt: timestamp("shopify_writeback_last_sync_at"),
  additionalAdminEmails: text("additional_admin_emails"),
  zohoProjectsPortalId: text("zoho_projects_portal_id"),
  zohoProjectsPortalName: text("zoho_projects_portal_name"),
  zohoProjectsLastTestedAt: timestamp("zoho_projects_last_tested_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ createdAt: true });
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;

export const formSubmissions = pgTable("form_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  formType: text("form_type").notNull(),
  formNumber: text("form_number").notNull().unique(),
  contactId: integer("contact_id").notNull(),
  submittedBy: text("submitted_by"),
  submittedByName: text("submitted_by_name"),
  status: text("status").notNull().default("draft"),
  data: jsonb("data").notNull().default({}),
  revision: integer("revision").notNull().default(1),
  linkedFormId: integer("linked_form_id"),
  revisionHistory: jsonb("revision_history").default([]),
  price: decimal("price", { precision: 10, scale: 2 }),
  approvedQuantity: decimal("approved_quantity", { precision: 10, scale: 2 }),
  zohoSalesOrderId: text("zoho_sales_order_id"),
  zohoSalesOrderNumber: text("zoho_sales_order_number"),
  zohoSalesOrderUrl: text("zoho_sales_order_url"),
  zohoProjectId: text("zoho_project_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({ createdAt: true, updatedAt: true });
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;

export const formUploads = pgTable("form_uploads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  formSubmissionId: integer("form_submission_id").notNull(),
  fieldKey: text("field_key").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFormUploadSchema = createInsertSchema(formUploads).omit({ createdAt: true });
export type InsertFormUpload = z.infer<typeof insertFormUploadSchema>;
export type FormUpload = typeof formUploads.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: text("type").notNull(),
  status: text("status").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  category: text("category").notNull(), // compte | livraison | commande | projet | inventaire
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  category: text("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => ({
  uniq: unique().on(table.contactId, table.category),
}));

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences);
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;

// ─── MAPI Rep Budgets ─────────────────────────────────────────────────────────

export const mapiReps = pgTable("mapi_reps", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopifyCustomerGid: text("shopify_customer_gid").unique().notNull(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  status: text("status").notNull().default("active"), // 'active' | 'archived'
  monthlyBudgetAmount: decimal("monthly_budget_amount", { precision: 10, scale: 2 }),
  monthlyBudgetCurrency: text("monthly_budget_currency").default("CAD"),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }),
  currentBalanceCurrency: text("current_balance_currency").default("CAD"),
  lastBalanceRefreshAt: timestamp("last_balance_refresh_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertMapiRepSchema = createInsertSchema(mapiReps).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMapiRep = z.infer<typeof insertMapiRepSchema>;
export type MapiRep = typeof mapiReps.$inferSelect;

export const mapiRepCreditLog = pgTable("mapi_rep_credit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  repId: uuid("rep_id").references(() => mapiReps.id),
  shopifyCustomerGid: text("shopify_customer_gid").notNull(),
  action: text("action").notNull(), // 'credit' | 'debit' | 'monthly_renewal' | 'deactivate'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("CAD"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reason: text("reason"),
  performedByUserId: text("performed_by_user_id"),
  shopifyTransactionId: text("shopify_transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertMapiRepCreditLogSchema = createInsertSchema(mapiRepCreditLog).omit({ id: true, createdAt: true });
export type InsertMapiRepCreditLog = z.infer<typeof insertMapiRepCreditLogSchema>;
export type MapiRepCreditLog = typeof mapiRepCreditLog.$inferSelect;

// ─── SystemD Orders ──────────────────────────────────────────────────────────

export const systemdOrders = pgTable("systemd_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contactId: integer("contact_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeCheckoutUrl: text("stripe_checkout_url"),
  checkoutIntentKey: text("checkout_intent_key"),
  paymentMethod: text("payment_method").notNull().default("card"),
  shopifyCustomerGid: text("shopify_customer_gid"),
  shopifyCreditAccountId: text("shopify_credit_account_id"),
  shopifyCreditTransactionId: text("shopify_credit_transaction_id"),
  amount: integer("amount").notNull().default(0),
  currency: text("currency").notNull().default("cad"),
  status: text("status").notNull().default("pending"),
  lineItems: jsonb("line_items").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSystemdOrderSchema = createInsertSchema(systemdOrders).omit({ createdAt: true });
export type InsertSystemdOrder = z.infer<typeof insertSystemdOrderSchema>;
export type SystemdOrder = typeof systemdOrders.$inferSelect;

// ─── Zoho Sync Runs ──────────────────────────────────────────────────────────
// Tracks every full-catalog synchronisation attempt for audit and rollback safety.
export const zohoSyncRuns = pgTable("zoho_sync_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").notNull().default("running"),      // 'running' | 'success' | 'failed'
  triggeredBy: text("triggered_by").notNull().default("scheduler"), // 'scheduler' | 'manual' | 'startup'
  pagesExpected: integer("pages_expected"),
  pagesReceived: integer("pages_received").notNull().default(0),
  itemsReceived: integer("items_received").notNull().default(0),
  itemsUpserted: integer("items_upserted").notNull().default(0),
  itemsSoftDeleted: integer("items_soft_deleted").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});

export type ZohoSyncRun = typeof zohoSyncRuns.$inferSelect;
export type InsertZohoSyncRun = typeof zohoSyncRuns.$inferInsert;

// ─── Zoho Catalog ─────────────────────────────────────────────────────────────
// Local cache of all Zoho Inventory items. Populated by the full-catalog sync.
// Pages read from here instead of calling Zoho directly on every page load.
export const zohoCatalog = pgTable("zoho_catalog", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  zohoItemId: text("zoho_item_id").notNull().unique(),

  // Core product fields
  name: text("name").notNull(),
  sku: text("sku"),
  description: text("description"),
  price: decimal("price", { precision: 12, scale: 4 }),     // Zoho uses up to 4 decimal places
  stock: decimal("stock", { precision: 10, scale: 2 }),     // can be fractional (e.g. kg)
  status: text("status").notNull().default("active"),       // 'active' | 'inactive'
  canBeSold: boolean("can_be_sold"),                         // null when not returned by Zoho
  productType: text("product_type"),
  unit: text("unit"),

  // Image
  imageName: text("image_name"),
  imageDocumentId: text("image_document_id"),               // for versioned cache-busting URLs

  // Client assignment — the core business rule
  cfClientRaw: text("cf_client_raw"),                       // raw value from Zoho (may be a Zoho contact ID)
  cfClientFieldPresent: boolean("cf_client_field_present").notNull().default(false),
  // TRUE  = cf_client field was present in a complete GET /items/{id} response (reliable)
  // FALSE = field was absent due to error/fallback (response incomplete — do NOT infer SystemD)

  assignmentState: text("assignment_state").notNull().default("unresolved"),
  // 'systemd'   : cfClientFieldPresent=TRUE AND cfClientRaw is empty/null
  // 'client'    : cfClientFieldPresent=TRUE AND cfClientRaw resolved to a local contact
  // 'unresolved': cfClientFieldPresent=FALSE OR cfClientRaw non-empty but not resolved locally

  contactId: integer("contact_id"),                         // NULL for SystemD and unresolved items

  // Sync metadata
  zohoLastModifiedTime: text("zoho_last_modified_time"),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  lastSeenSyncRunId: integer("last_seen_sync_run_id"),

  // Soft delete — never physically remove; preserves references in systemd_orders
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),

  // Raw payload for diagnostics
  zohoRaw: jsonb("zoho_raw"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ZohoCatalogItem = typeof zohoCatalog.$inferSelect;
export type InsertZohoCatalogItem = typeof zohoCatalog.$inferInsert;
