export type BooksOrganization = {
  organization_id: string;
  name: string;
  currency_code?: string;
};

export class BooksConfigurationError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

export function chooseBooksOrganization(
  organizations: BooksOrganization[],
  inventoryId?: string | null,
  requestedId?: string,
): BooksOrganization {
  if (requestedId) {
    const selected = organizations.find(org => org.organization_id === requestedId);
    if (!selected) throw new BooksConfigurationError("BOOKS_ORGANIZATION_NOT_FOUND", "Cette organisation n’est pas accessible dans Zoho Books.");
    return selected;
  }
  const matching = organizations.find(org => org.organization_id === inventoryId);
  if (matching) return matching;
  if (organizations.length === 1) return organizations[0];
  throw new BooksConfigurationError("BOOKS_ORGANIZATION_REQUIRED", organizations.length
    ? "Plusieurs organisations Zoho Books sont disponibles. Choisissez l’organisation à utiliser."
    : "Aucune organisation Zoho Books accessible. Vérifiez votre compte Zoho.");
}
