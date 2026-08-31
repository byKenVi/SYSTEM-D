import type { SystemdOrder } from "@shared/schema";
import { storage } from "./storage";
import { normalizeShopifyStoreUrl } from "./shopify-credit-policy";
import {
  fetchShopifyDraftCheckoutStatus,
  fetchShopifyOrderDetail,
  findShopifyOrderBySystemdOrderId,
} from "./shopify-api";
import { getRepBalance, getRepTransactionHistory } from "./mapi-rep-budget";

const RECONCILIATION_INTERVAL_MS = 60_000;
let reconciliationRunning = false;

function orderStoreUrl(order: SystemdOrder): string | null {
  const firstItem = Array.isArray(order.lineItems) ? (order.lineItems as any[])[0] : null;
  const value = firstItem?.storeUrl;
  return typeof value === "string" && value.trim() ? normalizeShopifyStoreUrl(value) : null;
}

export async function reconcileClientProductOrder(order: SystemdOrder): Promise<SystemdOrder> {
  const firstItem = Array.isArray(order.lineItems) ? (order.lineItems as any[])[0] : null;
  if (firstItem?.source !== "client_product") return order;
  if (order.status !== "pending_shopify" && order.status !== "payment_reconciliation_required") return order;

  const integrations = await storage.getShopifyIntegrations();
  const storeUrl = orderStoreUrl(order);
  const integration = integrations.find((candidate) =>
    candidate.id === order.shopifyIntegrationId
    || (!!storeUrl && normalizeShopifyStoreUrl(candidate.storeUrl) === storeUrl),
  );
  if (!integration?.accessToken || !integration.isActive) return order;

  // New Système D flow: the debit is verified first, then a paid Admin API
  // order is created. It never depends on the native draft invoice checkout.
  if (order.status === "payment_reconciliation_required" && !order.shopifyDraftOrderId) {
    let detail: any = null;
    let locatedOrder = null;
    if (order.shopifyOrderId) {
      detail = await fetchShopifyOrderDetail(
        integration.storeUrl,
        integration.accessToken,
        order.shopifyOrderId,
      ).catch(() => null);
    } else {
      locatedOrder = await findShopifyOrderBySystemdOrderId(
        integration.storeUrl,
        integration.accessToken,
        order.id,
      ).catch(() => null);
      if (locatedOrder) {
        detail = await fetchShopifyOrderDetail(
          integration.storeUrl,
          integration.accessToken,
          locatedOrder.legacyResourceId,
        ).catch(() => null);
      }
    }
    if (!detail && !locatedOrder) return order;

    const shopifyOrderId = String(detail?.id ?? locatedOrder!.legacyResourceId);
    const shopifyOrderName = String(detail?.name ?? locatedOrder!.name);
    const financialStatus = String(detail?.financial_status ?? locatedOrder!.displayFinancialStatus).toUpperCase();
    const fulfillmentStatus = String(detail?.fulfillment_status ?? locatedOrder!.displayFulfillmentStatus ?? "UNFULFILLED");
    const currencyCode = String(detail?.currency ?? locatedOrder!.currencyCode).toUpperCase();
    const totalAmount = String(detail?.total_price ?? locatedOrder!.totalAmount);
    const expectedCents = order.amount;
    const actualCents = Math.round(Number(totalAmount) * 100);
    const commonUpdate = {
      shopifyOrderId,
      shopifyOrderName,
      shopifyAdminUrl: `https://${normalizeShopifyStoreUrl(integration.storeUrl)}/admin/orders/${shopifyOrderId}`,
      shopifyFinancialStatus: financialStatus.toLowerCase(),
      shopifyFulfillmentStatus: fulfillmentStatus.toLowerCase(),
    };
    if (financialStatus !== "PAID" || currencyCode !== "CAD" || actualCents !== expectedCents) {
      return (await storage.updateSystemdOrder(order.id, commonUpdate)) ?? order;
    }

    const creditTransactions = order.shopifyCustomerGid
      ? await getRepTransactionHistory(order.shopifyCustomerGid, 100)
      : [];
    const storeCreditDebit = creditTransactions.find((transaction) =>
      transaction.id === order.shopifyCreditTransactionId
      && transaction.type === "Debit"
      && transaction.currency === currencyCode
      && Math.abs(Math.round(Number(transaction.amount) * 100)) === expectedCents,
    );
    if (!storeCreditDebit) return (await storage.updateSystemdOrder(order.id, commonUpdate)) ?? order;

    const paid = await storage.resolveSystemdOrderReconciliation(order.id, {
      ...commonUpdate,
      status: "paid",
      shopifyCreditAccountId: storeCreditDebit.accountId,
      shopifyCreditTransactionId: storeCreditDebit.id,
      shopifyPaymentConfirmedAt: new Date(),
    });
    if (!paid) return order;

    if (detail) {
      await storage.upsertShopifyOrdersByIntegration(integration.id, [{
        integrationId: integration.id,
        contactId: integration.contactId,
        shopifyOrderId,
        name: shopifyOrderName,
        shopifyCreatedAt: detail.created_at ? new Date(detail.created_at) : null,
        financialStatus: detail.financial_status ?? "paid",
        fulfillmentStatus: detail.fulfillment_status ?? null,
        totalPrice: totalAmount,
        currency: currencyCode,
        email: detail.email ?? null,
        customerFirstName: detail.customer?.first_name ?? null,
        customerLastName: detail.customer?.last_name ?? null,
        lineItems: detail.line_items ?? [],
        shopName: integration.shopName,
        storeUrl: integration.storeUrl,
      }]).catch(() => {});
    }
    await storage.createActivityLog({
      type: "shopify_client_product_order_reconciled",
      status: "success",
      message: `Commande produit client #${order.id} réconciliée avec Shopify (${shopifyOrderName}).`,
      metadata: JSON.stringify({ orderId: order.id, shopifyOrderId, shopifyTransactionId: storeCreditDebit.id }),
    }).catch(() => {});
    await storage.createNotification({
      contactId: order.contactId,
      category: "commande",
      type: "client_product_order_paid",
      title: `Commande ${shopifyOrderName} confirmée`,
      message: "La commande Shopify et le débit Store Credit ont été confirmés par réconciliation.",
      metadata: { systemdOrderId: order.id, shopifyOrderId, orderSource: "client_product" },
    }).catch(() => {});
    return paid;
  }

  if (!order.shopifyDraftOrderId) return order;

  const draft = await fetchShopifyDraftCheckoutStatus(
    integration.storeUrl,
    integration.accessToken,
    order.shopifyDraftOrderId,
  );
  if (!draft) {
    return (await storage.updateSystemdOrder(order.id, {
      status: "payment_reconciliation_required",
    })) ?? order;
  }
  if (draft.status !== "COMPLETED" || !draft.order) return order;

  const shopifyOrder = draft.order;
  const adminUrl = `https://${normalizeShopifyStoreUrl(integration.storeUrl)}/admin/orders/${shopifyOrder.legacyResourceId}`;
  const commonUpdate = {
    shopifyOrderId: shopifyOrder.legacyResourceId,
    shopifyOrderName: shopifyOrder.name,
    shopifyAdminUrl: adminUrl,
    shopifyFinancialStatus: shopifyOrder.displayFinancialStatus.toLowerCase(),
    shopifyFulfillmentStatus: shopifyOrder.displayFulfillmentStatus.toLowerCase(),
    amount: Math.round(Number(shopifyOrder.totalAmount) * 100),
    currency: shopifyOrder.currencyCode.toLowerCase(),
  };

  if (shopifyOrder.displayFinancialStatus !== "PAID") {
    return (await storage.updateSystemdOrder(order.id, commonUpdate)) ?? order;
  }

  const successfulOrderTransactionIds = new Set(
    shopifyOrder.transactions
      .filter((transaction) => transaction.status === "SUCCESS")
      .map((transaction) => transaction.id),
  );
  const expectedCents = Math.round(Number(shopifyOrder.totalAmount) * 100);
  const creditTransactions = order.shopifyCustomerGid
    ? await getRepTransactionHistory(order.shopifyCustomerGid, 100)
    : [];
  const storeCreditDebit = creditTransactions.find((transaction) =>
    transaction.type === "Debit"
    && !!transaction.originOrderTransactionId
    && successfulOrderTransactionIds.has(transaction.originOrderTransactionId)
    && transaction.currency === shopifyOrder.currencyCode
    && Math.abs(Math.round(Number(transaction.amount) * 100)) === expectedCents,
  );

  if (!storeCreditDebit) {
    const updated = await storage.updateSystemdOrder(order.id, {
      ...commonUpdate,
      status: "payment_reconciliation_required",
    });
    await storage.createActivityLog({
      type: "shopify_order_payment_reconciliation_required",
      status: "error",
      message: `Commande Shopify ${shopifyOrder.name} payée, mais le débit Store Credit lié n’a pas été confirmé.`,
      metadata: JSON.stringify({ orderId: order.id, shopifyOrderId: shopifyOrder.legacyResourceId }),
    }).catch(() => {});
    return updated ?? order;
  }

  const markPaid = order.status === "pending_shopify"
    ? storage.markSystemdOrderPaidIfShopifyConfirmed.bind(storage)
    : storage.resolveSystemdOrderReconciliation.bind(storage);
  const paid = await markPaid(order.id, {
    ...commonUpdate,
    status: "paid",
    shopifyCreditAccountId: storeCreditDebit.accountId,
    shopifyCreditTransactionId: storeCreditDebit.id,
    shopifyPaymentConfirmedAt: draft.completedAt ? new Date(draft.completedAt) : new Date(),
  });
  if (!paid) return order;

  const detail: any = await fetchShopifyOrderDetail(
    integration.storeUrl,
    integration.accessToken,
    shopifyOrder.legacyResourceId,
  );
  await storage.upsertShopifyOrdersByIntegration(integration.id, [{
    integrationId: integration.id,
    contactId: integration.contactId,
    shopifyOrderId: String(detail.id),
    name: detail.name,
    shopifyCreatedAt: detail.created_at ? new Date(detail.created_at) : null,
    financialStatus: detail.financial_status ?? "paid",
    fulfillmentStatus: detail.fulfillment_status ?? null,
    totalPrice: detail.total_price ?? shopifyOrder.totalAmount,
    currency: detail.currency ?? shopifyOrder.currencyCode,
    email: detail.email ?? null,
    customerFirstName: detail.customer?.first_name ?? null,
    customerLastName: detail.customer?.last_name ?? null,
    lineItems: detail.line_items ?? [],
    shopName: integration.shopName,
    storeUrl: integration.storeUrl,
  }]).catch(() => {});

  if (order.shopifyCustomerGid) {
    const balances = await getRepBalance(order.shopifyCustomerGid).catch(() => []);
    const balance = balances.find((candidate) => candidate.accountId === storeCreditDebit.accountId);
    const rep = await storage.getMapiRepByGid(order.shopifyCustomerGid);
    if (rep && balance) {
      await storage.updateMapiRep(rep.id, {
        currentBalance: balance.amount,
        currentBalanceCurrency: balance.currencyCode,
        lastBalanceRefreshAt: new Date(),
      }).catch(() => {});
    }
  }

  await storage.createActivityLog({
    type: "shopify_client_product_order_paid",
    status: "success",
    message: `Commande produit client #${order.id} confirmée dans Shopify (${shopifyOrder.name}).`,
    metadata: JSON.stringify({
      orderId: order.id,
      shopifyOrderId: shopifyOrder.legacyResourceId,
      shopifyTransactionId: storeCreditDebit.id,
    }),
  }).catch(() => {});
  await storage.createNotification({
    contactId: order.contactId,
    category: "commande",
    type: "client_product_order_admin_action",
    title: `Produit client ${shopifyOrder.name} à traiter`,
    message: "Shopify a confirmé la commande et le débit Store Credit.",
    metadata: {
      adminOnly: true,
      systemdOrderId: order.id,
      shopifyOrderId: shopifyOrder.legacyResourceId,
      orderSource: "client_product",
    },
  }).catch(() => {});
  await storage.createNotification({
    contactId: order.contactId,
    category: "commande",
    type: "client_product_order_paid",
    title: `Commande ${shopifyOrder.name} confirmée`,
    message: "Shopify a confirmé la commande et le paiement par Store Credit.",
    metadata: {
      systemdOrderId: order.id,
      shopifyOrderId: shopifyOrder.legacyResourceId,
      orderSource: "client_product",
    },
  }).catch(() => {});
  return paid;
}

export function startShopifyClientOrderReconciliationScheduler(): void {
  setInterval(async () => {
    if (reconciliationRunning) return;
    reconciliationRunning = true;
    try {
      const pending = (await storage.getSystemdOrders()).filter((order) =>
        (order.lineItems as any[])?.[0]?.source === "client_product"
        && (
          (order.status === "pending_shopify" && !!order.shopifyDraftOrderId)
          || order.status === "payment_reconciliation_required"
        ),
      );
      for (const order of pending) {
        await reconcileClientProductOrder(order).catch((error) => {
          console.error(`Shopify client order reconciliation failed for #${order.id}:`, error?.message ?? "unknown error");
        });
      }
    } finally {
      reconciliationRunning = false;
    }
  }, RECONCILIATION_INTERVAL_MS);
}
