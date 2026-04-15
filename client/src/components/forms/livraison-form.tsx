import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";

interface LivraisonFormData {
  typeMarchandise: string;
  nbUnites: string;
  poidsTotal: string;
  unitePoids: string;
  destinationType: string;
  hasTailgate: boolean;
  hasRendezVous: boolean;
  rvDate: string;
  rvTime: string;
  destinations: { adresse: string; contact: string; telephone: string; notes: string }[];
  modeBilling: string;
  documentation: string[];
  instructionsSpeciales: string;
  reference: string;
}

interface LivraisonFormProps {
  data: LivraisonFormData;
  onChange: (data: LivraisonFormData) => void;
  disabled?: boolean;
}

const MERCHANDISE_OPTIONS = [
  "Palette",
  "Boîte",
  "Caisse",
  "Enveloppe",
  "Colis",
  "Vrac",
  "Autre",
];

const DOCUMENTATION_OPTIONS = [
  "Bon de livraison",
  "Facture",
  "Bordereau d'expédition",
  "Preuve de livraison",
  "Autre",
];

const defaultLivraisonData: LivraisonFormData = {
  typeMarchandise: "",
  nbUnites: "",
  poidsTotal: "",
  unitePoids: "kg",
  destinationType: "local",
  hasTailgate: false,
  hasRendezVous: false,
  rvDate: "",
  rvTime: "",
  destinations: [{ adresse: "", contact: "", telephone: "", notes: "" }],
  modeBilling: "forfaitaire",
  documentation: [],
  instructionsSpeciales: "",
  reference: "",
};

export { defaultLivraisonData };
export type { LivraisonFormData };

export function LivraisonForm({ data, onChange, disabled }: LivraisonFormProps) {
  const d = { ...defaultLivraisonData, ...data };

  function update(partial: Partial<LivraisonFormData>) {
    onChange({ ...d, ...partial });
  }

  function toggleDocumentation(item: string) {
    const arr = d.documentation.includes(item)
      ? d.documentation.filter((t) => t !== item)
      : [...d.documentation, item];
    update({ documentation: arr });
  }

  function updateDestination(i: number, field: string, value: string) {
    const destinations = [...d.destinations];
    destinations[i] = { ...destinations[i], [field]: value };
    update({ destinations });
  }

  function addDestination() {
    update({ destinations: [...d.destinations, { adresse: "", contact: "", telephone: "", notes: "" }] });
  }

  function removeDestination(i: number) {
    if (d.destinations.length <= 1) return;
    update({ destinations: d.destinations.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">A. Marchandise</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type de marchandise</Label>
            <Select value={d.typeMarchandise} onValueChange={(v) => update({ typeMarchandise: v })} disabled={disabled}>
              <SelectTrigger data-testid="select-liv-marchandise">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {MERCHANDISE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre d'unités</Label>
              <Input type="number" value={d.nbUnites} onChange={(e) => update({ nbUnites: e.target.value })} disabled={disabled} data-testid="input-liv-nb-unites" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Poids total</Label>
              <Input type="number" value={d.poidsTotal} onChange={(e) => update({ poidsTotal: e.target.value })} disabled={disabled} data-testid="input-liv-poids" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unité</Label>
              <Select value={d.unitePoids} onValueChange={(v) => update({ unitePoids: v })} disabled={disabled}>
                <SelectTrigger data-testid="select-liv-poids-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="lbs">lbs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Référence / # commande</Label>
            <Input value={d.reference} onChange={(e) => update({ reference: e.target.value })} disabled={disabled} placeholder="Numéro de référence" data-testid="input-liv-reference" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">B. Destination</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type de destination</Label>
            <RadioGroup value={d.destinationType} onValueChange={(v) => update({ destinationType: v })} disabled={disabled} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="local" id="liv-dest-local" />
                <Label htmlFor="liv-dest-local" className="text-sm">Local</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="longue_distance" id="liv-dest-ld" />
                <Label htmlFor="liv-dest-ld" className="text-sm">Longue distance</Label>
              </div>
            </RadioGroup>
          </div>

          {d.destinationType === "longue_distance" && (
            <div className="flex items-center gap-2">
              <Checkbox checked={d.hasTailgate} onCheckedChange={(v) => update({ hasTailgate: !!v })} disabled={disabled} data-testid="check-liv-tailgate" />
              <Label className="text-sm">Tailgate requis</Label>
            </div>
          )}

          <div className="space-y-3 p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox checked={d.hasRendezVous} onCheckedChange={(v) => update({ hasRendezVous: !!v })} disabled={disabled} data-testid="check-liv-rv" />
              <Label className="text-sm">Rendez-vous</Label>
            </div>
            {d.hasRendezVous && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={d.rvDate} onChange={(e) => update({ rvDate: e.target.value })} disabled={disabled} data-testid="input-liv-rv-date" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Heure</Label>
                  <Input type="time" value={d.rvTime} onChange={(e) => update({ rvTime: e.target.value })} disabled={disabled} data-testid="input-liv-rv-time" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Destination(s)</Label>
            {d.destinations.map((dest, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Destination {i + 1}</span>
                  {!disabled && d.destinations.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDestination(i)} data-testid={`button-liv-remove-dest-${i}`}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Input value={dest.adresse} onChange={(e) => updateDestination(i, "adresse", e.target.value)} disabled={disabled} placeholder="Adresse complète" data-testid={`input-liv-dest-adresse-${i}`} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={dest.contact} onChange={(e) => updateDestination(i, "contact", e.target.value)} disabled={disabled} placeholder="Nom du contact" className="text-sm" data-testid={`input-liv-dest-contact-${i}`} />
                  <Input value={dest.telephone} onChange={(e) => updateDestination(i, "telephone", e.target.value)} disabled={disabled} placeholder="Téléphone" className="text-sm" data-testid={`input-liv-dest-tel-${i}`} />
                </div>
                <Input value={dest.notes} onChange={(e) => updateDestination(i, "notes", e.target.value)} disabled={disabled} placeholder="Notes (optionnel)" className="text-xs" data-testid={`input-liv-dest-notes-${i}`} />
              </div>
            ))}
            {!disabled && (
              <Button type="button" variant="outline" size="sm" onClick={addDestination} data-testid="button-liv-add-dest">
                <Plus className="h-3 w-3 mr-1" />
                Ajouter une destination
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">C. Facturation & Documentation</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mode de facturation</Label>
            <RadioGroup value={d.modeBilling} onValueChange={(v) => update({ modeBilling: v })} disabled={disabled} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="forfaitaire" id="liv-bill-forfait" />
                <Label htmlFor="liv-bill-forfait" className="text-sm">Forfaitaire</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="horaire" id="liv-bill-horaire" />
                <Label htmlFor="liv-bill-horaire" className="text-sm">À l'heure</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="unite" id="liv-bill-unite" />
                <Label htmlFor="liv-bill-unite" className="text-sm">À l'unité</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Documentation requise</Label>
            <div className="grid grid-cols-2 gap-2">
              {DOCUMENTATION_OPTIONS.map((doc) => (
                <div key={doc} className="flex items-center gap-2">
                  <Checkbox checked={d.documentation.includes(doc)} onCheckedChange={() => !disabled && toggleDocumentation(doc)} disabled={disabled} data-testid={`check-liv-doc-${doc.toLowerCase().replace(/\s+/g, "-")}`} />
                  <Label className="text-sm">{doc}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Instructions spéciales</Label>
            <Textarea value={d.instructionsSpeciales} onChange={(e) => update({ instructionsSpeciales: e.target.value })} disabled={disabled} rows={3} placeholder="Instructions additionnelles..." data-testid="input-liv-instructions" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
