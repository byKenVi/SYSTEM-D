export type CatalogProductIdentity = {
  id: number;
  contactId: number;
  zohoItemId?: string | null;
  shopifyVariantId?: string | null;
};

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toLowerCase();
  return result || null;
}

function identityFor(product: CatalogProductIdentity): string | null {
  const zohoItemId = normalized(product.zohoItemId);
  if (zohoItemId) return `zoho:${zohoItemId}`;

  const shopifyVariantId = normalized(product.shopifyVariantId);
  if (shopifyVariantId) return `shopify-variant:${shopifyVariantId}`;

  return null;
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
  const byIdentity = new Map<string, T>();
  const unkeyed: T[] = [];

  for (const product of products) {
    const identity = identityFor(product);
    if (!identity) {
      unkeyed.push(product);
      continue;
    }

    const current = byIdentity.get(identity);
    if (
      !current
      || (preferredContactId !== undefined
        && product.contactId === preferredContactId
        && current.contactId !== preferredContactId)
    ) {
      byIdentity.set(identity, product);
    }
  }

  return [...byIdentity.values(), ...unkeyed];
}