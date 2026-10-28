/**
 * Règles pures du flux « Commande planifier » → Zoho Inventory (aucun accès
 * base ni réseau : testable seul).
 */

export interface InventoryLocation {
  locationId: string;
  name: string;
  /** « general » (établissement) ou « line_item_only » (entrepôt). */
  type: string | null;
  status: string | null;
  parentLocationId: string | null;
}

function tokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/**
 * Entrepôt où préparer la commande :
 * 1. celui forcé par ZOHO_INVENTORY_LOCATION_ID ;
 * 2. sinon l'entrepôt actif dont le nom contient celui du client (« Q1 Mapei » pour Mapei) ;
 * 3. sinon l'unique entrepôt actif.
 * null si rien ne permet de trancher (on refuse de deviner).
 */
export function resolvePickLocation(
  locations: InventoryLocation[],
  clientHints: (string | null | undefined)[],
  forcedId?: string | null,
): InventoryLocation | null {
  if (forcedId) return locations.find((l) => l.locationId === forcedId) ?? null;

  const active = locations.filter((l) => (l.status ?? "active") === "active");
  const warehouses = active.filter((l) => l.type === "line_item_only");
  const hintTokens = new Set(clientHints.flatMap(tokens));
  const named = warehouses.filter((l) => tokens(l.name).some((t) => hintTokens.has(t)));
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  return warehouses.length === 1 ? warehouses[0] : null;
}

export interface InventorySoLine {
  lineItemId: string;
  itemId: string | null;
  quantity: number;
  /** SKU, sinon nom : sert à nommer les lignes non prélevables. */
  label?: string;
}

/** Ligne que Zoho déclare prélevable (GET /picklists/searchsolineitems). */
export interface PickableSoLine {
  soLineItemId: string;
  quantityToBePicked: number;
}

export interface PicklistLine {
  salesorder_id: string;
  parent_entity_id: string;
  so_line_item_id: string;
  parent_line_item_id: string;
  quantity_to_be_picked: number;
}

/**
 * Lignes de la liste de prélèvement : seulement celles que Zoho déclare
 * prélevables. Un article non suivi en stock n'y figure jamais, et l'envoyer
 * quand même donne « so_line_item_id non valide ».
 */
export function buildPicklistLines(salesorderId: string, pickable: PickableSoLine[]): PicklistLine[] {
  return pickable
    .filter((l) => l.quantityToBePicked > 0)
    .map((l) => ({
      salesorder_id: salesorderId,
      parent_entity_id: salesorderId,
      so_line_item_id: l.soLineItemId,
      parent_line_item_id: l.soLineItemId,
      quantity_to_be_picked: l.quantityToBePicked,
    }));
}

/** Articles de la commande que Zoho refuse de prélever (en pratique : stock non suivi). */
export function unpickableLabels(lines: InventorySoLine[], pickable: PickableSoLine[]): string[] {
  const ok = new Set(pickable.map((p) => p.soLineItemId));
  return lines
    .filter((l) => l.itemId && l.quantity > 0 && !ok.has(l.lineItemId))
    .map((l) => l.label || l.itemId!);
}

/** Nom du client tiré du sujet CRM « Mapei #1014 » → « Mapei ». */
export function storeNameFromSubject(subject: string | null | undefined): string | null {
  const name = (subject ?? "").split("#")[0].trim();
  return name || null;
}

/** Date du jour à Montréal au format Zoho (AAAA-MM-JJ). */
export function zohoToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}
