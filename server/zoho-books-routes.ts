import type { Express, RequestHandler, Response } from "express";
import { storage } from "./storage";
import { fetchBooksOrganizations, configureBooksOrganization, testBooksConnection } from "./zoho-books";
import { BooksConfigurationError } from "./zoho-books-policy";

function failBooks(res: Response, error: unknown) {
  if (error instanceof BooksConfigurationError) {
    return res.status(error.httpStatus).json({ code: error.code, message: error.message });
  }
  return res.status(503).json({ code: "BOOKS_UNAVAILABLE", message: "Zoho Books est momentanément indisponible. Réessayez plus tard." });
}

export function registerZohoBooksRoutes(app: Express, authenticated: RequestHandler, admin: RequestHandler, sameOrigin: RequestHandler) {
  app.get("/api/auth/zoho/books/status", authenticated, admin, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const settings = await storage.getAdminSettings();
      res.json({ connected: !!settings?.zohoInventoryRefreshToken, organizationId: settings?.zohoBooksOrgId || null, inventoryOrganizationId: settings?.zohoInventoryOrgId || null, region: settings?.zohoRegion || "us" });
    } catch (error) { failBooks(res, error); }
  });
  app.post("/api/auth/zoho/books/organizations", sameOrigin, authenticated, admin, async (_req, res) => {
    try {
      const organizations = await fetchBooksOrganizations();
      const settings = await storage.getAdminSettings();
      const match = organizations.find(org => org.organization_id === settings?.zohoInventoryOrgId);
      res.json({ organizations, suggestedOrganizationId: match?.organization_id || (organizations.length === 1 ? organizations[0].organization_id : null) });
    } catch (error) { failBooks(res, error); }
  });
  app.post("/api/auth/zoho/books/configure", sameOrigin, authenticated, admin, async (req, res) => {
    if (req.body.organizationId !== undefined && (typeof req.body.organizationId !== "string" || !/^\d+$/.test(req.body.organizationId))) {
      return res.status(400).json({ code: "BOOKS_ORGANIZATION_INVALID", message: "Choisissez une organisation valide." });
    }
    try { res.json(await configureBooksOrganization(req.body.organizationId)); }
    catch (error) { failBooks(res, error); }
  });
  app.post("/api/auth/zoho/books/test", sameOrigin, authenticated, admin, async (_req, res) => {
    try { res.json(await testBooksConnection()); }
    catch (error) { failBooks(res, error); }
  });
}
