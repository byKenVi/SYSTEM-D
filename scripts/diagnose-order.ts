/**
 * Diagnostic d'une commande : pourquoi ne crée-t-elle pas sa « commande
 * client » CRM ? Montre l'état en base (contact, compte CRM, articles, id du
 * deal/commande) + les dernières erreurs d'Activity Log. Lecture seule.
 *
 * Usage (Replit) :
 *   npx tsx scripts/diagnose-order.ts 1014
 *   npx tsx scripts/diagnose-order.ts            # juste les erreurs récentes
 */

import { storage } from "../server/storage";

const ERROR_TYPES = new Set([
  "zoho_crm_deal_create",
  "zoho_crm_deal_create_error",
  "zoho_crm_product_error",
  "zoho_crm_deal_pdf_error",
  "zoho_project_create_error",
  "zoho_project_doc_error",
]);

async function describeContact(contactId: number | null | undefined) {
  if (!contactId) return "  contact: (aucun contactId)";
  const c = await storage.getContact(contactId);
  if (!c) return `  contact #${contactId}: INTROUVABLE`;
  return (
    `  contact #${contactId}: ${c.name ?? "?"} / société=${c.companyName ?? "?"}\n` +
    `    zohoCrmAccountId=${c.zohoCrmAccountId ?? "(vide)"}  zohoCrmContactId=${c.zohoCrmContactId ?? "(vide)"}`
  );
}

function describeLineItems(lineItems: unknown): string {
  const items = Array.isArray(lineItems) ? (lineItems as any[]) : [];
  if (items.length === 0) return "  articles: AUCUN (0)";
  const lines = items.slice(0, 8).map((it, i) => {
    const name = it.name ?? it.title ?? "(sans nom)";
    const sku = it.sku ?? "(sans sku)";
    const qty = it.quantity ?? "?";
    const price = it.unitPrice ?? it.price ?? "?";
    return `    [${i}] name="${name}"  sku="${sku}"  qty=${qty}  price=${price}`;
  });
  return `  articles: ${items.length}\n` + lines.join("\n");
}

async function main() {
  const ref = (process.argv[2] ?? "").trim();

  if (ref) {
    const needle = ref.replace(/^#/, "").toLowerCase();
    const matches = (name?: string | null) => (name ?? "").toLowerCase().includes(needle);

    const systemd = (await storage.getSystemdOrders()).filter(
      (o) => matches(o.shopifyOrderName) || String(o.id) === needle,
    );
    const shopify = (await storage.getShopifyOrders()).filter((o) => matches(o.name));

    console.log(`=== Recherche « ${ref} » ===`);
    console.log(`systemd_orders: ${systemd.length} · shopify_orders: ${shopify.length}\n`);

    for (const o of systemd) {
      console.log(`[SYSTEMD] #${o.id}  name=${o.shopifyOrderName ?? "—"}  status=${o.status}  currency=${o.currency}`);
      console.log(`  zohoCrmDealId=${o.zohoCrmDealId ?? "(vide)"}  url=${o.zohoCrmDealUrl ?? "(vide)"}`);
      console.log(await describeContact(o.contactId));
      console.log(describeLineItems(o.lineItems));
      console.log("");
    }
    for (const o of shopify) {
      console.log(`[SHOPIFY] ${o.name}  int=${o.integrationId}  financial=${o.financialStatus}  currency=${o.currency}`);
      console.log(`  zohoCrmDealId=${o.zohoCrmDealId ?? "(vide)"}  url=${o.zohoCrmDealUrl ?? "(vide)"}`);
      console.log(`  customer=${o.customerFirstName ?? ""} ${o.customerLastName ?? ""}  email=${o.email ?? "—"}`);
      console.log(await describeContact(o.contactId));
      console.log(describeLineItems(o.lineItems));
      console.log("");
    }
    if (systemd.length === 0 && shopify.length === 0) {
      console.log("⚠ Introuvable en base. La commande n'a jamais été synchronisée → rien à créer.");
    }
  }

  const logs = (await storage.getActivityLogs(500)).filter((l) => ERROR_TYPES.has(l.type)).slice(0, 25);
  console.log(`=== ${logs.length} dernières entrées Activity Log (flux commande client) ===`);
  for (const l of logs) {
    const when = l.createdAt ? new Date(l.createdAt).toLocaleString("fr-CA") : "?";
    console.log(`${l.status === "error" ? "✗" : "✓"} [${when}] ${l.type} — ${l.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
