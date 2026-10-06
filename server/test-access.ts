import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { testAccessRequests } from "@shared/schema";
import { storage } from "./storage";
import { accessState, APPROVED_ACCESS_MS, isTestReadAllowed, PENDING_ACCESS_MS, redactTestResponse } from "./test-access-policy";

declare module "express-session" {
  interface SessionData {
    testAccessId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      readOnlyTestAccess?: { id: string; expiresAt: Date };
    }
  }
}

const hashSession = (id: string) => createHash("sha256").update(id).digest("hex");
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const sameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (origin !== `${req.protocol}://${req.get("host")}` || !req.is("application/json")) {
    return res.status(403).json({ message: "Requête de même origine requise." });
  }
  next();
};

async function currentRequest(req: Request) {
  if (!validId(req.session.testAccessId)) return undefined;
  const [row] = await db.select().from(testAccessRequests).where(and(
    eq(testAccessRequests.id, req.session.testAccessId),
    eq(testAccessRequests.sessionHash, hashSession(req.sessionID)),
  ));
  return row;
}

function publicRequest(row: typeof testAccessRequests.$inferSelect) {
  return {
    id: row.id, code: row.code, status: accessState(row),
    createdAt: row.createdAt, expiresAt: row.expiresAt, scope: "read_only",
  };
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) =>
    req.session.save((error) => error ? reject(error) : resolve()));
}

export function testAccessGuard(isRealAdmin: (id: string) => Promise<boolean>): RequestHandler {
  return async (req, res, next) => {
    if (!req.session.testAccessId) return next();
    // These cannot confer privilege; status only examines this browser's request.
    if (req.path === "/api/test-access/status" || req.path === "/api/test-access/end") return next();
    if (!req.path.startsWith("/api/")) return next();
    res.set("Cache-Control", "no-store");
    try {
      const grant = await currentRequest(req);
      if (accessState(grant) !== "approved" || !grant?.approvedBy || !(await isRealAdmin(grant.approvedBy))) {
        return res.status(401).json({ message: "Accès de test non approuvé, expiré ou révoqué." });
      }
      if (!isTestReadAllowed(req.method, req.path, req.query)) {
        return res.status(403).json({
          message: "Accès de test en lecture seule : cette opération est interdite.",
          code: "TEST_ACCESS_READ_ONLY",
        });
      }
      req.readOnlyTestAccess = { id: grant.id, expiresAt: grant.expiresAt };
      // A distinct ephemeral principal, never a Passport login or a persisted user.
      req.user = { claims: { sub: `test-access:${grant.id}` }, expires_at: Math.floor(grant.expiresAt.getTime() / 1000) } as Express.User;
      const sendJson = res.json.bind(res);
      res.json = ((body: unknown) => sendJson(redactTestResponse(body))) as typeof res.json;
      next();
    } catch {
      res.status(503).json({ message: "Validation de l’accès de test indisponible." });
    }
  };
}

export function registerTestAccessRoutes(app: Express, authenticated: RequestHandler, admin: RequestHandler) {
  app.get("/api/test-access/status", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const row = await currentRequest(req);
      res.json(row ? publicRequest(row) : { status: "none" });
    } catch {
      res.status(503).json({ message: "Accès de test indisponible." });
    }
  });

  app.post("/api/test-access/request", sameOrigin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (req.isAuthenticated()) return res.status(409).json({ message: "Utilisez un navigateur séparé de votre session normale." });
      if (req.session.testAccessId) return res.status(409).json({ message: "Terminez la demande existante avant d’en créer une autre." });
      const ipHash = createHmac("sha256", process.env.SESSION_SECRET!).update(req.ip || "unknown").digest("hex");
      // Cross-instance rate limiting and creation are atomic; no in-memory authority.
      const row = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`test-access:${ipHash}`}))`);
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(testAccessRequests).where(and(
          eq(testAccessRequests.ipHash, ipHash),
          gt(testAccessRequests.createdAt, new Date(Date.now() - 60 * 60_000)),
        ));
        if (count >= 5) return null;
        await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        const [inserted] = await tx.insert(testAccessRequests).values({
          id: randomUUID(), sessionHash: hashSession(req.sessionID), ipHash,
          code: randomBytes(4).toString("hex").toUpperCase(),
          expiresAt: new Date(Date.now() + PENDING_ACCESS_MS),
        }).returning();
        return inserted;
      });
      if (!row) return res.status(429).json({ message: "Maximum 5 demandes par heure pour ce navigateur réseau." });
      req.session.testAccessId = row.id;
      req.session.cookie.sameSite = "lax";
      req.session.cookie.maxAge = PENDING_ACCESS_MS + APPROVED_ACCESS_MS;
      await saveSession(req);
      res.status(201).json(publicRequest(row));
    } catch {
      res.status(503).json({ message: "Impossible de créer la demande d’accès de test." });
    }
  });

  app.post("/api/test-access/end", sameOrigin, async (req, res) => {
    try {
      const row = await currentRequest(req);
      if (row) await db.update(testAccessRequests).set({ status: "revoked", revokedAt: new Date() }).where(eq(testAccessRequests.id, row.id));
      if (row) await storage.createActivityLog({ type: "test_access_end", status: "info", message: `Session de test ${row.id} terminée.` });
      if (!req.session.testAccessId) return res.json({ ok: true });
      req.session.destroy((error) => {
        if (error) return res.status(503).json({ message: "Impossible de terminer la session." });
        res.clearCookie("connect.sid", { secure: true, httpOnly: true, path: "/", sameSite: "lax" });
        res.json({ ok: true });
      });
    } catch {
      res.status(503).json({ message: "Impossible de terminer la session." });
    }
  });

  const realAdminOnly: RequestHandler = (req, res, next) => {
    if (req.readOnlyTestAccess || req.session.testAccessId) return res.status(403).json({ message: "Un administrateur connecté normalement doit approuver cette demande." });
    next();
  };
  app.get("/api/admin/test-access", authenticated, admin, realAdminOnly, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const rows = await db.select().from(testAccessRequests).where(and(
        gt(testAccessRequests.expiresAt, new Date()),
        sql`${testAccessRequests.status} IN ('pending', 'approved')`,
      )).orderBy(testAccessRequests.createdAt).limit(100);
      res.json(rows.map(publicRequest));
    } catch {
      res.status(503).json({ message: "Impossible de charger les demandes." });
    }
  });

  app.post("/api/admin/test-access/:id/approve", sameOrigin, authenticated, admin, realAdminOnly, async (req: any, res) => {
    if (!validId(req.params.id) || typeof req.body?.code !== "string" || !/^[A-F0-9]{8}$/.test(req.body.code)) {
      return res.status(400).json({ message: "Recopiez le code de 8 caractères du navigateur de test." });
    }
    try {
      const row = await db.transaction(async (tx) => {
        const [grant] = await tx.update(testAccessRequests).set({
          status: "approved", approvedBy: req.user.claims.sub,
          expiresAt: new Date(Date.now() + APPROVED_ACCESS_MS),
        }).where(and(
          eq(testAccessRequests.id, req.params.id),
          eq(testAccessRequests.code, req.body.code),
          eq(testAccessRequests.status, "pending"),
          gt(testAccessRequests.expiresAt, new Date()),
        )).returning();
        if (grant) await tx.execute(sql`INSERT INTO activity_logs (type, status, message) VALUES (
          'test_access_approved', 'success', ${`Accès de test ${grant.id} approuvé en lecture seule pour 30 minutes par ${req.user.claims.sub}.`}
        )`);
        return grant;
      });
      if (!row) return res.status(409).json({ message: "Code incorrect, demande expirée ou déjà traitée." });
      res.json(publicRequest(row));
    } catch {
      res.status(503).json({ message: "Impossible d’approuver la demande." });
    }
  });

  app.post("/api/admin/test-access/:id/revoke", sameOrigin, authenticated, admin, realAdminOnly, async (req: any, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Demande invalide." });
    try {
      const row = await db.transaction(async (tx) => {
        const [grant] = await tx.update(testAccessRequests).set({ status: "revoked", revokedAt: new Date() })
          .where(eq(testAccessRequests.id, req.params.id)).returning();
        if (grant) await tx.execute(sql`INSERT INTO activity_logs (type, status, message) VALUES (
          'test_access_revoked', 'info', ${`Accès de test ${grant.id} révoqué par ${req.user.claims.sub}.`}
        )`);
        return grant;
      });
      if (!row) return res.status(404).json({ message: "Demande introuvable." });
      res.json(publicRequest(row));
    } catch {
      res.status(503).json({ message: "Impossible de révoquer la demande." });
    }
  });
}
