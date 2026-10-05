/** Collecte les erreurs de validation client avant soumission d'un formulaire métier. */
export function collectFormSubmitErrors(formType: string | undefined, formData: unknown): string[] {
  const errors: string[] = [];
  if (!formData) {
    errors.push("Aucune donnée à soumettre.");
    return errors;
  }

  const checkPositive = (val: unknown, label: string): void => {
    if (val === undefined || val === null || val === "") return;
    const n = Number(val);
    if (Number.isNaN(n) || n <= 0) errors.push(`${label} doit être un nombre positif.`);
  };

  const data = formData as Record<string, unknown>;

  if (formType === "tri") {
    if (!String(data.client ?? "").trim()) errors.push("Le champ Client est requis.");
    if (!String(data.nomProjet ?? "").trim()) errors.push("Le champ Nom du projet est requis.");
    if (!String(data.codePiece ?? "").trim()) errors.push("Le champ Code pièce est requis.");
    checkPositive(data.uniteParBoite, "Le nombre d'unités par boîte");
    checkPositive(data.besoinQuotidien, "Le besoin quotidien");
    checkPositive(data.cycleTri, "La durée du cycle");
  }

  if (formType === "inspection") {
    if (!String(data.customer ?? "").trim()) errors.push("Le champ Client est requis.");
    if (!String(data.partNumber ?? "").trim()) errors.push("Le champ Numéro de pièce est requis.");
    const pct = data.customSamplePercent;
    if (pct !== undefined && pct !== null && pct !== "") {
      const n = Number(pct);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        errors.push("Le pourcentage d'échantillonnage doit être compris entre 0 et 100.");
      }
    }
  }

  if (formType === "entreposage") {
    checkPositive(data.longueur, "La longueur");
    checkPositive(data.largeur, "La largeur");
    checkPositive(data.hauteur, "La hauteur");
    checkPositive(data.poids, "Le poids");
    checkPositive(data.paletteNbUnites, "Le nombre d'unités par palette");
  }

  if (formType === "livraison") {
    checkPositive(data.nbUnites, "Le nombre d'unités");
    checkPositive(data.poidsTotal, "Le poids total");
  }

  return errors;
}
