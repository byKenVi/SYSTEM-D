export type CatalogProductIdentity = {
  id: number;
  contactId: number;
  zohoItemId?: string | null;
  shopifyVariantId?: string | null;
  shopifyProductId?: string | null;
  shopifyStoreUrl?: string | null;
  sku?: string | null;
  name?: string | null;
  price?: string | number | null;
  lastSyncedAt?: Date | string | null;
};

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().replace(/\s+/g, " ").toLowerCase();
  return result || null;
}

function normalizedStore(value: string | null | undefined): string | null {
  const result = normalized(value)?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return result || null;
}

function normalizedPrice(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : normalized(String(value));
}

export function catalogProductIdentityKeys(product: CatalogProductIdentity): string[] {
  const identities: string[] = [];
  const zohoItemId = normalized(product.zohoItemId);
  if (zohoItemId) identities.push(`zoho:${zohoItemId}`);

  const shopifyVariantId = normalized(product.shopifyVariantId);
  if (shopifyVariantId) identities.push(`shopify-variant:${shopifyVariantId}`);

  const shopifyProductId = normalized(product.shopifyProductId);
  const sku = normalized(product.sku);
  if (shopifyProductId && sku) identities.push(`shopify-product-sku:${shopifyProductId}:${sku}`);

  const store = normalizedStore(product.shopifyStoreUrl);
  const name = normalized(product.name);
  const price = normalizedPrice(product.price);
  if (store && sku && name && price) identities.push(`store-sku-name-price:${store}:${sku}:${name}:${price}`);

  return identities;
}

export function catalogProductIdentity(product: CatalogProductIdentity): string | null {
  return catalogProductIdentityKeys(product)[0] ?? null;
}

function chooseCanonical<T extends CatalogProductIdentity>(
  products: readonly T[],
  preferredContactId?: number,
): T {
  return products.reduce((best, candidate) => {
    if (preferredContactId !== undefined) {
      const candidateIsPreferred = candidate.contactId === preferredContactId;
      const bestIsPreferred = best.contactId === preferredContactId;
      if (candidateIsPreferred !== bestIsPreferred) return candidateIsPreferred ? candidate : best;
    }

    const candidateSynced = candidate.lastSyncedAt ? new Date(candidate.lastSyncedAt).getTime() : 0;
    const bestSynced = best.lastSyncedAt ? new Date(best.lastSyncedAt).getTime() : 0;
    if (candidateSynced !== bestSynced) return candidateSynced > bestSynced ? candidate : best;
    return candidate.id < best.id ? candidate : best;
  });
}

export type CatalogDedupeExample<T extends CatalogProductIdentity> = {
  identity: string;
  products: T[];
};

export function dedupeCatalogProductsWithStats<T extends CatalogProductIdentity>(
  products: readonly T[],
  preferredContactId?: number,
): { products: T[]; duplicateGroups: number; examples: CatalogDedupeExample<T>[] } {
  const parent = products.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const join = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };

  // A source record can have Zoho metadata while its mirrored record has
  // Shopify metadata. Join on every available authoritative key, instead of
  // choosing only the first key on each row.
  const firstIndexByIdentity = new Map<string, number>();
  products.forEach((product, index) => {
    for (const identity of catalogProductIdentityKeys(product)) {
      const firstIndex = firstIndexByIdentity.get(identity);
      if (firstIndex === undefined) firstIndexByIdentity.set(identity, index);
      else join(firstIndex, index);
    }
  });

  const grouped = new Map<number, T[]>();
  products.forEach((product, index) => {
    const root = find(index);
    const group = grouped.get(root) ?? [];
    group.push(product);
    grouped.set(root, group);
  });

  const visible: T[] = [];
  let duplicateGroups = 0;
  const examples: CatalogDedupeExample<T>[] = [];
  for (const group of grouped.values()) {
    visible.push(chooseCanonical(group, preferredContactId));
    const identities = Array.from(new Set(group.flatMap(catalogProductIdentityKeys)));
    if (group.length > 1 && identities.length > 0) {
      duplicateGroups += 1;
      if (examples.length < 5) examples.push({ identity: identities[0], products: group.slice(0, 5) });
    }
  }

  return { products: visible, duplicateGroups, examples };
}

/**
 * A single catalog can be mirrored on multiple related contact records. Keep
 * one visible item per authoritative Zoho or Shopify identity. If a preferred
 * contact is known, retain its record so product actions keep that context.
 */
export function dedupeCatalogProducts<T extends CatalogProductIdentity>(
  products: readonly T[],
  preferredContactId?: number,
): T[] {
  return dedupeCatalogProductsWithStats(products, preferredContactId).products;
}