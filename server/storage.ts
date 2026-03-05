import {
  contacts, type Contact, type InsertContact,
  products, type Product, type InsertProduct,
  restockRequests, type RestockRequest, type InsertRestockRequest,
  shopifyIntegrations, type ShopifyIntegration, type InsertShopifyIntegration,
  adminSettings, type AdminSettings, type InsertAdminSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

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

  getRestockRequests(): Promise<RestockRequest[]>;
  getRestockRequestsByContactId(contactId: number): Promise<RestockRequest[]>;
  createRestockRequest(data: InsertRestockRequest): Promise<RestockRequest>;
  updateRestockRequest(id: number, data: Partial<InsertRestockRequest>): Promise<RestockRequest | undefined>;

  getShopifyIntegrations(): Promise<ShopifyIntegration[]>;
  getShopifyIntegration(id: number): Promise<ShopifyIntegration | undefined>;
  createShopifyIntegration(data: InsertShopifyIntegration): Promise<ShopifyIntegration>;

  getAdminSettings(): Promise<AdminSettings | undefined>;
  upsertAdminSettings(data: InsertAdminSettings): Promise<AdminSettings>;
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
}

export const storage = new DatabaseStorage();
