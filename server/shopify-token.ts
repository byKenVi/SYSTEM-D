import type { ShopifyIntegration } from "@shared/schema";
import { storage } from "./storage";
import { requestShopifyClientCredentialsToken } from "./shopify-api";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Jeton Admin API utilisable maintenant. Les connexions « client_credentials »
 * (Mapei) ont un jeton qui expire : on le renouvelle avant l'échéance au lieu
 * de laisser la synchro tomber en 401 (statut invalid_token = synchro arrêtée).
 */
export async function getShopifyAccessToken(
  integration: Pick<ShopifyIntegration, "id" | "accessToken" | "storeUrl"> & { platformConfig?: unknown },
): Promise<string> {
  const config = (integration.platformConfig ?? {}) as Record<string, unknown>;
  if (config.authMode !== "client_credentials") return integration.accessToken;

  const expiresAt = typeof config.tokenExpiresAt === "string" ? Date.parse(config.tokenExpiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + REFRESH_MARGIN_MS) return integration.accessToken;

  const clientId = (process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("Connexion Shopify requise.");

  const token = await requestShopifyClientCredentialsToken(integration.storeUrl, clientId, clientSecret);
  const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
  await storage.updateShopifyIntegration(integration.id, {
    accessToken: token.accessToken,
    scope: token.scope,
    platformConfig: { ...config, expiresIn: token.expiresIn, tokenExpiresAt },
    connectionStatus: "ok",
    lastConnectionTestedAt: new Date(),
    lastConnectionError: null,
  } as any);
  return token.accessToken;
}
