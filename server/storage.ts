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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gt, sql, or, isNull, like, ilike, inArray } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
