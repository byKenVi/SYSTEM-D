import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import session from "express-session";
import { createServer } from "node:http";
import { once } from "node:events";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { testAccessRequests, activityLogs } from "@shared/schema";
import { registerTestAccessRoutes, testAccessGuard } from "./test-access";
import { accessState, isTestReadAllowed, redactTestResponse } from "./test-access-policy";

test("read-only policy denies writes and dangerous GETs by default", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal(isTestReadAllowed(method, "/api/admin/orders-queue"), false);
  }
  for (const path of ["/api/auth/zoho/connect", "/api/auth/zoho/callback", "/api/auth/zoho/test",
    "/api/auth/shopify/callback", "/api/zoho/full-sync", "/api/admin/test-access",
    "/api/admin/systemd-orders/1/reconciliation", "/api/admin/orders/1/fulfill", "/api/not-allowlisted"]) {
    assert.equal(isTestReadAllowed("GET", path), false, path);
  }
  assert.equal(isTestReadAllowed("GET", "/api/admin/orders-queue"), true);
  assert.equal(isTestReadAllowed("GET", "/api/admin/view-as/11/products/123"), true);
  assert.equal(isTestReadAllowed("GET", "/api/portal/systemd-products", { force: "true" }), false);
});

test("expiration and revocation override an approved status", () => {
  const grant = { status: "approved", expiresAt: new Date(2000), revokedAt: null };
  assert.equal(accessState(grant, 1000), "approved");
  assert.equal(accessState(grant, 2000), "expired");
  assert.equal(accessState({ ...grant, revokedAt: new Date(1) }, 1000), "revoked");
});

test("response sanitization removes nested credentials", () => {
  assert.deepEqual(redactTestResponse({ items: [{ name: "Shop", accessToken: "hidden", platformConfig: { consumerSecret: "hidden" } }], zohoInventoryRefreshToken: "hidden", connected: true }),
    { items: [{ name: "Shop" }], connected: true });
});

test("browser binding, admin approval, CSRF, blocked writes, expiry and revocation over HTTP", async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Integration tests must never write production.");
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-suite-only-session-signing-key", resave: false, saveUninitialized: false, cookie: { secure: false } }));
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => req.session.testAdmin === true;
    if (req.isAuthenticated()) req.user = { claims: { sub: "test-suite-admin" } };
    next();
  });
  app.use(testAccessGuard(async (id) => id === "test-suite-admin"));
  // Test harness only: never included in registerRoutes or production.
  app.post("/harness/admin", (req: any, res) => { req.session.testAdmin = true; res.json({ ok: true }); });
  const auth: RequestHandler = (req, res, next) => req.isAuthenticated() || req.readOnlyTestAccess ? next() : res.status(401).json({});
  const admin: RequestHandler = (req: any, res, next) => req.session.testAdmin || req.readOnlyTestAccess ? next() : res.status(403).json({});
  registerTestAccessRoutes(app, auth, admin);
  let writes = 0;
  app.get("/api/auth/user", auth, (req, res) => res.json({ readOnly: !!req.readOnlyTestAccess }));
  app.post("/api/portal/product-checkout", () => { writes++; });
  app.get("/api/auth/zoho/connect", () => { writes++; });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const ids: string[] = [];
  let guestCookie = "";
  let adminCookie = "";
  async function request(path: string, method = "GET", body?: unknown, cookie = "", origin = base) {
    const response = await fetch(base + path, {
      method, headers: { Cookie: cookie, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0] || "", body: await response.json() };
  }
  try {
    assert.equal((await request("/api/admin/test-access")).status, 401);
    assert.equal((await request("/api/test-access/request", "POST", {}, "", "https://attacker.example")).status, 403);
    const created = await request("/api/test-access/request", "POST", {});
    assert.equal(created.status, 201);
    guestCookie = created.cookie;
    ids.push(created.body.id);
    assert.equal(created.body.status, "pending");
    assert.equal(created.body.scope, "read_only");
    assert.equal((await request("/api/auth/user", "GET", undefined, guestCookie)).status, 401);
    assert.equal((await request("/api/test-access/status")).body.status, "none");
    adminCookie = (await request("/harness/admin", "POST", {})).cookie;
    assert.equal((await request(`/api/admin/test-access/${ids[0]}/approve`, "POST", { code: "00000000" }, adminCookie)).status, 409);
    const approval = await request(`/api/admin/test-access/${ids[0]}/approve`, "POST", { code: created.body.code }, adminCookie);
    assert.equal(approval.status, 200);
    assert.equal(approval.body.status, "approved");
    assert.equal((await request("/api/auth/user", "GET", undefined, guestCookie)).body.readOnly, true);
    assert.equal((await request("/api/auth/user")).status, 401, "Another browser cannot use the non-secret code or ID.");
    assert.equal((await request(`/api/admin/test-access/${ids[0]}/approve`, "POST", { code: created.body.code }, adminCookie)).status, 409);
    assert.equal((await request("/api/portal/product-checkout", "POST", {}, guestCookie)).status, 403);
    assert.equal((await request("/api/auth/zoho/connect", "GET", undefined, guestCookie)).status, 403);
    assert.equal((await request("/api/portal/systemd-products?force=true", "GET", undefined, guestCookie)).status, 403);
    assert.equal((await request("/api/admin/test-access", "GET", undefined, guestCookie)).status, 403);
    assert.equal(writes, 0, "Dangerous handlers must never run.");
    assert.equal((await request(`/api/admin/test-access/${ids[0]}/revoke`, "POST", {}, adminCookie)).status, 200);
    assert.equal((await request("/api/auth/user", "GET", undefined, guestCookie)).status, 401);
    assert.equal((await request("/api/test-access/status", "GET", undefined, guestCookie)).body.status, "revoked");
    assert.equal((await request("/api/test-access/end", "POST", {}, guestCookie)).status, 200);
    const second = await request("/api/test-access/request", "POST", {});
    ids.push(second.body.id);
    await db.update(testAccessRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(testAccessRequests.id, second.body.id));
    assert.equal((await request(`/api/admin/test-access/${second.body.id}/approve`, "POST", { code: second.body.code }, adminCookie)).status, 409);
    assert.equal((await request("/api/test-access/status", "GET", undefined, second.cookie)).body.status, "expired");
    // A bound cookie for an approved grant is still rejected after expiry.
    await db.update(testAccessRequests).set({ status: "approved", approvedBy: "test-suite-admin" }).where(eq(testAccessRequests.id, second.body.id));
    assert.equal((await request("/api/auth/user", "GET", undefined, second.cookie)).status, 401);
    const logs = await db.select().from(activityLogs).where(sql`${activityLogs.message} LIKE ${`%${ids[0]}%`}`);
    assert.ok(logs.some(l => l.type === "test_access_approved"));
    assert.ok(logs.some(l => l.type === "test_access_revoked"));
  } finally {
    if (ids.length) {
      await db.delete(testAccessRequests).where(inArray(testAccessRequests.id, ids));
      for (const id of ids) await db.delete(activityLogs).where(and(
        sql`${activityLogs.type} LIKE 'test_access_%'`,
        sql`${activityLogs.message} LIKE ${`%${id}%`}`,
      ));
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
