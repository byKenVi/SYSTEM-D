export function normalizeShopifyStoreUrl(value: string | null | undefined): string {
  let normalized = String(value ?? "").trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  normalized = normalized.trim().toLowerCase();
  if (!normalized) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return normalized
      .replace(/^https?:\/\//i, "")
      .split(/[/?#]/, 1)[0]
      .replace(/\.$/, "");
  }
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
