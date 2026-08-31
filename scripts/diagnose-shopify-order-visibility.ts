import { storage } from "../server/storage";
import { fetchShopifyOrders } from "../server/shopify-api";
import { normalizeShopifyStoreUrl } from "../server/shopify-credit-policy";
import { getRepTransactionHistory, listRepsFromShopify, MAPI_STORE_URL } from "../server/mapi-rep-budget";

function isoDay(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

async function main() {
  const integrations = await storage.getShopifyIntegrations();
  const integration = integrations.find((candidate) =>
    candidate.isActive
    && !!candidate.accessToken
    && normalizeShopifyStoreUrl(candidate.storeUrl) === MAPI_STORE_URL,
  );
  if (!integration?.accessToken) throw new Error("Intégration Shopify Mapei active introuvable.");

  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": integration.accessToken,
  };
  const draftsResponse = await fetch(
    `https://${MAPI_STORE_URL}/admin/api/2026-04/draft_orders.json?status=any&limit=250`,
    { headers },
  );
  if (!draftsResponse.ok) throw new Error(`Lecture des draft orders refusée (${draftsResponse.status}).`);
  const drafts = ((await draftsResponse.json()) as any).draft_orders ?? [];
  const orders = await fetchShopifyOrders(integration.storeUrl, integration.accessToken, 250);
  const today = isoDay(new Date());

  let cursor: string | undefined;
  const matchingReps: any[] = [];
  do {
    const page = await listRepsFromShopify(cursor);
    matchingReps.push(...page.reps.filter((rep) =>
      /kevin|ridgie/i.test(`${rep.firstName ?? ""} ${rep.lastName ?? ""} ${rep.email ?? ""}`),
    ));
    cursor = page.nextCursor;
  } while (cursor);

  const creditEvents = [];
  for (const rep of matchingReps) {
    const transactions = await getRepTransactionHistory(rep.shopifyCustomerId, 100);
    creditEvents.push({
      customerId: rep.shopifyCustomerId,
      name: [rep.firstName, rep.lastName].filter(Boolean).join(" ") || "Client Shopify",
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: transaction.createdAt,
        linkedToOrderTransaction: !!transaction.originOrderTransactionId,
      })),
    });
  }

  console.log(JSON.stringify({
    store: MAPI_STORE_URL,
    order1007: orders.filter((order) => order.name === "#1007" || String(order.id) === "1007"),
    draftD1: drafts.filter((draft: any) => draft.name === "#D1" || draft.name === "D1"),
    ordersOnAugust25: orders.filter((order) => order.created_at && isoDay(order.created_at).endsWith("-08-25")),
    ordersToday: orders.filter((order) => order.created_at && isoDay(order.created_at) === today),
    matchingCustomers: creditEvents,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Diagnostic Shopify échoué.");
  process.exitCode = 1;
});
