/**
 * Inspecte le CRM de l'org SystemD (via les tokens OAuth de l'app) pour
 * déterminer la cible exacte du flux "devis" :
 *   - nom API du module "Pipelines" (normalement "Deals")
 *   - les pipelines (layouts) disponibles
 *   - les étapes (Stage) de chaque pipeline
 *
 * À exécuter sur Replit (Zoho connecté) :
 *   npx tsx scripts/inspect-crm-pipeline.ts
 *
 * Lecture seule : ne crée ni ne modifie aucun enregistrement.
 */

import { getValidAccessToken, getZohoDomains } from "../server/zoho-auth";
import { getZohoRegion } from "../server/zoho-api";

async function crmGet(path: string): Promise<any> {
  const region = await getZohoRegion();
  const { api } = getZohoDomains(region);
  const token = await getValidAccessToken(region);
  const res = await fetch(`https://${api}/crm/v7${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`CRM ${path} → ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function main() {
  console.log("Région Zoho :", await getZohoRegion());

  // 1. Modules : on cherche celui affiché "Pipelines" (ou le module Deals).
  const modules = (await crmGet("/settings/modules")).modules ?? [];
  console.log(`\n=== Modules (${modules.length}) — candidats pipeline ===`);
  const candidates = modules.filter((m: any) =>
    /pipeline|deal|opportun/i.test(`${m.api_name} ${m.plural_label} ${m.module_name}`),
  );
  for (const m of candidates) {
    console.log(`  api_name="${m.api_name}"  label="${m.plural_label}"  generated=${m.generated_type}`);
  }
  const target = candidates.find((m: any) => m.api_name === "Deals") ?? candidates[0];
  if (!target) {
    console.log("Aucun module pipeline/deal trouvé. Modules disponibles :");
    console.log("  " + modules.map((m: any) => m.api_name).join(", "));
    return;
  }
  console.log(`\n→ Module cible retenu : api_name="${target.api_name}" (label "${target.plural_label}")`);
  console.log(`  ⇒ ZOHO_CRM_ORDER_MODULE=${target.api_name}`);

  // 2. Layouts = pipelines, avec leurs étapes (Stage).
  const layouts = (await crmGet(`/settings/layouts?module=${encodeURIComponent(target.api_name)}`)).layouts ?? [];
  console.log(`\n=== Pipelines / layouts (${layouts.length}) ===`);
  for (const lay of layouts) {
    console.log(`\n• Pipeline "${lay.name}" (id=${lay.id}, status=${lay.status})`);
    for (const sec of lay.sections ?? []) {
      for (const fld of sec.fields ?? []) {
        if (fld.api_name === "Stage" || fld.api_name === "Pipeline") {
          const vals = (fld.pick_list_values ?? []).map((p: any) => p.display_value);
          if (vals.length) console.log(`    ${fld.api_name} : ${vals.join(" > ")}`);
        }
      }
    }
  }

  console.log("\n=== Résumé pour la config ===");
  console.log(`ZOHO_CRM_ORDER_MODULE   = ${target.api_name}`);
  console.log(`ZOHO_CRM_ORDER_PIPELINE = <nom exact du pipeline voulu ci-dessus, si plusieurs>`);
  console.log(`ZOHO_CRM_ORDER_STAGE    = <étape voulue (ex. "Commande reçue" à créer, ou une existante)>`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
