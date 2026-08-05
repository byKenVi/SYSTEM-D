import { storage } from "./storage";
import type { Contact } from "../shared/schema";

export async function seedDatabase() {
  try {
    const existingContacts = await storage.getContacts();
    if (existingContacts.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database...");

    const contacts = [
      {
        name: "Marie Dupont",
        email: "marie.dupont@luminex.fr",
        phone: "+33 1 42 68 53 00",
        companyName: "Luminex Electronics",
        companyAddress: "45 Rue de Rivoli, 75001 Paris, France",
        status: "active" as const,
        shopifyConnected: true,
        zohoInventoryPushed: false,
        userId: null,
      },
      {
        name: "Jean-Pierre Martin",
        email: "jp.martin@alpinegoods.ch",
        phone: "+41 22 900 1234",
        companyName: "Alpine Goods SA",
        companyAddress: "12 Quai du Mont-Blanc, 1201 Geneva, Switzerland",
        status: "active" as const,
        shopifyConnected: true,
        zohoInventoryPushed: false,
        userId: null,
      },
      {
        name: "Sophie Lefebvre",
        email: "sophie@artisancraft.be",
        phone: "+32 2 555 0123",
        companyName: "Artisan Craft SPRL",
        companyAddress: "78 Avenue Louise, 1050 Brussels, Belgium",
        status: "invited" as const,
        shopifyConnected: false,
        zohoInventoryPushed: false,
        userId: null,
      },
      {
        name: "Thomas Müller",
        email: "t.muller@techhaus.de",
        phone: "+49 89 1234 5678",
        companyName: "TechHaus GmbH",
        companyAddress: "Maximilianstraße 35, 80539 Munich, Germany",
        status: "invited" as const,
        shopifyConnected: false,
        zohoInventoryPushed: false,
        userId: null,
      },
    ];

    const createdContacts: Contact[] = [];
    for (const c of contacts) {
      const contact = await storage.createContact(c);
      createdContacts.push(contact);
    }

    // Shopify integrations for active clients
    await storage.createShopifyIntegration({
      contactId: createdContacts[0].id,
      accessToken: "shpat_example_luminex",
      storeUrl: "luminex-electronics.myshopify.com",
      isActive: true,
    });

    await storage.createShopifyIntegration({
      contactId: createdContacts[1].id,
      accessToken: "shpat_example_alpine",
      storeUrl: "alpine-goods.myshopify.com",
      isActive: true,
    });

    // Products for Luminex Electronics
    const luminexProducts = [
      { name: "LED Panel Light 60W", sku: "LUM-LED-60W", price: "89.99", inventoryQuantity: 250, pushedToZoho: true, zohoItemId: "ZOHO-1001" },
      { name: "Smart Sensor Module", sku: "LUM-SNS-M01", price: "34.50", inventoryQuantity: 8, pushedToZoho: true, zohoItemId: "ZOHO-1002" },
      { name: "Circuit Board Assembly Kit", sku: "LUM-CBK-V2", price: "124.99", inventoryQuantity: 42, pushedToZoho: false, zohoItemId: null },
      { name: "Micro Controller Unit", sku: "LUM-MCU-X1", price: "18.75", inventoryQuantity: 3, pushedToZoho: false, zohoItemId: null },
      { name: "Power Supply 12V 5A", sku: "LUM-PSU-12V", price: "22.99", inventoryQuantity: 180, pushedToZoho: true, zohoItemId: "ZOHO-1003" },
    ];

    for (const p of luminexProducts) {
      await storage.createProduct({
        contactId: createdContacts[0].id,
        shopifyProductId: `shopify-lum-${p.sku}`,
        name: p.name,
        sku: p.sku,
        description: `High-quality ${p.name.toLowerCase()} from Luminex Electronics`,
        imageUrl: null,
        price: p.price,
        inventoryQuantity: p.inventoryQuantity,
        pushedToZoho: p.pushedToZoho,
        zohoItemId: p.zohoItemId,
        lastSyncedAt: p.pushedToZoho ? new Date() : null,
      });
    }

    // Products for Alpine Goods
    const alpineProducts = [
      { name: "Hiking Backpack 45L", sku: "ALP-BP-45L", price: "159.00", inventoryQuantity: 65, pushedToZoho: true, zohoItemId: "ZOHO-2001" },
      { name: "Thermal Water Bottle", sku: "ALP-TWB-1L", price: "29.99", inventoryQuantity: 120, pushedToZoho: true, zohoItemId: "ZOHO-2002" },
      { name: "Compact Camping Stove", sku: "ALP-CCS-01", price: "79.50", inventoryQuantity: 4, pushedToZoho: false, zohoItemId: null },
      { name: "UV Protection Sunglasses", sku: "ALP-SG-UV3", price: "45.00", inventoryQuantity: 200, pushedToZoho: false, zohoItemId: null },
    ];

    for (const p of alpineProducts) {
      await storage.createProduct({
        contactId: createdContacts[1].id,
        shopifyProductId: `shopify-alp-${p.sku}`,
        name: p.name,
        sku: p.sku,
        description: `Premium ${p.name.toLowerCase()} from Alpine Goods`,
        imageUrl: null,
        price: p.price,
        inventoryQuantity: p.inventoryQuantity,
        pushedToZoho: p.pushedToZoho,
        zohoItemId: p.zohoItemId,
        lastSyncedAt: p.pushedToZoho ? new Date() : null,
      });
    }

    // Restock requests
    const allProducts = await storage.getProducts();
    const luminexProductsList = allProducts.filter(p => p.contactId === createdContacts[0].id);
    const alpineProductsList = allProducts.filter(p => p.contactId === createdContacts[1].id);

    if (luminexProductsList.length > 0) {
      await storage.createRestockRequest({
        contactId: createdContacts[0].id,
        productId: luminexProductsList[0].id,
        requestedQuantity: 100,
        status: "Confirmed",
        zohoSalesOrderId: "SO-10001",
        zohoSalesOrderRef: "SO-REF-A1B2C3",
      });

      if (luminexProductsList.length > 1) {
        await storage.createRestockRequest({
          contactId: createdContacts[0].id,
          productId: luminexProductsList[1].id,
          requestedQuantity: 50,
          status: "Processing",
          zohoSalesOrderId: "SO-10002",
          zohoSalesOrderRef: "SO-REF-D4E5F6",
        });
      }
    }

    if (alpineProductsList.length > 0) {
      await storage.createRestockRequest({
        contactId: createdContacts[1].id,
        productId: alpineProductsList[0].id,
        requestedQuantity: 30,
        status: "Shipped",
        zohoSalesOrderId: "SO-10003",
        zohoSalesOrderRef: "SO-REF-G7H8I9",
      });
    }

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Seeding error:", error);
  }
}
