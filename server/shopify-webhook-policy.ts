import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhooks Shopify « commandes » : Shopify prévient l'app dès qu'une commande
 * est créée, payée ou annulée, au lieu d'attendre le prochain cycle de polling
 * (gardé en filet de sécurité : la livraison des webhooks n'est pas garantie).
 */
export const ORDER_WEBHOOK_TOPICS = ["orders/create", "orders/paid", "orders/cancelled"] as const;
export const ORDER_WEBHOOK_PATH = "/api/webhooks/shopify/orders";

/** URL HTTPS publique du webhook, ou null si l'app n'a pas d'URL publique configurée. */
export function orderWebhookAddress(baseUrl: string | null | undefined): string | null {
  const raw = (baseUrl ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? `${url.origin}${ORDER_WEBHOOK_PATH}` : null;
  } catch {
    return null;
  }
}

/** X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(secret de l'app, corps brut)). */
export function isValidShopifyWebhook(
  rawBody: Buffer | undefined,
  hmacHeader: string | undefined,
  secrets: string[],
): boolean {
  if (!rawBody || !hmacHeader) return false;
  const provided = Buffer.from(hmacHeader, "base64");
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });
}

/** Sujets pas encore abonnés à cette adresse. */
export function missingWebhookTopics(
  existing: { topic: string; address: string }[],
  address: string,
  topics: readonly string[] = ORDER_WEBHOOK_TOPICS,
): string[] {
  const subscribed = new Set(existing.filter((w) => w.address === address).map((w) => w.topic));
  return topics.filter((topic) => !subscribed.has(topic));
}
