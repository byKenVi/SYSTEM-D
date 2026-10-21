/**
 * Inspecte un module CRM de l'org SystemD (via les tokens OAuth de l'app).
 *
 * Lecture seule : ne crée ni ne modifie aucun enregistrement.
 *
 * Usage (sur Replit, Zoho connecté) :
 *   # 1) Lister TOUS les modules (pour trouver « Commandes client ») :
 *   npx tsx scripts/inspect-crm-module.ts
 *
 *   # 2) Détailler les champs d'un module (nom API ou bout de libellé) :
 *   npx tsx scripts/inspect-crm-module.ts Sales_Orders
 *   npx tsx scripts/inspect-crm-module.ts "commandes client"
 *
 * Le détail montre, pour chaque champ : nom API, libellé, type, s'il est
 * OBLIGATOIRE, et les valeurs de liste déroulante (ex. le champ Status).
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
  const query = process.argv.slice(2).join(" ").trim();
  console.log("Région Zoho :", await getZohoRegion());

  const modules = (await crmGet("/settings/modules")).modules ?? [];

  if (!query) {
    console.log(`\n=== Tous les modules (${modules.length}) ===`);
    for (const m of modules) {
      console.log(
        `  api_name="${m.api_name}"  label="${m.plural_label}"  ` +
          `creatable=${m.creatable}  generated=${m.generated_type}`,
      );
    }
    console.log(
      `\nRelancez avec le api_name du module « Commandes client » pour voir ses champs, ex :\n` +
        `  npx tsx scripts/inspect-crm-module.ts Sales_Orders`,
    );
    return;
  }

  // Trouver le module par api_name exact, sinon par libellé contenant la requête.
  const q = query.toLowerCase();
  const target =
    modules.find((m: any) => m.api_name.toLowerCase() === q) ??
    modules.find((m: any) =>
      `${m.plural_label} ${m.singular_label} ${m.module_name}`.toLowerCase().includes(q),
    );
  if (!target) {
    console.log(`\nAucun module ne correspond à « ${query} ». Modules disponibles :`);
    console.log("  " + modules.map((m: any) => `${m.api_name} (${m.plural_label})`).join(", "));
    return;
  }

  console.log(`\n→ Module : api_name="${target.api_name}"  label="${target.plural_label}"`);
  console.log(`  ⇒ ZOHO_CRM_ORDER_MODULE=${target.api_name}`);

  const subformModules = new Set<string>();

  async function dumpFields(moduleApi: string, indent = ""): Promise<string[]> {
    const fields = (await crmGet(`/settings/fields?module=${encodeURIComponent(moduleApi)}`)).fields ?? [];
    console.log(`${indent}=== Champs de ${moduleApi} (${fields.length}) ===`);
    const mandatory: string[] = [];
    for (const f of fields) {
      const required = f.system_mandatory || f.required;
      if (required && !f.read_only) mandatory.push(f.api_name);
      const flags = [
        required ? "OBLIGATOIRE" : null,
        f.read_only ? "lecture-seule" : null,
      ].filter(Boolean).join(", ");
      // Cible d'un lookup (ex. Product_Name → Products).
      const lookupTo = f.lookup?.module?.api_name ?? f.association_details?.lookup_field?.api_name;
      const extra = [
        flags ? `(${flags})` : null,
        lookupTo ? `→ ${lookupTo}` : null,
      ].filter(Boolean).join("  ");
      console.log(`${indent}  ${f.api_name}  [${f.data_type}]  « ${f.field_label} »${extra ? `  ${extra}` : ""}`);
      const pick = (f.pick_list_values ?? []).map((p: any) => p.display_value);
      if (pick.length) console.log(`${indent}        valeurs : ${pick.join(" | ")}`);
      // Détecter les sous-formulaires (ex. Ordered_Items) pour les déplier ensuite.
      const subMod = f.data_type === "subform"
        ? (f.subform?.module ?? f.association_details?.related_module?.api_name ?? f.api_name)
        : null;
      if (subMod) {
        const name = typeof subMod === "string" ? subMod : subMod.api_name;
        if (name) {
          subformModules.add(name);
          console.log(`${indent}        ↳ sous-formulaire : ${name}`);
        }
      }
    }
    console.log(`${indent}Obligatoires: ${mandatory.length ? mandatory.join(", ") : "(aucun hors lecture-seule)"}`);
    return mandatory;
  }

  await dumpFields(target.api_name);

  for (const sub of subformModules) {
    console.log(`\n----- Sous-formulaire « ${sub} » (lignes d'articles) -----`);
    await dumpFields(sub, "  ").catch((e) => console.log("  (échec: " + e.message + ")"));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
