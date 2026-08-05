import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { startShopifySyncScheduler } from "./shopify-sync";
import { startShopifyOrdersSyncScheduler } from "./shopify-orders-sync";
import { startZohoSyncScheduler } from "./zoho-sync";
import { startShopifyWritebackScheduler } from "./shopify-writeback";
import { startMapiBalanceRefreshScheduler } from "./mapi-balance-refresh";
import { pool } from "./db";
import { WebhookHandlers } from "./webhookHandlers";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Stripe webhook MUST be registered BEFORE express.json() ──────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: any, res: any) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature" });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync } = await import("./stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    await runMigrations({ databaseUrl, schema: "stripe" });
    log("Stripe schema ready", "stripe");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    log("Stripe webhook configured", "stripe");

    stripeSync.syncBackfill().catch((err: any) => {
      console.error("Stripe backfill error:", err.message);
    });
  } catch (err: any) {
    console.warn("Stripe init skipped (not connected):", err.message);
  }
}

(async () => {
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS additional_admin_emails TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS systemd_orders (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      contact_id INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_checkout_session_id TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'cad',
      status TEXT NOT NULL DEFAULT 'pending',
      line_items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Zoho Catalog: sync run audit log ─────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zoho_sync_runs (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      status TEXT NOT NULL DEFAULT 'running',
      triggered_by TEXT NOT NULL DEFAULT 'scheduler',
      pages_expected INTEGER,
      pages_received INTEGER NOT NULL DEFAULT 0,
      items_received INTEGER NOT NULL DEFAULT 0,
      items_upserted INTEGER NOT NULL DEFAULT 0,
      items_soft_deleted INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      error_message TEXT
    )
  `);

  // ── Zoho Catalog: local cache of all Zoho Inventory items ─────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zoho_catalog (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      zoho_item_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sku TEXT,
      description TEXT,
      price NUMERIC(12, 4),
      stock NUMERIC(10, 2),
      status TEXT NOT NULL DEFAULT 'active',
      can_be_sold BOOLEAN,
      product_type TEXT,
      unit TEXT,
      image_name TEXT,
      image_document_id TEXT,
      cf_client_raw TEXT,
      cf_client_field_present BOOLEAN NOT NULL DEFAULT FALSE,
      assignment_state TEXT NOT NULL DEFAULT 'unresolved',
      contact_id INTEGER,
      zoho_last_modified_time TEXT,
      last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen_sync_run_id INTEGER REFERENCES zoho_sync_runs(id),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMP,
      zoho_raw JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS checkout_intent_key TEXT`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS stripe_checkout_url TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_systemd_orders_intent ON systemd_orders (checkout_intent_key) WHERE status = 'pending'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_zoho_catalog_assignment ON zoho_catalog (assignment_state) WHERE is_deleted = FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_zoho_catalog_contact ON zoho_catalog (contact_id) WHERE is_deleted = FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_zoho_catalog_status ON zoho_catalog (status) WHERE is_deleted = FALSE`);

  await registerRoutes(httpServer, app);
  await seedDatabase();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startShopifySyncScheduler();
      startShopifyOrdersSyncScheduler();
      startZohoSyncScheduler();
      startShopifyWritebackScheduler();
      startMapiBalanceRefreshScheduler();
      initStripe();
    },
  );
})();
