/**
 * Catalogue Books/Inventory (cache zoho_catalog) → module Products du CRM, pour
 * que le service client retrouve les articles (ex. « MK10 ») dans les lignes
 * des commandes client. Correspondance par SKU (Product_Code), sinon par nom
 * pour les produits CRM sans code. Ne supprime ni ne désactive jamais rien.
 */

import type { ZohoCatalogItem } from "@shared/schema";
import { storage } from "./storage";
import { listAllCrmProducts, upsertCrmProductsBatch, type CrmProductSummary } from "./zoho-crm";

export interface CrmProductSyncPlan {
  creates: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  unchanged: number;
}

export function planCrmProductSync(
  catalog: Pick<ZohoCatalogItem, "name" | "sku" | "price" | "status">[],
  crmProducts: CrmProductSummary[],
): CrmProductSyncPlan {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const byCode = new Map<string, CrmProductSummary>();
  const byNameWithoutCode = new Map<string, CrmProductSummary>();
  for (const p of crmProducts) {
    if (p.code) { if (!byCode.has(norm(p.code))) byCode.set(norm(p.code), p); }
    else if (!byNameWithoutCode.has(norm(p.name))) byNameWithoutCode.set(norm(p.name), p);
  }

  const plan: CrmProductSyncPlan = { creates: [], updates: [], unchanged: 0 };
  const seen = new Set<string>();
  for (const item of catalog) {
    if (item.status !== "active" || !item.name?.trim()) continue;
    const key = item.sku ? `c:${norm(item.sku)}` : `n:${norm(item.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const price = item.price != null ? Number(item.price) : null;
    const match = (item.sku && byCode.get(norm(item.sku))) || byNameWithoutCode.get(norm(item.name));
    if (!match) {
      plan.creates.push({
        Product_Name: item.name.trim(),
        Product_Active: true,
        ...(item.sku ? { Product_Code: item.sku.trim() } : {}),
        ...(price != null && Number.isFinite(price) ? { Unit_Price: price } : {}),
      });
      continue;
    }

    const update: Record<string, unknown> = {};
    if (match.name !== item.name.trim()) update.Product_Name = item.name.trim();
    if (!match.code && item.sku) update.Product_Code = item.sku.trim();
    if (price != null && Number.isFinite(price) && (match.unitPrice == null || Math.abs(match.unitPrice - price) > 0.005)) {
      update.Unit_Price = price;
    }
    if (!match.active) update.Product_Active = true;
    if (Object.keys(update).length) plan.updates.push({ id: match.id, ...update });
    else plan.unchanged++;
  }
  return plan;
}

export interface CrmProductSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

export async function syncCatalogProductsToCrm(options?: { dryRun?: boolean }): Promise<CrmProductSyncResult & { plan: CrmProductSyncPlan }> {
  const plan = planCrmProductSync(await storage.getZohoCatalogItems(false), await listAllCrmProducts());
  if (options?.dryRun) return { created: 0, updated: 0, unchanged: plan.unchanged, errors: [], plan };

  const created = await upsertCrmProductsBatch("POST", plan.creates);
  const updated = await upsertCrmProductsBatch("PUT", plan.updates);
  const result = {
    created: created.ok,
    updated: updated.ok,
    unchanged: plan.unchanged,
    errors: [...created.errors, ...updated.errors],
  };
  await storage.createActivityLog({
    type: "zoho_crm_product_sync",
    status: result.errors.length ? "error" : "success",
    message: `Produits CRM : ${result.created} créés, ${result.updated} mis à jour, ${result.unchanged} inchangés, ${result.errors.length} erreurs`,
    metadata: JSON.stringify({ errors: result.errors.slice(0, 50) }),
  }).catch(() => {});
  return { ...result, plan };
}
