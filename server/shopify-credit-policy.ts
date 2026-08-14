export function normalizeShopifyStoreUrl(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export function isShopifyCreditSufficient(
  available: number | string | null | undefined,
  required: number | string | null | undefined,
): boolean {
  const availableAmount = Number(available);
  const requiredAmount = Number(required);
  return Number.isFinite(availableAmount)
    && Number.isFinite(requiredAmount)
    && requiredAmount >= 0
    && availableAmount + 0.0001 >= requiredAmount;
}

export function shopifyCreditHttpStatus(message: string): number {
  if (message === "Crédit insuffisant." || message === "Montant invalide.") return 400;
  if (message === "Rep Shopify introuvable.") return 404;
  return 503;
}
