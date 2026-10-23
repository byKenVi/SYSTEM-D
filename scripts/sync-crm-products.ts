/**
 * Synchronise le catalogue Books/Inventory (cache zoho_catalog) vers les Products du CRM.
 *
 * Par défaut : SIMULATION (aucune écriture), affiche ce qui serait créé / mis à jour.
 *   npx tsx scripts/sync-crm-products.ts
 * Pour écrire réellement dans le CRM :
 *   npx tsx scripts/sync-crm-products.ts --apply
 */

import { syncCatalogProductsToCrm } from "../server/crm-product-sync";

async function main() {
  const apply = process.argv.includes("--apply");
  const res = await syncCatalogProductsToCrm({ dryRun: !apply });
  console.log(`Mode : ${apply ? "ÉCRITURE" : "simulation (ajoutez --apply pour écrire)"}`);
  console.log(`À créer : ${res.plan.creates.length} | À mettre à jour : ${res.plan.updates.length} | Inchangés : ${res.plan.unchanged}`);
  for (const c of res.plan.creates.slice(0, 20)) console.log(`  + ${c.Product_Code ?? "(sans SKU)"}  ${c.Product_Name}  ${c.Unit_Price ?? ""}`);
  if (res.plan.creates.length > 20) console.log(`  … et ${res.plan.creates.length - 20} autres`);
  for (const u of res.plan.updates.slice(0, 20)) console.log(`  ~ ${u.id}  ${JSON.stringify(u)}`);
  if (res.plan.updates.length > 20) console.log(`  … et ${res.plan.updates.length - 20} autres`);
  if (apply) {
    console.log(`Résultat : ${res.created} créés, ${res.updated} mis à jour, ${res.errors.length} erreurs`);
    for (const e of res.errors.slice(0, 30)) console.log(`  ✗ ${e}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
