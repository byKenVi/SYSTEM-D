import type { ShopifyIntegration } from "@shared/schema";
import { storage } from "./storage";
import { createShopifyWebhook, listShopifyWebhooks } from "./shopify-api";
import { getShopifyAccessToken } from "./shopify-token";
import { missingWebhookTopics, orderWebhookAddress } from "./shopify-webhook-policy";

const WEBHOOK_RECHECK_MS = 24 * 60 * 60 * 1000;
const webhooksCheckedAt = new Map<number, number>();

/** Adresse publique du webhook, tirée de SHOPIFY_APP_URL (ou APP_URL). */
export function publicOrderWebhookAddress(): string | null {
  return orderWebhookAddress(process.env.SHOPIFY_APP_URL || process.env.APP_URL);
}

/**
 * Abonne la boutique aux webhooks commandes (idempotent : ne crée que les
 * sujets manquants). Revérifié au plus une fois par jour et par boutique.
 */
export async function ensureOrderWebhooks(
  integration: ShopifyIntegration,
  options?: { force?: boolean },
): Promise<{ address: string; created: string[] } | null> {
  if ((integration.platform ?? "shopify") !== "shopify") return null;
  const address = publicOrderWebhookAddress();
  if (!address) return null;
  const last = webhooksCheckedAt.get(integration.id);
  if (!options?.force && last && Date.now() - last < WEBHOOK_RECHECK_MS) return null;

  const accessToken = await getShopifyAccessToken(integration);
  const existing = await listShopifyWebhooks(integration.storeUrl, accessToken);
  const created: string[] = [];
  for (const topic of missingWebhookTopics(existing, address)) {
    await createShopifyWebhook(integration.storeUrl, accessToken, topic, address);
    created.push(topic);
  }
  webhooksCheckedAt.set(integration.id, Date.now());
  if (created.length) {
    await storage.createActivityLog({
      type: "shopify_order_webhooks",
      status: "success",
      message: `Webhooks commandes Shopify activés pour ${integration.storeUrl} : ${created.join(", ")}`,
    }).catch(() => {});
  }
  return { address, created };
}
