import {
  contacts, type Contact, type InsertContact,
  products, type Product, type InsertProduct,
  restockRequests, type RestockRequest, type InsertRestockRequest,
  shopifyIntegrations, type ShopifyIntegration, type InsertShopifyIntegration,
  shopifyOrders, type ShopifyOrder, type InsertShopifyOrder,
  adminSettings, type AdminSettings, type InsertAdminSettings,
  activityLogs, type ActivityLog, type InsertActivityLog,
  formSubmissions, type FormSubmission, type InsertFormSubmission,
  formUploads, type FormUpload, type InsertFormUpload,
  notifications, type Notification, type InsertNotification,
  notificationPreferences, type NotificationPreference,
  mapiReps, type MapiRep, type InsertMapiRep,
  mapiRepCreditLog, type MapiRepCreditLog, type InsertMapiRepCreditLog,
  systemdOrders, type SystemdOrder, type InsertSystemdOrder,
  zohoSyncRuns, type ZohoSyncRun,
  zohoCatalog, type ZohoCatalogItem, type InsertZohoCatalogItem,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gt, sql, or, isNull, like, ilike, inArray, notInArray } from "drizzle-orm";

export interface IStorage {
  getContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  getContactByEmail(email: string): Promise<Contact | undefined>;
  getContactByUserId(userId: string): Promise<Contact | undefined>;
  createContact(data: InsertContact): Promise<Contact>;
  updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<void>;

  getProducts(): Promise<Product[]>;
  getProductsByContactId(contactId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  upsertProductByShopifyVariant(contactId: number, shopifyVariantId: string, data: InsertProduct): Promise<Product>;

  getRestockRequests(): Promise<RestockRequest[]>;
  getRestockRequestsByContactId(contactId: number): Promise<RestockRequest[]>;
  createRestockRequest(data: InsertRestockRequest): Promise<RestockRequest>;
  updateRestockRequest(id: number, data: Partial<InsertRestockRequest>): Promise<RestockRequest | undefined>;
  deleteRestockRequests(ids: number[]): Promise<void>;

  getShopifyIntegrations(): Promise<ShopifyIntegration[]>;
  getShopifyIntegration(id: number): Promise<ShopifyIntegration | undefined>;
  createShopifyIntegration(data: InsertShopifyIntegration): Promise<ShopifyIntegration>;
  updateShopifyIntegration(id: number, data: Partial<InsertShopifyIntegration>): Promise<ShopifyIntegration | undefined>;
  deleteShopifyIntegration(id: number): Promise<void>;
  getShopifyIntegrationsDueForSync(): Promise<ShopifyIntegration[]>;
  getShopifyIntegrationsDueForOrderSync(): Promise<ShopifyIntegration[]>;

  getShopifyOrders(filters?: { contactId?: number }): Promise<ShopifyOrder[]>;
  upsertShopifyOrdersByIntegration(integrationId: number, orders: InsertShopifyOrder[]): Promise<void>;

  getAdminSettings(): Promise<AdminSettings | undefined>;
  upsertAdminSettings(data: InsertAdminSettings): Promise<AdminSettings>;
  updateZohoTokens(accessToken: string, expiresAt: Date): Promise<void>;
  updateZohoLastSyncAt(syncedAt: Date): Promise<void>;

  createActivityLog(data: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;

  createFormSubmission(data: InsertFormSubmission): Promise<FormSubmission>;
  getFormSubmission(id: number): Promise<FormSubmission | undefined>;
  getFormSubmissions(filters?: { formType?: string; status?: string; contactId?: number }): Promise<FormSubmission[]>;
  getFormSubmissionsByContact(contactId: number): Promise<FormSubmission[]>;
  getCommandeForms(contactId?: number): Promise<FormSubmission[]>;
  getLivraisonForms(contactId?: number): Promise<FormSubmission[]>;
  updateFormSubmission(id: number, data: Partial<InsertFormSubmission>): Promise<FormSubmission | undefined>;
  deleteFormSubmission(id: number): Promise<void>;
  bulkDeleteFormSubmissions(ids: number[]): Promise<void>;
  getNextFormNumber(formType: string): Promise<string>;

  createFormUpload(data: InsertFormUpload): Promise<FormUpload>;
  getFormUploadsBySubmission(formSubmissionId: number): Promise<FormUpload[]>;
  getUploadByFilename(filename: string): Promise<FormUpload | undefined>;
  deleteFormUpload(id: number): Promise<void>;

  createNotification(data: InsertNotification): Promise<Notification>;
  getNotificationsByContactId(contactId: number): Promise<Notification[]>;
  getAllNotifications(): Promise<Notification[]>;
  getUnreadNotificationCount(contactId: number): Promise<number>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(contactId: number): Promise<void>;
  deleteNotification(id: number): Promise<void>;

  getNotificationPreferences(contactId: number): Promise<NotificationPreference[]>;
  upsertNotificationPreference(contactId: number, category: string, enabled: boolean): Promise<void>;
  isNotificationEnabled(contactId: number, category: string): Promise<boolean>;

  // MAPI Reps
  getMapiReps(status?: string): Promise<MapiRep[]>;
  getMapiRep(id: string): Promise<MapiRep | undefined>;
  getMapiRepByGid(gid: string): Promise<MapiRep | undefined>;
  createMapiRep(data: InsertMapiRep): Promise<MapiRep>;
  updateMapiRep(id: string, data: Partial<InsertMapiRep>): Promise<MapiRep | undefined>;
  createMapiRepCreditLog(data: InsertMapiRepCreditLog): Promise<MapiRepCreditLog>;
  getMapiRepCreditLogs(repId: string, limit?: number): Promise<MapiRepCreditLog[]>;

  // SystemD Orders
  createSystemdOrder(data: InsertSystemdOrder): Promise<SystemdOrder>;
  getSystemdOrders(filters?: { contactId?: number }): Promise<SystemdOrder[]>;
  updateSystemdOrder(id: number, data: Partial<InsertSystemdOrder>): Promise<SystemdOrder | undefined>;
  getSystemdOrderByCheckoutSession(sessionId: string): Promise<SystemdOrder | undefined>;
  getSystemdOrderByIntentKey(intentKey: string, windowMinutes: number): Promise<SystemdOrder | undefined>;

  // Zoho Sync Runs
  createZohoSyncRun(data: { triggeredBy: string; status?: string }): Promise<ZohoSyncRun>;
  updateZohoSyncRun(id: number, data: Partial<ZohoSyncRun>): Promise<void>;
  getZohoSyncRuns(limit?: number): Promise<ZohoSyncRun[]>;
  getActiveZohoSyncRun(): Promise<ZohoSyncRun | undefined>;

  // Zoho Catalog
  getZohoCatalogItems(includeDeleted?: boolean): Promise<ZohoCatalogItem[]>;
  getZohoCatalogItem(zohoItemId: string): Promise<ZohoCatalogItem | undefined>;
  getZohoCatalogByAssignmentState(state: string): Promise<ZohoCatalogItem[]>;
  getZohoCatalogByContactId(contactId: number): Promise<ZohoCatalogItem[]>;
  getZohoCatalogStats(): Promise<{
    total: number; systemd: number; client: number; unresolved: number;
    active: number; inactive: number; deleted: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async getContactByEmail(email: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.email, email));
    return contact;
  }

  async getContactByUserId(userId: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.userId, userId));
    return contact;
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }

  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return contact;
  }

  async deleteContact(id: number): Promise<void> {
    // Delete form uploads first (child of form_submissions)
    const forms = await db.select({ id: formSubmissions.id }).from(formSubmissions).where(eq(formSubmissions.contactId, id));
    if (forms.length > 0) {
      const formIds = forms.map((f) => f.id);
      await db.delete(formUploads).where(inArray(formUploads.formSubmissionId, formIds));
    }
    // Delete all child records before the contact itself
    await db.delete(formSubmissions).where(eq(formSubmissions.contactId, id));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.contactId, id));
    await db.delete(notifications).where(eq(notifications.contactId, id));
    await db.delete(restockRequests).where(eq(restockRequests.contactId, id));
    await db.delete(shopifyOrders).where(eq(shopifyOrders.contactId, id));
    await db.delete(shopifyIntegrations).where(eq(shopifyIntegrations.contactId, id));
    await db.delete(products).where(eq(products.contactId, id));
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProductsByContactId(contactId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.contactId, contactId)).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async upsertProductByShopifyVariant(contactId: number, shopifyVariantId: string, data: InsertProduct): Promise<Product> {
    const [existing] = await db.select().from(products)
      .where(and(eq(products.contactId, contactId), eq(products.shopifyVariantId, shopifyVariantId)));
    if (existing) {
      const { id, createdAt, ...updateData } = data as any;
      const [updated] = await db.update(products).set({ ...updateData, lastSyncedAt: new Date() })
        .where(eq(products.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(products).values({ ...data, lastSyncedAt: new Date() }).returning();
    return created;
  }

  async getRestockRequests(): Promise<RestockRequest[]> {
    return db.select().from(restockRequests).orderBy(desc(restockRequests.createdAt));
  }

  async getRestockRequestsByContactId(contactId: number): Promise<RestockRequest[]> {
    return db.select().from(restockRequests).where(eq(restockRequests.contactId, contactId)).orderBy(desc(restockRequests.createdAt));
  }

  async createRestockRequest(data: InsertRestockRequest): Promise<RestockRequest> {
    const [request] = await db.insert(restockRequests).values(data).returning();
    return request;
  }

  async deleteRestockRequests(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(restockRequests).where(inArray(restockRequests.id, ids));
  }

  async updateRestockRequest(id: number, data: Partial<InsertRestockRequest>): Promise<RestockRequest | undefined> {
    const [request] = await db.update(restockRequests).set(data).where(eq(restockRequests.id, id)).returning();
    return request;
  }

  async getShopifyIntegrations(): Promise<ShopifyIntegration[]> {
    return db.select().from(shopifyIntegrations).orderBy(desc(shopifyIntegrations.createdAt));
  }

  async getShopifyIntegration(id: number): Promise<ShopifyIntegration | undefined> {
    const [integration] = await db.select().from(shopifyIntegrations).where(eq(shopifyIntegrations.id, id));
    return integration;
  }

  async createShopifyIntegration(data: InsertShopifyIntegration): Promise<ShopifyIntegration> {
    const [integration] = await db.insert(shopifyIntegrations).values(data).returning();
    return integration;
  }

  async updateShopifyIntegration(id: number, data: Partial<InsertShopifyIntegration>): Promise<ShopifyIntegration | undefined> {
    const [updated] = await db.update(shopifyIntegrations).set(data).where(eq(shopifyIntegrations.id, id)).returning();
    return updated;
  }

  async deleteShopifyIntegration(id: number): Promise<void> {
    const [integration] = await db.select().from(shopifyIntegrations).where(eq(shopifyIntegrations.id, id));
    if (integration) {
      await db.delete(shopifyIntegrations).where(eq(shopifyIntegrations.id, id));
      const remaining = await db.select().from(shopifyIntegrations).where(eq(shopifyIntegrations.contactId, integration.contactId));
      if (remaining.length === 0) {
        await db.update(contacts).set({ shopifyConnected: false }).where(eq(contacts.id, integration.contactId));
      }
    }
  }

  async getShopifyIntegrationsDueForSync(): Promise<ShopifyIntegration[]> {
    return db.select().from(shopifyIntegrations).where(
      and(
        eq(shopifyIntegrations.isActive, true),
        gt(shopifyIntegrations.syncFrequencyMinutes, 0),
        or(
          isNull(shopifyIntegrations.lastAutoSyncAt),
          sql`${shopifyIntegrations.lastAutoSyncAt} < NOW() - (${shopifyIntegrations.syncFrequencyMinutes} || ' minutes')::interval`
        )
      )
    );
  }

  async getShopifyIntegrationsDueForOrderSync(): Promise<ShopifyIntegration[]> {
    return db.select().from(shopifyIntegrations).where(
      and(
        eq(shopifyIntegrations.isActive, true),
        gt(shopifyIntegrations.orderSyncFrequencyMinutes, 0),
        or(
          isNull(shopifyIntegrations.lastOrderSyncAt),
          sql`${shopifyIntegrations.lastOrderSyncAt} < NOW() - (${shopifyIntegrations.orderSyncFrequencyMinutes} || ' minutes')::interval`
        )
      )
    );
  }

  async getShopifyOrders(filters?: { contactId?: number }): Promise<ShopifyOrder[]> {
    if (filters?.contactId) {
      return db.select().from(shopifyOrders)
        .where(eq(shopifyOrders.contactId, filters.contactId))
        .orderBy(desc(shopifyOrders.shopifyCreatedAt));
    }
    return db.select().from(shopifyOrders).orderBy(desc(shopifyOrders.shopifyCreatedAt));
  }

  async upsertShopifyOrdersByIntegration(integrationId: number, orders: InsertShopifyOrder[]): Promise<void> {
    if (orders.length === 0) return;
    for (const order of orders) {
      await db.insert(shopifyOrders)
        .values(order)
        .onConflictDoUpdate({
          target: [shopifyOrders.integrationId, shopifyOrders.shopifyOrderId],
          set: {
            name: order.name,
            shopifyCreatedAt: order.shopifyCreatedAt,
            financialStatus: order.financialStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            totalPrice: order.totalPrice,
            currency: order.currency,
            email: order.email,
            customerFirstName: order.customerFirstName,
            customerLastName: order.customerLastName,
            lineItems: order.lineItems,
            shopName: order.shopName,
            storeUrl: order.storeUrl,
            syncedAt: new Date(),
          },
        });
    }
  }

  async getAdminSettings(): Promise<AdminSettings | undefined> {
    const [settings] = await db.select().from(adminSettings).limit(1);
    return settings;
  }

  async upsertAdminSettings(data: InsertAdminSettings): Promise<AdminSettings> {
    const existing = await this.getAdminSettings();
    if (existing) {
      const { id, createdAt, ...updateData } = data as any;
      const [updated] = await db.update(adminSettings).set(updateData).where(eq(adminSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(adminSettings).values(data).returning();
    return created;
  }

  async updateZohoTokens(accessToken: string, expiresAt: Date): Promise<void> {
    // Targeted update: only touch the two token columns, never spread stale settings.
    await db.update(adminSettings).set({ zohoAccessToken: accessToken, zohoTokenExpiresAt: expiresAt });
  }

  async updateZohoLastSyncAt(syncedAt: Date): Promise<void> {
    // Targeted update: only touch the last-sync timestamp, never spread stale settings.
    await db.update(adminSettings).set({ zohoLastAutoSyncAt: syncedAt });
  }

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [entry] = await db.insert(activityLogs).values(data).returning();
    return entry;
  }

  async getActivityLogs(limit = 500): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async createFormSubmission(data: InsertFormSubmission): Promise<FormSubmission> {
    const [submission] = await db.insert(formSubmissions).values(data).returning();
    return submission;
  }

  async getFormSubmission(id: number): Promise<FormSubmission | undefined> {
    const [submission] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, id));
    return submission;
  }

  async getFormSubmissions(filters?: { formType?: string; status?: string; contactId?: number }): Promise<FormSubmission[]> {
    const conditions = [];
    if (filters?.formType) conditions.push(eq(formSubmissions.formType, filters.formType));
    if (filters?.status) conditions.push(eq(formSubmissions.status, filters.status));
    if (filters?.contactId) conditions.push(eq(formSubmissions.contactId, filters.contactId));

    if (conditions.length > 0) {
      return db.select().from(formSubmissions).where(and(...conditions)).orderBy(desc(formSubmissions.updatedAt));
    }
    return db.select().from(formSubmissions).orderBy(desc(formSubmissions.updatedAt));
  }

  async getFormSubmissionsByContact(contactId: number): Promise<FormSubmission[]> {
    return db.select().from(formSubmissions).where(eq(formSubmissions.contactId, contactId)).orderBy(desc(formSubmissions.updatedAt));
  }

  async getCommandeForms(contactId?: number): Promise<FormSubmission[]> {
    const conditions: any[] = [inArray(formSubmissions.status, ["approved", "completed"])];
    if (contactId) conditions.push(eq(formSubmissions.contactId, contactId));
    return db.select().from(formSubmissions).where(and(...conditions)).orderBy(desc(formSubmissions.updatedAt));
  }

  async getLivraisonForms(contactId?: number): Promise<FormSubmission[]> {
    const conditions: any[] = [eq(formSubmissions.formType, "livraison")];
    if (contactId) conditions.push(eq(formSubmissions.contactId, contactId));
    return db.select().from(formSubmissions).where(and(...conditions)).orderBy(desc(formSubmissions.updatedAt));
  }

  async updateFormSubmission(id: number, data: Partial<InsertFormSubmission>): Promise<FormSubmission | undefined> {
    const [updated] = await db.update(formSubmissions).set({ ...data, updatedAt: new Date() }).where(eq(formSubmissions.id, id)).returning();
    return updated;
  }

  async deleteFormSubmission(id: number): Promise<void> {
    await db.delete(formUploads).where(eq(formUploads.formSubmissionId, id));
    await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
  }

  async bulkDeleteFormSubmissions(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(formUploads).where(inArray(formUploads.formSubmissionId, ids));
    await db.delete(formSubmissions).where(inArray(formSubmissions.id, ids));
  }

  async getNextFormNumber(formType: string): Promise<string> {
    const prefixMap: Record<string, string> = {
      entreposage: "ENT",
      tri: "TRI",
      inspection: "INS",
      copacking: "F015",
      livraison: "LIV",
    };
    const prefix = prefixMap[formType] || formType.toUpperCase();
    const [result] = await db
      .select({ maxNum: sql<string>`MAX(CAST(NULLIF(SPLIT_PART(form_number, '-', 2), '') AS INTEGER))` })
      .from(formSubmissions)
      .where(eq(formSubmissions.formType, formType));
    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 0;
    return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
  }

  async createFormUpload(data: InsertFormUpload): Promise<FormUpload> {
    const [upload] = await db.insert(formUploads).values(data).returning();
    return upload;
  }

  async getFormUploadsBySubmission(formSubmissionId: number): Promise<FormUpload[]> {
    return db.select().from(formUploads).where(eq(formUploads.formSubmissionId, formSubmissionId));
  }

  async getUploadByFilename(filename: string): Promise<FormUpload | undefined> {
    const fileUrl = `/api/uploads/${filename}`;
    const [upload] = await db.select().from(formUploads).where(eq(formUploads.fileUrl, fileUrl));
    return upload;
  }

  async deleteFormUpload(id: number): Promise<void> {
    await db.delete(formUploads).where(eq(formUploads.id, id));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  }

  async getNotificationsByContactId(contactId: number): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.contactId, contactId))
      .orderBy(desc(notifications.createdAt));
  }

  async getAllNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(contactId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.contactId, contactId), eq(notifications.isRead, false)));
    return Number(result?.count ?? 0);
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(contactId: number): Promise<void> {
    await db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.contactId, contactId), eq(notifications.isRead, false)));
  }

  async deleteNotification(id: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async getNotificationPreferences(contactId: number): Promise<NotificationPreference[]> {
    return db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.contactId, contactId));
  }

  async upsertNotificationPreference(contactId: number, category: string, enabled: boolean): Promise<void> {
    await db.insert(notificationPreferences)
      .values({ contactId, category, enabled })
      .onConflictDoUpdate({
        target: [notificationPreferences.contactId, notificationPreferences.category],
        set: { enabled },
      });
  }

  async isNotificationEnabled(contactId: number, category: string): Promise<boolean> {
    const [pref] = await db.select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.contactId, contactId),
        eq(notificationPreferences.category, category)
      ));
    return pref?.enabled ?? true;
  }

  // ─── MAPI Reps ────────────────────────────────────────────────────────────

  async getMapiReps(status?: string): Promise<MapiRep[]> {
    if (status) {
      return db.select().from(mapiReps).where(eq(mapiReps.status, status)).orderBy(desc(mapiReps.createdAt));
    }
    return db.select().from(mapiReps).orderBy(desc(mapiReps.createdAt));
  }

  async getMapiRep(id: string): Promise<MapiRep | undefined> {
    const [rep] = await db.select().from(mapiReps).where(eq(mapiReps.id, id));
    return rep;
  }

  async getMapiRepByGid(gid: string): Promise<MapiRep | undefined> {
    const [rep] = await db.select().from(mapiReps).where(eq(mapiReps.shopifyCustomerGid, gid));
    return rep;
  }

  async createMapiRep(data: InsertMapiRep): Promise<MapiRep> {
    const [rep] = await db.insert(mapiReps).values(data).returning();
    return rep;
  }

  async updateMapiRep(id: string, data: Partial<InsertMapiRep>): Promise<MapiRep | undefined> {
    const [rep] = await db
      .update(mapiReps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mapiReps.id, id))
      .returning();
    return rep;
  }

  async createMapiRepCreditLog(data: InsertMapiRepCreditLog): Promise<MapiRepCreditLog> {
    const [log] = await db.insert(mapiRepCreditLog).values(data).returning();
    return log;
  }

  async getMapiRepCreditLogs(repId: string, limit = 100): Promise<MapiRepCreditLog[]> {
    return db
      .select()
      .from(mapiRepCreditLog)
      .where(eq(mapiRepCreditLog.repId, repId))
      .orderBy(desc(mapiRepCreditLog.createdAt))
      .limit(limit);
  }

  // ─── SystemD Orders ────────────────────────────────────────────────────────

  async createSystemdOrder(data: InsertSystemdOrder): Promise<SystemdOrder> {
    const [order] = await db.insert(systemdOrders).values(data).returning();
    return order;
  }

  async getSystemdOrders(filters?: { contactId?: number }): Promise<SystemdOrder[]> {
    if (filters?.contactId) {
      return db.select().from(systemdOrders)
        .where(eq(systemdOrders.contactId, filters.contactId))
        .orderBy(desc(systemdOrders.createdAt));
    }
    return db.select().from(systemdOrders).orderBy(desc(systemdOrders.createdAt));
  }

  async updateSystemdOrder(id: number, data: Partial<InsertSystemdOrder>): Promise<SystemdOrder | undefined> {
    const [updated] = await db.update(systemdOrders).set(data).where(eq(systemdOrders.id, id)).returning();
    return updated;
  }

  async getSystemdOrderByCheckoutSession(sessionId: string): Promise<SystemdOrder | undefined> {
    const [order] = await db.select().from(systemdOrders)
      .where(eq(systemdOrders.stripeCheckoutSessionId, sessionId));
    return order;
  }

  async getSystemdOrderByIntentKey(intentKey: string, windowMinutes: number): Promise<SystemdOrder | undefined> {
    const [order] = await db.select().from(systemdOrders)
      .where(
        and(
          eq(systemdOrders.checkoutIntentKey, intentKey),
          eq(systemdOrders.status, "pending"),
          sql`${systemdOrders.createdAt} > NOW() - INTERVAL '${sql.raw(String(windowMinutes))} minutes'`
        )
      )
      .orderBy(desc(systemdOrders.createdAt))
      .limit(1);
    return order;
  }

  // ─── Zoho Sync Runs ────────────────────────────────────────────────────────

  async createZohoSyncRun(data: { triggeredBy: string; status?: string }): Promise<ZohoSyncRun> {
    const [run] = await db.insert(zohoSyncRuns).values({
      triggeredBy: data.triggeredBy,
      status: data.status ?? 'running',
      startedAt: new Date(),
    }).returning();
    return run;
  }

  async updateZohoSyncRun(id: number, data: Partial<ZohoSyncRun>): Promise<void> {
    await db.update(zohoSyncRuns).set(data).where(eq(zohoSyncRuns.id, id));
  }

  async getZohoSyncRuns(limit = 20): Promise<ZohoSyncRun[]> {
    return db.select().from(zohoSyncRuns).orderBy(desc(zohoSyncRuns.startedAt)).limit(limit);
  }

  async getActiveZohoSyncRun(): Promise<ZohoSyncRun | undefined> {
    const [run] = await db.select().from(zohoSyncRuns).where(eq(zohoSyncRuns.status, 'running')).limit(1);
    return run;
  }

  // ─── Zoho Catalog ──────────────────────────────────────────────────────────

  async getZohoCatalogItems(includeDeleted = false): Promise<ZohoCatalogItem[]> {
    if (includeDeleted) {
      return db.select().from(zohoCatalog).orderBy(desc(zohoCatalog.lastSyncedAt));
    }
    return db.select().from(zohoCatalog)
      .where(eq(zohoCatalog.isDeleted, false))
      .orderBy(desc(zohoCatalog.lastSyncedAt));
  }

  async getZohoCatalogItem(zohoItemId: string): Promise<ZohoCatalogItem | undefined> {
    const [item] = await db.select().from(zohoCatalog)
      .where(and(eq(zohoCatalog.zohoItemId, zohoItemId), eq(zohoCatalog.isDeleted, false)));
    return item;
  }

  async getZohoCatalogByAssignmentState(state: string): Promise<ZohoCatalogItem[]> {
    return db.select().from(zohoCatalog)
      .where(and(eq(zohoCatalog.assignmentState, state), eq(zohoCatalog.isDeleted, false)))
      .orderBy(zohoCatalog.name);
  }

  async getZohoCatalogByContactId(contactId: number): Promise<ZohoCatalogItem[]> {
    return db.select().from(zohoCatalog)
      .where(and(eq(zohoCatalog.contactId, contactId), eq(zohoCatalog.isDeleted, false)))
      .orderBy(zohoCatalog.name);
  }

  async getZohoCatalogStats(): Promise<{
    total: number; systemd: number; client: number; unresolved: number;
    active: number; inactive: number; deleted: number;
  }> {
    const [result] = await db.select({
      total:     sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE)`,
      systemd:   sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE AND assignment_state = 'systemd')`,
      client:    sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE AND assignment_state = 'client')`,
      unresolved:sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE AND assignment_state = 'unresolved')`,
      active:    sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE AND status = 'active')`,
      inactive:  sql<number>`COUNT(*) FILTER (WHERE is_deleted = FALSE AND status = 'inactive')`,
      deleted:   sql<number>`COUNT(*) FILTER (WHERE is_deleted = TRUE)`,
    }).from(zohoCatalog);
    return {
      total:      Number(result?.total ?? 0),
      systemd:    Number(result?.systemd ?? 0),
      client:     Number(result?.client ?? 0),
      unresolved: Number(result?.unresolved ?? 0),
      active:     Number(result?.active ?? 0),
      inactive:   Number(result?.inactive ?? 0),
      deleted:    Number(result?.deleted ?? 0),
    };
  }
}

export const storage = new DatabaseStorage();
