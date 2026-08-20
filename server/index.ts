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

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS additional_admin_emails TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopify_oauth_states (
      state_hash VARCHAR(64) PRIMARY KEY,
      session_id TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
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
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'card'`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS shopify_customer_gid TEXT`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS shopify_credit_account_id TEXT`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS shopify_credit_transaction_id TEXT`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'to_process'`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS stock_reservation_status TEXT NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE systemd_orders ADD COLUMN IF NOT EXISTS stock_reserved_at TIMESTAMP`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_systemd_orders_intent ON systemd_orders (checkout_intent_key) WHERE status = 'pending'`);
  // L'idempotence protège uniquement un débit en cours. Une commande déjà payée
  // ne doit jamais empêcher le rep de refaire plus tard le même panier.
  await pool.query(`DROP INDEX IF EXISTS uq_systemd_orders_intent_active`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_systemd_orders_intent_pending ON systemd_orders (checkout_intent_key) WHERE status = 'pending'`);
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
    },
  );
})();
