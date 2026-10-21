/**
 * Affiche les dernières entrées d'Activity Log liées au flux « commande client »
 * CRM (créations, échecs, PDF, projet). Lecture seule.
 *
 * Usage (Replit) :
 *   npx tsx scripts/inspect-crm-errors.ts [nombre]
 */

import { storage } from "../server/storage";

const TYPES = new Set([
  "zoho_crm_deal_create",
  "zoho_crm_deal_create_error",
  "zoho_crm_deal_pdf_error",
  "zoho_project_create_error",
  "zoho_project_doc_error",
]);

async function main() {
  const limit = Number(process.argv[2]) || 40;
  const logs = await storage.getActivityLogs(500);
  const relevant = logs.filter((l) => TYPES.has(l.type)).slice(0, limit);

  if (relevant.length === 0) {
    console.log("Aucune entrée d'Activity Log liée au flux commande client CRM.");
    return;
  }

  console.log(`=== ${relevant.length} dernières entrées (flux commande client CRM) ===\n`);
  for (const l of relevant) {
    const when = l.createdAt ? new Date(l.createdAt).toLocaleString("fr-CA") : "?";
    const flag = l.status === "error" ? "✗" : "✓";
    console.log(`${flag} [${when}] ${l.type}`);
    console.log(`    ${l.message}`);
    if (l.metadata) console.log(`    meta: ${l.metadata}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
