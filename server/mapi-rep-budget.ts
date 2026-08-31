import { db } from "./db";
import { shopifyIntegrations } from "@shared/schema";
import { normalizeShopifyStoreUrl } from "./shopify-credit-policy";
import { eq } from "drizzle-orm";
import { requestShopifyClientCredentialsToken } from "./shopify-api";

export const MAPI_STORE_URL = "tnt5ar-ki.myshopify.com";
const GQL_VERSION = "2026-04";

export const MAPI_CREDIT_REQUIRED_SCOPES = [
  "read_customers",
  "read_store_credit_accounts",
  "read_store_credit_account_transactions",
  "write_store_credit_account_transactions",
] as const;

async function getMAPIToken(): Promise<string> {
  const integrations = await db.select().from(shopifyIntegrations);
  const matching = integrations.filter(
    (candidate) => normalizeShopifyStoreUrl(candidate.storeUrl) === MAPI_STORE_URL,
  );
  const integration = matching.find((candidate) => candidate.isActive && candidate.accessToken);
  if (!integration?.accessToken) {
    throw new Error("Connexion Shopify requise.");
  }
  const config = (integration.platformConfig ?? {}) as Record<string, unknown>;
  if (config.authMode === "client_credentials") {
    const expiresAt = typeof config.tokenExpiresAt === "string" ? Date.parse(config.tokenExpiresAt) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000) {
      const clientId = (process.env.SHOPIFY_CLIENT_ID || "").trim();
      const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || "").trim();
      if (!clientId || !clientSecret) throw new Error("Connexion Shopify requise.");
      const token = await requestShopifyClientCredentialsToken(MAPI_STORE_URL, clientId, clientSecret);
      const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
      await db.update(shopifyIntegrations).set({
        accessToken: token.accessToken,
        scope: token.scope,
        platformConfig: { ...config, expiresIn: token.expiresIn, tokenExpiresAt },
        connectionStatus: "ok",
        lastConnectionTestedAt: new Date(),
        lastConnectionError: null,
      }).where(eq(shopifyIntegrations.id, integration.id));
      return token.accessToken;
    }
  }
  return integration.accessToken;
}

function shopifyCreditError(message: string, code: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

async function shopifyGQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const token = await getMAPIToken();
  const res = await fetch(
    `https://${MAPI_STORE_URL}/admin/api/${GQL_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) {
    if (res.status === 401) throw shopifyCreditError("Connexion Shopify requise.", "SHOPIFY_TOKEN_INVALID");
    if (res.status === 403) throw shopifyCreditError("Crédit Shopify indisponible.", "SHOPIFY_PERMISSION_INSUFFICIENT");
    throw new Error("Crédit Shopify indisponible.");
  }
  const json = await res.json();
  if (json.errors?.length) {
    const message = json.errors.map((e: any) => e.message).join("; ");
    if (/access denied|scope|permission/i.test(message)) {
      throw shopifyCreditError("Crédit Shopify indisponible.", "SHOPIFY_PERMISSION_INSUFFICIENT");
    }
    throw new Error("Crédit Shopify indisponible.");
  }
  return json.data as T;
}

function checkUserErrors(errs: Array<{ message: string; field?: string[] }>) {
  if (!errs?.length) return;
  const msg = errs[0].message ?? "Unknown Shopify error";
  if (/positive amount|greater than 0/i.test(msg)) {
    throw shopifyCreditError("Montant invalide.", "SHOPIFY_DEBIT_REJECTED");
  }
  if (/insufficient|exceed|balance/i.test(msg)) {
    throw shopifyCreditError("Crédit insuffisant.", "SHOPIFY_DEBIT_REJECTED");
  }
  if (/not found|doesn't exist/i.test(msg)) {
    throw shopifyCreditError("Rep Shopify introuvable.", "SHOPIFY_DEBIT_REJECTED");
  }
  if (/access denied|scope|permission/i.test(msg)) {
    throw shopifyCreditError("Crédit Shopify indisponible.", "SHOPIFY_DEBIT_REJECTED");
  }
  // A GraphQL userError proves Shopify rejected this mutation before it could
  // create a Store Credit transaction.
  throw shopifyCreditError(msg, "SHOPIFY_DEBIT_REJECTED");
}

function moneyInCents(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Montant Shopify invalide.");
  }
  const [whole, decimal = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((decimal + "00").slice(0, 2));
}

export function assertShopifyDebitProof(input: {
  beforeBalance: string;
  afterBalance: string;
  expectedAmount: string;
  expectedCurrency: string;
  expectedAccountId: string;
  transaction: { transactionId: string; accountId: string; amount: string; currencyCode: string };
}) {
  const { transaction } = input;
  if (!transaction?.transactionId || transaction.accountId !== input.expectedAccountId) {
    throw shopifyCreditError("Débit Shopify non confirmé.", "SHOPIFY_DEBIT_OUTCOME_UNKNOWN");
  }
  if (
    transaction.currencyCode !== input.expectedCurrency
    || moneyInCents(transaction.amount) !== -moneyInCents(input.expectedAmount)
  ) {
    throw shopifyCreditError("Montant du débit Shopify non confirmé.", "SHOPIFY_DEBIT_OUTCOME_UNKNOWN");
  }
  const expectedAfter = moneyInCents(input.beforeBalance) - moneyInCents(input.expectedAmount);
  if (expectedAfter < 0n || moneyInCents(input.afterBalance) !== expectedAfter) {
    throw shopifyCreditError("Solde Shopify après débit non confirmé.", "SHOPIFY_DEBIT_OUTCOME_UNKNOWN");
  }
}

export function isShopifyDebitOutcomeUnknown(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === "SHOPIFY_DEBIT_OUTCOME_UNKNOWN";
}

export function isShopifyDebitDefinitelyRejected(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === "SHOPIFY_DEBIT_REJECTED";
}

// ─── Rep CRUD ────────────────────────────────────────────────────────────────

export interface RepSummary {
  shopifyCustomerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  balances: Array<{ amount: string; currencyCode: string }>;
  createdAt: string;
  amountSpent: string;
  numberOfOrders: string;
}

export async function createRep(input: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ shopifyCustomerId: string }> {
  const data = await shopifyGQL<any>(
    `mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email firstName lastName tags }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email: input.email,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        tags: ["mapi-rep"],
      },
    }
  );
  checkUserErrors(data.customerCreate.userErrors);
  return { shopifyCustomerId: data.customerCreate.customer.id };
}

export async function getRepBalance(
  shopifyCustomerId: string
): Promise<Array<{ accountId: string; amount: string; currencyCode: string }>> {
  const data = await shopifyGQL<any>(
    `query repBalance($id: ID!) {
      customer(id: $id) {
        storeCreditAccounts(first: 5) {
          edges { node { id balance { amount currencyCode } } }
        }
      }
    }`,
    { id: shopifyCustomerId }
  );
  const accounts = data?.customer?.storeCreditAccounts?.edges ?? [];
  return accounts.map((e: any) => ({
    accountId: e.node.id,
    amount: e.node.balance.amount,
    currencyCode: e.node.balance.currencyCode,
  }));
}

export interface RepTransaction {
  id: string;
  accountId: string;
  type: "Credit" | "Debit" | "Expiration" | "DebitRevert";
  amount: string;
  currency: string;
  createdAt: string;
  expiresAt?: string | null;
  originOrderTransactionId?: string | null;
}

export async function getRepTransactionHistory(
  shopifyCustomerId: string,
  limit = 100
): Promise<RepTransaction[]> {
  const data = await shopifyGQL<any>(
    `query repHistory($id: ID!, $limit: Int!) {
      customer(id: $id) {
        storeCreditAccounts(first: 5) {
          edges {
            node {
              transactions(first: $limit, reverse: true, sortKey: CREATED_AT) {
                edges {
                  node {
                    id
                    __typename
                    origin { ... on OrderTransaction { id } }
                    ... on StoreCreditAccountCreditTransaction {
                      amount { amount currencyCode }
                      createdAt expiresAt
                    }
                    ... on StoreCreditAccountDebitTransaction {
                      amount { amount currencyCode }
                      createdAt
                    }
                    ... on StoreCreditAccountExpirationTransaction {
                      amount { amount currencyCode }
                      createdAt
                    }
                    ... on StoreCreditAccountDebitRevertTransaction {
                      amount { amount currencyCode }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { id: shopifyCustomerId, limit }
  );
  const accounts = data?.customer?.storeCreditAccounts?.edges ?? [];
  const txns: RepTransaction[] = [];
  for (const acct of accounts) {
    for (const edge of acct.node.transactions.edges) {
      const n = edge.node;
      const typeMap: Record<string, RepTransaction["type"]> = {
        StoreCreditAccountCreditTransaction: "Credit",
        StoreCreditAccountDebitTransaction: "Debit",
        StoreCreditAccountExpirationTransaction: "Expiration",
        StoreCreditAccountDebitRevertTransaction: "DebitRevert",
      };
      txns.push({
        id: n.id,
        accountId: acct.node.id,
        type: typeMap[n.__typename] ?? "Credit",
        amount: n.amount.amount,
        currency: n.amount.currencyCode,
        createdAt: n.createdAt,
        expiresAt: n.expiresAt ?? null,
        originOrderTransactionId: n.origin?.id ?? null,
      });
    }
  }
  return txns;
}

export async function listRepsFromShopify(cursor?: string): Promise<{
  reps: RepSummary[];
  nextCursor?: string;
}> {
  const data = await shopifyGQL<any>(
    `query listReps($cursor: String) {
      customers(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id email firstName lastName createdAt
            amountSpent { amount currencyCode }
            numberOfOrders
            storeCreditAccounts(first: 5) {
              edges { node { id balance { amount currencyCode } } }
            }
          }
        }
      }
    }`,
    { cursor: cursor ?? null }
  );
  const reps = (data.customers.edges ?? []).map((e: any) => ({
    shopifyCustomerId: e.node.id,
    email: e.node.email,
    firstName: e.node.firstName ?? null,
    lastName: e.node.lastName ?? null,
    createdAt: e.node.createdAt,
    amountSpent: e.node.amountSpent?.amount ?? "0",
    numberOfOrders: String(e.node.numberOfOrders ?? 0),
    balances: (e.node.storeCreditAccounts?.edges ?? []).map((ae: any) => ({
      amount: ae.node.balance.amount,
      currencyCode: ae.node.balance.currencyCode,
    })),
  }));
  const pageInfo = data.customers.pageInfo;
  return {
    reps,
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
  };
}

// ─── Credit / Debit ───────────────────────────────────────────────────────────

export async function creditRep(input: {
  shopifyCustomerId: string;
  shopifyStoreCreditAccountId?: string;
  amount: string;
  currencyCode?: string;
  expiresAt?: string;
}): Promise<{ transactionId: string; accountId: string; newBalance: { amount: string; currencyCode: string } }> {
  const creditInput: any = {
    creditAmount: { amount: input.amount, currencyCode: input.currencyCode ?? "CAD" },
  };
  if (input.expiresAt) creditInput.expiresAt = input.expiresAt;

  const data = await shopifyGQL<any>(
    `mutation credit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
      storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
        storeCreditAccountTransaction {
          id
          amount { amount currencyCode }
          account { id balance { amount currencyCode } }
        }
        userErrors { message field }
      }
    }`,
    { id: input.shopifyStoreCreditAccountId ?? input.shopifyCustomerId, creditInput }
  );
  checkUserErrors(data.storeCreditAccountCredit.userErrors);
  const txn = data.storeCreditAccountCredit.storeCreditAccountTransaction;
  return {
    transactionId: txn.id,
    accountId: txn.account.id,
    newBalance: txn.account.balance,
  };
}

export async function debitRep(input: {
  shopifyCustomerId: string;
  shopifyStoreCreditAccountId?: string;
  amount: string;
  currencyCode?: string;
}): Promise<{
  transactionId: string;
  accountId: string;
  amount: string;
  currencyCode: string;
  newBalance: { amount: string; currencyCode: string };
}> {
  const data = await shopifyGQL<any>(
    `mutation debit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
      storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
        storeCreditAccountTransaction {
          id
          amount { amount currencyCode }
          account { id balance { amount currencyCode } }
        }
        userErrors { message field }
      }
    }`,
    {
      id: input.shopifyStoreCreditAccountId ?? input.shopifyCustomerId,
      debitInput: {
        debitAmount: { amount: input.amount, currencyCode: input.currencyCode ?? "CAD" },
      },
    }
  );
  checkUserErrors(data.storeCreditAccountDebit.userErrors);
  const txn = data.storeCreditAccountDebit.storeCreditAccountTransaction;
  if (!txn?.id || !txn?.account?.id || !txn?.amount?.amount || !txn?.amount?.currencyCode) {
    throw shopifyCreditError("Débit Shopify non confirmé.", "SHOPIFY_DEBIT_OUTCOME_UNKNOWN");
  }
  return {
    transactionId: txn.id,
    accountId: txn.account.id,
    amount: txn.amount.amount,
    currencyCode: txn.amount.currencyCode,
    newBalance: txn.account.balance,
  };
}

// ─── Monthly Renewal (RESET) ─────────────────────────────────────────────────

export async function renewRepBudget(input: {
  shopifyCustomerId: string;
  monthlyBudgetAmount: string;
  currencyCode?: string;
}): Promise<{ newBalance: { amount: string; currencyCode: string } }> {
  const currency = input.currencyCode ?? "CAD";

  // Step 1: get current balance
  const balances = await getRepBalance(input.shopifyCustomerId);
  const cadBalance = balances.find((b) => b.currencyCode === currency);
  const currentAmount = parseFloat(cadBalance?.amount ?? "0");

  // Step 2: debit to zero if positive
  if (currentAmount > 0.005) {
    await debitRep({
      shopifyCustomerId: input.shopifyCustomerId,
      amount: currentAmount.toFixed(2),
      currencyCode: currency,
    });
  }

  // Step 3: credit new budget
  const result = await creditRep({
    shopifyCustomerId: input.shopifyCustomerId,
    amount: parseFloat(input.monthlyBudgetAmount).toFixed(2),
    currencyCode: currency,
  });

  return { newBalance: result.newBalance };
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivateRepInShopify(shopifyCustomerId: string): Promise<void> {
  // Step 1: debit balance to zero
  const balances = await getRepBalance(shopifyCustomerId);
  for (const b of balances) {
    const amt = parseFloat(b.amount);
    if (amt > 0.005) {
      await debitRep({ shopifyCustomerId, amount: amt.toFixed(2), currencyCode: b.currencyCode });
    }
  }

  // Step 2: update tags — remove "mapi-rep", add "mapi-rep-archived"
  const data = await shopifyGQL<any>(
    `mutation updateCustomer($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer { id tags }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: shopifyCustomerId,
        tags: ["mapi-rep-archived"],
      },
    }
  );
  checkUserErrors(data.customerUpdate.userErrors);
}
