/**
 * zoho-catalog.ts
 *
 * Full Zoho Inventory catalog synchronisation + shared image cache.
 *
 * Architecture:
 *   - syncFullZohoCatalog() fetches ALL items via pagination, then enriches each
 *     via GET /items/{id} to read custom_fields (cf_client). Runs inside a
 *     PostgreSQL advisory lock so only one sync can run at a time.
 *   - toZohoCatalogRow() applies the confirmed assignment_state logic:
 *       • fetchedViaPerItem=true  AND cf_client empty/null  → 'systemd'
 *       • fetchedViaPerItem=true  AND cf_client resolved    → 'client'
 *       • fetchedViaPerItem=true  AND cf_client unresolved  → 'unresolved'
 *       • fetchedViaPerItem=false (fallback/error)          → 'unresolved' ALWAYS
 *         (never infer SystemD from incomplete data)
 *   - Image cache prevents repeated Zoho API calls for unchanged images.
 */

import { pool, db } from "./db";
import { storage } from "./storage";
import { log } from "./index";
import { zohoCatalog, zohoSyncRuns } from "@shared/schema";
import type { Contact, InsertZohoCatalogItem } from "@shared/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { fetchZohoItemsListAll, fetchZohoItemDetail, fetchZohoContactsMap } from "./zoho-api";

// ─── Advisory lock key ────────────────────────────────────────────────────────
// A unique integer reserved for the Zoho catalog sync lock.
// pg_try_advisory_lock is atomic: returns true if acquired, false if already held.
// Session-scoped: automatically released if the DB connection drops (crash-safe).
const SYNC_LOCK_KEY = 20260804;

// ─── Concurrency limit for per-item enrichment ────────────────────────────────
const PER_ITEM_CONCURRENCY = 5;

// ─── Shared image cache ───────────────────────────────────────────────────────
// Module-level Map shared across all requests.
// Key: "{itemId}:{imageDocumentId|latest}" for versioned cache hits.
// TTL: 24h — cleared on server restart (acceptable; first user re-fetches from Zoho).
const _imageCache = new Map<string, {
  data: Buffer;
  contentType: string;
  fetchedAt: number;
}>();
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000; // 24h

export function getImageFromCache(key: string): { data: Buffer; contentType: string } | null {
  const entry = _imageCache.get(key);
  if (!entry || Date.now() - entry.fetchedAt >= IMAGE_CACHE_TTL_MS) {
    _imageCache.delete(key);
    return null;
  }
  return { data: entry.data, contentType: entry.contentType };
}

export function storeImageInCache(key: string, data: Buffer, contentType: string): void {
  _imageCache.set(key, { data, contentType, fetchedAt: Date.now() });
}

// ─── Contact resolution helpers ───────────────────────────────────────────────

function looksLikeZohoId(v: string): boolean {
  return /^\d{10,}$/.test(v.trim());
}

function resolveCfClient(
  cfClientRaw: string,
  zohoContactsMap: Map<string, { name: string; email: string | null }>,
  contactByCompany: Map<string, Contact>,
  contactByName: Map<string, Contact>,
  contactByEmail: Map<string, Contact>
): Contact | null {
  // Step 1: if cfClientRaw looks like a Zoho contact ID (or is in the contacts map),
  //         resolve it to a name/email first.
  let resolvedName: string | null = null;
  let resolvedEmail: string | null = null;

  if (looksLikeZohoId(cfClientRaw) || zohoContactsMap.has(cfClientRaw)) {
    const zohoContact = zohoContactsMap.get(cfClientRaw);
    if (zohoContact) {
      resolvedName = zohoContact.name;
      resolvedEmail = zohoContact.email;
    }
    // If the ID isn't in the map, we can't resolve → null
  } else {
    // cfClientRaw may be a direct name or company name
    resolvedName = cfClientRaw;
  }

  // Step 2: try matching to a local contact
  if (resolvedEmail) {
    const byEmail = contactByEmail.get(resolvedEmail.toLowerCase());
    if (byEmail) return byEmail;
  }

  if (resolvedName) {
    const key = resolvedName.toLowerCase().trim();
    return contactByCompany.get(key) || contactByName.get(key) || null;
  }

  return null;
}

// ─── Item normalization ───────────────────────────────────────────────────────

interface NormalizedRow {
  zohoItemId: string;
  name: string;
  sku: string | null;
  description: string | null;
  price: string | null;
  stock: string | null;
  status: string;
  canBeSold: boolean | null;
  productType: string | null;
  unit: string | null;
  imageName: string | null;
  imageDocumentId: string | null;
  cfClientRaw: string | null;
  cfClientFieldPresent: boolean;
  assignmentState: "systemd" | "client" | "unresolved";
  contactId: number | null;
  zohoLastModifiedTime: string | null;
  zohoRaw: object;
}

/**
 * Convert a raw Zoho item response into a zoho_catalog row.
 *
 * CRITICAL RULE — confirmed by product owner:
 *   • fetchedViaPerItem = true  → reliable response from GET /items/{id}
 *     - cf_client confirmed empty/null  → assignmentState = 'systemd'
 *     - cf_client resolved to contact   → assignmentState = 'client'
 *     - cf_client non-empty but unknown → assignmentState = 'unresolved'
 *   • fetchedViaPerItem = false → fallback after error (quota, timeout, etc.)
 *     - NEVER infer 'systemd' — always 'unresolved'
 */
export function toZohoCatalogRow(
  item: any,
  fetchedViaPerItem: boolean,
  zohoContactsMap: Map<string, { name: string; email: string | null }>,
  contactByCompany: Map<string, Contact>,
  contactByName: Map<string, Contact>,
  contactByEmail: Map<string, Contact>
): NormalizedRow {
  let cfClientRaw: string | null = null;
  let cfClientFieldPresent = false;
  let assignmentState: "systemd" | "client" | "unresolved" = "unresolved";
  let contactId: number | null = null;

  if (fetchedViaPerItem) {
    // We have a complete, reliable response from GET /items/{id}
    cfClientFieldPresent = true;

    const customFields: any[] = Array.isArray(item.custom_fields) ? item.custom_fields : [];
    const cfField = customFields.find(
      (f: any) => f.api_name === "cf_client" || f.label?.toLowerCase() === "client"
    );
    cfClientRaw = cfField?.value ?? null;

    if (!cfClientRaw || cfClientRaw.trim() === "") {
      // cf_client confirmed absent or empty after a complete fetch → Système D
      assignmentState = "systemd";
    } else {
      // cf_client has a value → attempt to resolve to a local contact
      const resolved = resolveCfClient(
        cfClientRaw, zohoContactsMap, contactByCompany, contactByName, contactByEmail
      );
      if (resolved) {
        assignmentState = "client";
        contactId = resolved.id;
      } else {
        // Value present but not resolved locally → hidden from all portals
        assignmentState = "unresolved";
      }
    }
    // else: fetchedViaPerItem = false → incomplete data → always 'unresolved'
  }

  return {
    zohoItemId: item.item_id,
    name: item.name || "",
    sku: item.sku || null,
    description: item.description || null,
    price: item.rate != null ? String(item.rate) : null,
    stock: item.stock_on_hand != null ? String(item.stock_on_hand) : "0",
    status: item.status || "active",
    canBeSold: item.can_be_sold ?? null,
    productType: item.product_type || null,
    unit: item.unit || null,
    imageName: item.image_name || null,
    imageDocumentId: item.image_document_id || null,
    cfClientRaw,
    cfClientFieldPresent,
    assignmentState,
    contactId,
    zohoLastModifiedTime: item.last_modified_time || null,
    zohoRaw: item,
  };
}

// ─── Main sync function ───────────────────────────────────────────────────────

export interface SyncResult {
  skipped?: true;
  reason?: string;
  syncRunId: number;
  upserted: number;
  softDeleted: number;
}

export async function syncFullZohoCatalog(
  triggeredBy: "scheduler" | "manual" | "startup" = "scheduler"
): Promise<SyncResult> {
  // Acquire a dedicated connection to hold the advisory lock for the duration of the sync.
  // This connection must stay open until the finally block releases the lock.
  const conn = await pool.connect();
  let lockAcquired = false;
  let syncRunId = -1;
  let upserted = 0;
  let softDeleted = 0;

  try {
    // ── Step 1: Atomic advisory lock ─────────────────────────────────────────
    // pg_try_advisory_lock is a single atomic operation: test + acquire.
    // Returns TRUE if acquired (no other sync running), FALSE if already locked.
    const lockResult = await conn.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [SYNC_LOCK_KEY]
    );
    lockAcquired = lockResult.rows[0].acquired;

    if (!lockAcquired) {
      log("Zoho catalog sync skipped: another sync is already running", "zoho-catalog");
      return { skipped: true, reason: "sync_already_running", syncRunId: -1, upserted: 0, softDeleted: 0 };
    }

    // ── Step 2: Create sync run record ────────────────────────────────────────
    const syncRun = await storage.createZohoSyncRun({ triggeredBy, status: "running" });
    syncRunId = syncRun.id;
    log(`Zoho catalog sync started (run #${syncRunId}, triggered by: ${triggeredBy})`, "zoho-catalog");

    // ── Step 3: Load local contacts for cf_client resolution ──────────────────
    const allContacts = await storage.getContacts();
    const contactByCompany = new Map<string, Contact>();
    const contactByName = new Map<string, Contact>();
    const contactByEmail = new Map<string, Contact>();
    for (const c of allContacts) {
      if (c.companyName) contactByCompany.set(c.companyName.toLowerCase().trim(), c);
      contactByName.set(c.name.toLowerCase().trim(), c);
      if (c.email) contactByEmail.set(c.email.toLowerCase(), c);
    }

    // ── Step 4: Fetch Zoho contacts map (ID → name/email) ────────────────────
    let zohoContactsMap: Map<string, { name: string; email: string | null }>;
    try {
      zohoContactsMap = await fetchZohoContactsMap();
      log(`Zoho catalog sync: loaded ${zohoContactsMap.size} Zoho contacts for resolution`, "zoho-catalog");
    } catch (err: any) {
      if (err.message?.includes("429")) {
        const msg = "Quota Zoho épuisé (429) — réessayer après minuit";
        await storage.updateZohoSyncRun(syncRunId, {
          status: "failed", completedAt: new Date(), errorMessage: msg,
        });
        log(`Zoho catalog sync failed: ${msg}`, "zoho-catalog");
        return { syncRunId, upserted: 0, softDeleted: 0 };
      }
      throw err;
    }

    // ── Step 5: Fetch all items from list endpoint (O(pages) calls) ───────────
    let listItems: any[];
    try {
      listItems = await fetchZohoItemsListAll();
    } catch (err: any) {
      if (err.message?.includes("429")) {
        const msg = "Quota Zoho épuisé (429) lors de la récupération de la liste — réessayer après minuit";
        await storage.updateZohoSyncRun(syncRunId, {
          status: "failed", completedAt: new Date(), errorMessage: msg,
        });
        log(`Zoho catalog sync failed: ${msg}`, "zoho-catalog");
        return { syncRunId, upserted: 0, softDeleted: 0 };
      }
      throw err;
    }

    const pagesReceived = Math.ceil(listItems.length / 200) || 0;
    await storage.updateZohoSyncRun(syncRunId, {
      itemsReceived: listItems.length,
      pagesReceived,
      pagesExpected: pagesReceived,
    });
    log(`Zoho catalog sync: fetched ${listItems.length} items across ${pagesReceived} page(s)`, "zoho-catalog");

    // ── Step 6: Per-item enrichment for cf_client (batches of CONCURRENCY) ────
    // GET /items/{id} is the only endpoint that returns custom_fields.
    // fetchedViaPerItem=false on any error → toZohoCatalogRow sets assignmentState='unresolved'.
    const enriched: { data: any; fetchedViaPerItem: boolean }[] = new Array(listItems.length);
    let perItemErrors = 0;

    for (let i = 0; i < listItems.length; i += PER_ITEM_CONCURRENCY) {
      const batch = listItems.slice(i, i + PER_ITEM_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const detail = await fetchZohoItemDetail(item.item_id);
            if (detail) return { data: detail, fetchedViaPerItem: true };
            // 404: item was deleted between list and detail fetch → use list data, mark unresolved
            return { data: item, fetchedViaPerItem: false };
          } catch (err: any) {
            if (err.message?.includes("429")) {
              // Quota hit during per-item phase: abort cleanly
              throw new Error("QUOTA_EXHAUSTED_429");
            }
            // Other transient error: fallback to list data, mark unresolved
            perItemErrors++;
            return { data: item, fetchedViaPerItem: false };
          }
        })
      );
      for (let j = 0; j < results.length; j++) {
        enriched[i + j] = results[j];
      }
    }

    if (perItemErrors > 0) {
      log(`Zoho catalog sync: ${perItemErrors} per-item fetch(es) failed → marked as unresolved`, "zoho-catalog");
    }

    // ── Step 7: Normalise all items ───────────────────────────────────────────
    const rows = enriched.map(({ data, fetchedViaPerItem }) =>
      toZohoCatalogRow(data, fetchedViaPerItem, zohoContactsMap, contactByCompany, contactByName, contactByEmail)
    );

    const seenIds = rows.map((r) => r.zohoItemId);

    // ── Step 8: Transaction — upsert + conditional soft-delete ────────────────
    // Soft-delete only executes if seenIds covers the FULL catalogue (no page error).
    // If any error was thrown before this point, the transaction is never opened →
    // the existing catalogue is preserved intact.
    await db.transaction(async (tx) => {
      const now = new Date();

      for (const row of rows) {
        const values: InsertZohoCatalogItem = {
          ...row,
          lastSyncedAt: now,
          lastSeenSyncRunId: syncRunId,
          isDeleted: false,
          deletedAt: null,
        };

        await tx
          .insert(zohoCatalog)
          .values(values)
          .onConflictDoUpdate({
            target: zohoCatalog.zohoItemId,
            set: {
              name: row.name,
              sku: row.sku,
              description: row.description,
              price: row.price,
              stock: row.stock,
              status: row.status,
              canBeSold: row.canBeSold,
              productType: row.productType,
              unit: row.unit,
              imageName: row.imageName,
              imageDocumentId: row.imageDocumentId,
              cfClientRaw: row.cfClientRaw,
              cfClientFieldPresent: row.cfClientFieldPresent,
              assignmentState: row.assignmentState,
              contactId: row.contactId,
              zohoLastModifiedTime: row.zohoLastModifiedTime,
              lastSyncedAt: now,
              lastSeenSyncRunId: syncRunId,
              isDeleted: false,
              deletedAt: null,
              zohoRaw: row.zohoRaw,
            },
          });
        upserted++;
      }

      // Soft-delete items absent from this sync (only when we have a complete picture)
      if (seenIds.length > 0) {
        const deleted = await tx
          .update(zohoCatalog)
          .set({ isDeleted: true, deletedAt: now })
          .where(
            and(
              eq(zohoCatalog.isDeleted, false),
              notInArray(zohoCatalog.zohoItemId, seenIds)
            )
          );
        softDeleted = deleted.rowCount ?? 0;
      }
    });

    // ── Step 9: Mark sync run as success ──────────────────────────────────────
    await storage.updateZohoSyncRun(syncRunId, {
      status: "success",
      completedAt: new Date(),
      itemsUpserted: upserted,
      itemsSoftDeleted: softDeleted,
    });

    log(
      `Zoho catalog sync completed (run #${syncRunId}): ` +
      `${upserted} upserted, ${softDeleted} soft-deleted`,
      "zoho-catalog"
    );

    await storage.createActivityLog({
      type: "zoho_catalog_sync",
      status: "success",
      message: `Sync catalogue Zoho terminé : ${upserted} articles mis à jour, ${softDeleted} supprimés logiquement`,
    }).catch(() => {});

    return { syncRunId, upserted, softDeleted };

  } catch (err: any) {
    // Mark the sync run as failed and preserve the existing catalogue
    if (syncRunId > 0) {
      await storage.updateZohoSyncRun(syncRunId, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err.message || "Erreur inconnue",
      }).catch(() => {});
    }

    log(`Zoho catalog sync failed (run #${syncRunId}): ${err.message}`, "zoho-catalog");

    await storage.createActivityLog({
      type: "zoho_catalog_sync",
      status: "error",
      message: `Sync catalogue Zoho échoué : ${err.message}`,
    }).catch(() => {});

    throw err;

  } finally {
    // Always release the advisory lock — even on crash.
    // The lock is session-scoped: if this connection drops, PostgreSQL auto-releases it.
    if (lockAcquired) {
      await conn.query("SELECT pg_advisory_unlock($1)", [SYNC_LOCK_KEY]).catch(() => {});
    }
    conn.release();
  }
}

// ─── Single-item upsert (used by webhook handler) ─────────────────────────────

export async function upsertZohoCatalogItemFromWebhook(
  itemId: string,
  allContacts: Contact[],
  zohoContactsMap: Map<string, { name: string; email: string | null }>
): Promise<void> {
  const contactByCompany = new Map<string, Contact>();
  const contactByName = new Map<string, Contact>();
  const contactByEmail = new Map<string, Contact>();
  for (const c of allContacts) {
    if (c.companyName) contactByCompany.set(c.companyName.toLowerCase().trim(), c);
    contactByName.set(c.name.toLowerCase().trim(), c);
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c);
  }

  const detail = await fetchZohoItemDetail(itemId);
  if (!detail) {
    // Item was deleted in Zoho — soft-delete locally
    await db
      .update(zohoCatalog)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(zohoCatalog.zohoItemId, itemId));
    log(`Zoho webhook: item ${itemId} not found in Zoho — soft-deleted`, "zoho-catalog");
    return;
  }

  const row = toZohoCatalogRow(detail, true, zohoContactsMap, contactByCompany, contactByName, contactByEmail);

  await db
    .insert(zohoCatalog)
    .values({ ...row, lastSyncedAt: new Date(), isDeleted: false, deletedAt: null })
    .onConflictDoUpdate({
      target: zohoCatalog.zohoItemId,
      set: {
        name: row.name,
        sku: row.sku,
        description: row.description,
        price: row.price,
        stock: row.stock,
        status: row.status,
        canBeSold: row.canBeSold,
        productType: row.productType,
        unit: row.unit,
        imageName: row.imageName,
        imageDocumentId: row.imageDocumentId,
        cfClientRaw: row.cfClientRaw,
        cfClientFieldPresent: row.cfClientFieldPresent,
        assignmentState: row.assignmentState,
        contactId: row.contactId,
        zohoLastModifiedTime: row.zohoLastModifiedTime,
        lastSyncedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        zohoRaw: row.zohoRaw,
      },
    });

  log(`Zoho webhook: upserted item ${itemId} (state: ${row.assignmentState})`, "zoho-catalog");
}
