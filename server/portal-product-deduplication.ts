/**
 * Products can be mirrored on multiple contact records belonging to one Zoho
 * account. They remain separate source records, but a client must see one
 * catalog entry for one real Zoho/Shopify product.
 */
export type ScopedProduct = {
  id: number;
  contactId: number;
  zohoItemId?: string | null;
  shopifyVariantId?: string | null;
};

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toLowerCase();
  return result || null;
}

function identityFor(product: ScopedProduct): string | null {
  const zohoItemId = normalized(product.zohoItemId);
  if (zohoItemId) return `zoho:${zohoItemId}`;

  const shopifyVariantId = normalized(product.shopifyVariantId);
  if (shopifyVariantId) return `shopify-variant:${shopifyVariantId}`;

  return null;
}

/**
 * Keeps one entry per authoritative product identity. When a product exists
 * on a shared account and on the signed-in contact, keep the latter so its
 * detail link continues to resolve to that contact's own record.
 */
export function dedupeScopedProducts<T extends ScopedProduct>(
  products: readonly T[],
  preferredContactId: number,
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
    if (!current || (product.contactId === preferredContactId && current.contactId !== preferredContactId)) {
      byIdentity.set(identity, product);
    }
  }

  return [...byIdentity.values(), ...unkeyed];
}