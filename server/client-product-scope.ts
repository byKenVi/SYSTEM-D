import type { Contact } from "@shared/schema";

type ClientIdentity = Pick<Contact, "id" | "companyName" | "zohoCrmAccountId">;

function normalized(value: string | null): string | null {
  const result = value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-CA");
  return result || null;
}

/**
 * Resolves the contacts that belong to the same client organization.
 *
 * Zoho account IDs are authoritative. The company-name fallback exists for
 * legacy integration-owner contacts that predate zoho_crm_account_id. A
 * contact carrying a different Zoho account ID is never admitted by name.
 */
export function resolveClientProductContactIds(
  client: ClientIdentity,
  contacts: readonly ClientIdentity[],
): number[] {
  const clientAccountId = normalized(client.zohoCrmAccountId);
  const clientCompanyName = normalized(client.companyName);

  if (!clientAccountId && !clientCompanyName) return [client.id];

  const sameCompany = clientCompanyName
    ? contacts.filter((contact) => normalized(contact.companyName) === clientCompanyName)
    : [];

  if (clientAccountId) {
    return Array.from(new Set([
      client.id,
      ...contacts
        .filter((contact) => normalized(contact.zohoCrmAccountId) === clientAccountId)
        .map((contact) => contact.id),
      ...sameCompany
        .filter((contact) => {
          const accountId = normalized(contact.zohoCrmAccountId);
          return accountId === null || accountId === clientAccountId;
        })
        .map((contact) => contact.id),
    ]));
  }

  const companyAccountIds = new Set(
    sameCompany
      .map((contact) => normalized(contact.zohoCrmAccountId))
      .filter((accountId): accountId is string => accountId !== null),
  );

  // Ambiguous legacy data must fail closed instead of joining two Zoho accounts.
  if (companyAccountIds.size > 1) return [client.id];

  return Array.from(new Set([client.id, ...sameCompany.map((contact) => contact.id)]));
}
