export const PENDING_ACCESS_MS = 10 * 60_000;
export const APPROVED_ACCESS_MS = 30 * 60_000;

export function accessState(
  row: { status: string; expiresAt: Date; revokedAt: Date | null } | undefined,
  now = Date.now(),
): "none" | "pending" | "approved" | "expired" | "revoked" {
  if (!row) return "none";
  if (row.revokedAt || row.status === "revoked") return "revoked";
  if (row.expiresAt.getTime() <= now) return "expired";
  return row.status === "approved" ? "approved" : "pending";
}

// Deny by default: GET is not synonymous with read-only (OAuth, sync, reconcile).
const allowedReads = [
  /^\/api\/auth\/(?:user|role)$/,
  /^\/api\/admin-settings$/,
  /^\/api\/shopify-integrations$/,
  /^\/api\/activity-logs$/,
  /^\/api\/contacts(?:\/\d+(?:\/(?:products|related|shopify-integrations))?)?$/,
  /^\/api\/products(?:\/\d+)?$/,
  /^\/api\/admin\/dashboard\/kpis$/,
  /^\/api\/admin\/orders-queue$/,
  /^\/api\/admin\/orders(?:\/\d+)?$/,
  /^\/api\/admin\/systemd-orders(?:\/\d+)?$/,
  /^\/api\/admin\/view-as\/\d+\/(?:profile|products(?:\/\d+)?|dashboard\/kpis|forms|orders|related-contacts|notifications|restock-requests)$/,
  /^\/api\/forms(?:\/\d+)?$/,
  /^\/api\/portal\/notifications(?:\/unread-count|\/preferences)?$/,
  /^\/api\/portal\/systemd-products$/,
  /^\/api\/zoho\/(?:catalog-stats|sync-runs)$/,
];

export function isTestReadAllowed(method: string, path: string, query: Record<string, unknown> = {}): boolean {
  const forcesSideEffect = Object.keys(query).some(key => /^(?:force|refresh|sync|reconcile|reset|mark.*read)$/i.test(key));
  return method === "GET" && !forcesSideEffect && allowedReads.some((pattern) => pattern.test(path));
}

// Additional defence against credential fields in otherwise permitted responses.
export function redactTestResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTestResponse);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/(?:secret|password|access.?token|refresh.?token|authorization|cookie|sessionHash|ipHash|platformConfig)/i.test(key)
  ).map(([key, item]) => [key, redactTestResponse(item)]));
}
