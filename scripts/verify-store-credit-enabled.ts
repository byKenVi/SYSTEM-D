const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET env vars.");
  process.exit(1);
}

const GQL_URL = `https://${SHOP}.myshopify.com/admin/api/2026-04/graphql.json`;
const TOKEN_URL = `https://${SHOP}.myshopify.com/admin/oauth/access_token`;

async function getToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${t}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function gql(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GraphQL HTTP error (${res.status}): ${t}`);
  }
  const json = await res.json() as { data: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
  return json.data as Record<string, unknown>;
}

async function main() {
  console.log("Fetching Shopify access token...");
  const token = await getToken();
  console.log("Token obtained.");

  const TEST_EMAIL = "storecredit-test@systemd-internal.test";

  console.log(`\nLooking for test customer (${TEST_EMAIL})...`);
  const searchData = await gql(token, `
    query findCustomer($q: String!) {
      customers(first: 1, query: $q) {
        edges { node { id email } }
      }
    }
  `, { q: `email:${TEST_EMAIL}` }) as { customers: { edges: Array<{ node: { id: string; email: string } }> } };

  let customerId: string;
  if (searchData.customers.edges.length > 0) {
    customerId = searchData.customers.edges[0].node.id;
    console.log(`Found existing test customer: ${customerId}`);
  } else {
    console.log("Creating test customer...");
    const createData = await gql(token, `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id email }
          userErrors { field message }
        }
      }
    `, { input: { email: TEST_EMAIL, firstName: "StoreCredit", lastName: "Test" } }) as {
      customerCreate: { customer: { id: string } | null; userErrors: Array<{ field: string; message: string }> }
    };
    if (createData.customerCreate.userErrors.length > 0) {
      throw new Error(`Failed to create test customer: ${createData.customerCreate.userErrors.map((e) => e.message).join(", ")}`);
    }
    customerId = createData.customerCreate.customer!.id;
    console.log(`Created test customer: ${customerId}`);
  }

  console.log("\nAttempting storeCreditAccountCredit for $0.01 CAD...");
  let newBalance: string;
  let accountId: string;
  try {
    const creditData = await gql(token, `
      mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            amount { amount currencyCode }
            account { id balance { amount currencyCode } }
          }
          userErrors { message field }
        }
      }
    `, {
      id: customerId,
      creditInput: { creditAmount: { amount: "0.01", currencyCode: "CAD" } },
    }) as {
      storeCreditAccountCredit: {
        storeCreditAccountTransaction: {
          amount: { amount: string; currencyCode: string };
          account: { id: string; balance: { amount: string; currencyCode: string } };
        } | null;
        userErrors: Array<{ message: string }>;
      };
    };

    if (creditData.storeCreditAccountCredit.userErrors.length > 0) {
      const msg = creditData.storeCreditAccountCredit.userErrors.map((e) => e.message).join(", ");
      const planMsg = /plan|not supported|plus|upgrade/i.test(msg);
      if (planMsg) {
        console.error(`\n❌ Store Credit NOT enabled on this Shopify plan.\nShopify says: ${msg}`);
        console.error("You need to upgrade the Shopify plan or contact Shopify support.");
        process.exit(1);
      }
      throw new Error(`Credit userErrors: ${msg}`);
    }

    const txn = creditData.storeCreditAccountCredit.storeCreditAccountTransaction!;
    newBalance = `${txn.account.balance.amount} ${txn.account.balance.currencyCode}`;
    accountId = txn.account.id;
    console.log(`✅ Store Credit ENABLED on this Shopify plan!`);
    console.log(`   New balance after $0.01 credit: ${newBalance}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/plan|not supported|plus|upgrade/i.test(msg)) {
      console.error(`\n❌ Store Credit NOT enabled on this Shopify plan.\n${msg}`);
      process.exit(1);
    }
    throw err;
  }

  console.log("\nCleaning up: debiting $0.01 CAD...");
  const debitData = await gql(token, `
    mutation storeCreditAccountDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
      storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
        storeCreditAccountTransaction {
          amount { amount currencyCode }
          account { id balance { amount currencyCode } }
        }
        userErrors { field message }
      }
    }
  `, {
    id: customerId,
    debitInput: { debitAmount: { amount: "0.01", currencyCode: "CAD" } },
  }) as {
    storeCreditAccountDebit: {
      storeCreditAccountTransaction: { account: { balance: { amount: string; currencyCode: string } } } | null;
      userErrors: Array<{ message: string }>;
    };
  };

  if (debitData.storeCreditAccountDebit.userErrors.length > 0) {
    console.warn(`Cleanup debit failed (non-fatal): ${debitData.storeCreditAccountDebit.userErrors.map((e) => e.message).join(", ")}`);
  } else {
    const bal = debitData.storeCreditAccountDebit.storeCreditAccountTransaction!.account.balance;
    console.log(`Cleaned up. Balance after debit: ${bal.amount} ${bal.currencyCode}`);
  }

  console.log("\n✅ Plan check PASSED. You can proceed with the MAPI Rep Budgets feature.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Plan check FAILED with unexpected error:", err.message || err);
  process.exit(1);
});
