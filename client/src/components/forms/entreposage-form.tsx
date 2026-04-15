import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, ChevronDown } from "lucide-react";
import { useState } from "react";

interface EntreposageFormData {
  natureProduit: string;
  longueur: string;
  largeur: string;
  hauteur: string;
  poids: string;
  uniteDimension: string;
  unitePoids: string;
  typeEmballage: string;
  paletteDimensions: string;
  paletteNbUnites: string;
  paletteHauteur: string;
  paletteType: string;
  boiteFormat: string;
  boiteNbUnites: string;
  vracDescription: string;
  sacFormat: string;
  sacNbUnites: string;
  hasBinRack: boolean;
  binSize: string;
  rackSize: string;
  hasLivraison: boolean;
  typeMarchandise: string[];
  destinationType: string;
  hasTailgate: boolean;
  hasRendezVous: boolean;
  rvDate: string;
  rvTime: string;
  adresses: { adresse: string; notes: string }[];
  modeBilling: string;
  documentation: string[];
  hasConditionnement: boolean;
  conditionnementDescription: string;
  hasKitting: boolean;
  kittingDescription: string;
  notes: string;
}

interface EntreposageFormProps {
  data: EntreposageFormData;
  onChange: (data: EntreposageFormData) => void;
  disabled?: boolean;
}

const PRODUCT_TYPES = [
  "Alimentaire",
  "Cosmétique",
  "Électronique",
  "Textile",
  "Industriel",
  "Pharmaceutique",
  "Matière première",
  "Produit fini",
  "Autre",
];

const MERCHANDISE_TYPES = [
  "Palette",
  "Boîte",
  "Caisse",
  "Vrac",
  "Sac",
  "Rouleau",
  "Autre",
];

const DOCUMENTATION_OPTIONS = [
  "Bon de livraison",
  "Facture",
  "Bordereau d'expédition",
  "Certificat d'analyse",
  "Fiche technique",
  "Autre",
];

const defaultEntreposageData: EntreposageFormData = {
  natureProduit: "",
  longueur: "",
  largeur: "",
  hauteur: "",
  poids: "",
  uniteDimension: "cm",
  unitePoids: "kg",
  typeEmballage: "",
  paletteDimensions: "",
  paletteNbUnites: "",
  paletteHauteur: "",
  paletteType: "standard",
  boiteFormat: "",
  boiteNbUnites: "",
  vracDescription: "",
  sacFormat: "",
  sacNbUnites: "",
  hasBinRack: false,
  binSize: "",
  rackSize: "",
  hasLivraison: false,
  typeMarchandise: [],
  destinationType: "local",
  hasTailgate: false,
  hasRendezVous: false,
  rvDate: "",
  rvTime: "",
  adresses: [{ adresse: "", notes: "" }],
  modeBilling: "forfaitaire",
  documentation: [],
  hasConditionnement: false,
  conditionnementDescription: "",
  hasKitting: false,
  kittingDescription: "",
  notes: "",
};

export { defaultEntreposageData };
export type { EntreposageFormData };

export function EntreposageForm({ data, onChange, disabled }: EntreposageFormProps) {
  const d = { ...defaultEntreposageData, ...data };

  function update(partial: Partial<EntreposageFormData>) {
    onChange({ ...d, ...partial });
  }

  function toggleMarchandise(item: string) {
    const arr = d.typeMarchandise.includes(item)
      ? d.typeMarchandise.filter((t) => t !== item)
      : [...d.typeMarchandise, item];
    update({ typeMarchandise: arr });
  }

  function toggleDocumentation(item: string) {
    const arr = d.documentation.includes(item)
      ? d.documentation.filter((t) => t !== item)
      : [...d.documentation, item];
    update({ documentation: arr });
  }

  function updateAdresse(i: number, field: string, value: string) {
    const adresses = [...d.adresses];
    adresses[i] = { ...adresses[i], [field]: value };
    update({ adresses });
  }

  function addAdresse() {
    update({ adresses: [...d.adresses, { adresse: "", notes: "" }] });
  }

  function removeAdresse(i: number) {
    if (d.adresses.length <= 1) return;
    update({ adresses: d.adresses.filter((_, idx) => idx !== i) });
  }

  const [openA, setOpenA] = useState(true);
  const [openB, setOpenB] = useState(true);
  const [openNotes, setOpenNotes] = useState(true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setOpenA((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">A. Entreposage</h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openA ? "" : "-rotate-90"}`} />
          </div>
        </CardHeader>
        {openA && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nature du produit</Label>
            <Select value={d.natureProduit} onValueChange={(v) => update({ natureProduit: v })} disabled={disabled}>
              <SelectTrigger data-testid="select-ent-nature">
                <SelectValue placeholder="Sélectionner le type..." />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Dimensions</Label>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Longueur</Label>
                <Input type="number" value={d.longueur} onChange={(e) => update({ longueur: e.target.value })} disabled={disabled} className="w-20" data-testid="input-ent-longueur" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Largeur</Label>
                <Input type="number" value={d.largeur} onChange={(e) => update({ largeur: e.target.value })} disabled={disabled} className="w-20" data-testid="input-ent-largeur" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hauteur</Label>
                <Input type="number" value={d.hauteur} onChange={(e) => update({ hauteur: e.target.value })} disabled={disabled} className="w-20" data-testid="input-ent-hauteur" />
              </div>
              <Select value={d.uniteDimension} onValueChange={(v) => update({ uniteDimension: v })} disabled={disabled}>
                <SelectTrigger className="w-20" data-testid="select-ent-dim-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="po">po</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Poids</Label>
              <Input type="number" value={d.poids} onChange={(e) => update({ poids: e.target.value })} disabled={disabled} className="w-24" data-testid="input-ent-poids" />
            </div>
            <Select value={d.unitePoids} onValueChange={(v) => update({ unitePoids: v })} disabled={disabled}>
              <SelectTrigger className="w-20" data-testid="select-ent-poids-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="lbs">lbs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type d'emballage</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["Palette", "Boîte", "Vrac", "Sac"].map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={d.typeEmballage === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => !disabled && update({ typeEmballage: type })}
                  disabled={disabled}
                  data-testid={`button-ent-emballage-${type.toLowerCase()}`}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {d.typeEmballage === "Palette" && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
              <h4 className="text-sm font-medium">Détails palette</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Dimensions palette</Label>
                  <Input value={d.paletteDimensions} onChange={(e) => update({ paletteDimensions: e.target.value })} disabled={disabled} placeholder="Ex: 48x40" data-testid="input-ent-palette-dim" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nb unités / palette</Label>
                  <Input type="number" value={d.paletteNbUnites} onChange={(e) => update({ paletteNbUnites: e.target.value })} disabled={disabled} data-testid="input-ent-palette-nb" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hauteur palette</Label>
                  <Input value={d.paletteHauteur} onChange={(e) => update({ paletteHauteur: e.target.value })} disabled={disabled} placeholder="Ex: 60 po" data-testid="input-ent-palette-h" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type palette</Label>
                  <Select value={d.paletteType} onValueChange={(v) => update({ paletteType: v })} disabled={disabled}>
                    <SelectTrigger data-testid="select-ent-palette-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="euro">Euro</SelectItem>
                      <SelectItem value="custom">Sur mesure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {d.typeEmballage === "Boîte" && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
              <h4 className="text-sm font-medium">Détails boîte</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Format</Label>
                  <Input value={d.boiteFormat} onChange={(e) => update({ boiteFormat: e.target.value })} disabled={disabled} placeholder="Ex: 12x8x6" data-testid="input-ent-boite-format" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nb unités / boîte</Label>
                  <Input type="number" value={d.boiteNbUnites} onChange={(e) => update({ boiteNbUnites: e.target.value })} disabled={disabled} data-testid="input-ent-boite-nb" />
                </div>
              </div>
            </div>
          )}

          {d.typeEmballage === "Vrac" && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
              <h4 className="text-sm font-medium">Détails vrac</h4>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={d.vracDescription} onChange={(e) => update({ vracDescription: e.target.value })} disabled={disabled} rows={2} data-testid="input-ent-vrac-desc" />
              </div>
            </div>
          )}

          {d.typeEmballage === "Sac" && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
              <h4 className="text-sm font-medium">Détails sac</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Format</Label>
                  <Input value={d.sacFormat} onChange={(e) => update({ sacFormat: e.target.value })} disabled={disabled} data-testid="input-ent-sac-format" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nb unités / sac</Label>
                  <Input type="number" value={d.sacNbUnites} onChange={(e) => update({ sacNbUnites: e.target.value })} disabled={disabled} data-testid="input-ent-sac-nb" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox checked={d.hasBinRack} onCheckedChange={(v) => update({ hasBinRack: !!v })} disabled={disabled} data-testid="check-ent-binrack" />
              <Label>Bin / Rack requis</Label>
            </div>
            {d.hasBinRack && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Taille Bin</Label>
                  <Input value={d.binSize} onChange={(e) => update({ binSize: e.target.value })} disabled={disabled} data-testid="input-ent-bin-size" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Taille Rack</Label>
                  <Input value={d.rackSize} onChange={(e) => update({ rackSize: e.target.value })} disabled={disabled} data-testid="input-ent-rack-size" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setOpenB((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">B. Service de livraison</h3>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Label className="text-sm">Activer</Label>
              <Switch checked={d.hasLivraison} onCheckedChange={(v) => update({ hasLivraison: v })} disabled={disabled} data-testid="switch-ent-livraison" />
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ml-1 ${openB ? "" : "-rotate-90"}`} />
            </div>
          </div>
        </CardHeader>
        {openB && d.hasLivraison && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Type de marchandise</Label>
              <div className="flex flex-wrap gap-2">
                {MERCHANDISE_TYPES.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={d.typeMarchandise.includes(item) ? "default" : "outline"}
                    size="sm"
                    onClick={() => !disabled && toggleMarchandise(item)}
                    disabled={disabled}
                    data-testid={`button-ent-merch-${item.toLowerCase()}`}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type de destination</Label>
              <RadioGroup value={d.destinationType} onValueChange={(v) => update({ destinationType: v })} disabled={disabled} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="local" id="dest-local" />
                  <Label htmlFor="dest-local" className="text-sm">Local</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="longue_distance" id="dest-ld" />
                  <Label htmlFor="dest-ld" className="text-sm">Longue distance</Label>
                </div>
              </RadioGroup>
            </div>

            {d.destinationType === "longue_distance" && (
              <div className="flex items-center gap-2">
                <Checkbox checked={d.hasTailgate} onCheckedChange={(v) => update({ hasTailgate: !!v })} disabled={disabled} data-testid="check-ent-tailgate" />
                <Label className="text-sm">Tailgate requis</Label>
              </div>
            )}

            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox checked={d.hasRendezVous} onCheckedChange={(v) => update({ hasRendezVous: !!v })} disabled={disabled} data-testid="check-ent-rv" />
                <Label className="text-sm">Rendez-vous</Label>
              </div>
              {d.hasRendezVous && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={d.rvDate} onChange={(e) => update({ rvDate: e.target.value })} disabled={disabled} data-testid="input-ent-rv-date" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Heure</Label>
                    <Input type="time" value={d.rvTime} onChange={(e) => update({ rvTime: e.target.value })} disabled={disabled} data-testid="input-ent-rv-time" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Adresse(s) de destination</Label>
              {d.adresses.map((a, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input value={a.adresse} onChange={(e) => updateAdresse(i, "adresse", e.target.value)} disabled={disabled} placeholder="Adresse complète" data-testid={`input-ent-adresse-${i}`} />
                    <Input value={a.notes} onChange={(e) => updateAdresse(i, "notes", e.target.value)} disabled={disabled} placeholder="Notes (optionnel)" className="text-xs" data-testid={`input-ent-adresse-notes-${i}`} />
                  </div>
                  {!disabled && d.adresses.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mt-0.5" onClick={() => removeAdresse(i)} data-testid={`button-ent-remove-adresse-${i}`}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {!disabled && (
                <Button type="button" variant="outline" size="sm" onClick={addAdresse} data-testid="button-ent-add-adresse">
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter une adresse
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Mode de facturation</Label>
              <RadioGroup value={d.modeBilling} onValueChange={(v) => update({ modeBilling: v })} disabled={disabled} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="forfaitaire" id="bill-forfait" />
                  <Label htmlFor="bill-forfait" className="text-sm">Forfaitaire</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="horaire" id="bill-horaire" />
                  <Label htmlFor="bill-horaire" className="text-sm">À l'heure</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="unite" id="bill-unite" />
                  <Label htmlFor="bill-unite" className="text-sm">À l'unité</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Documentation requise</Label>
              <div className="grid grid-cols-2 gap-2">
                {DOCUMENTATION_OPTIONS.map((doc) => (
                  <div key={doc} className="flex items-center gap-2">
                    <Checkbox checked={d.documentation.includes(doc)} onCheckedChange={() => !disabled && toggleDocumentation(doc)} disabled={disabled} data-testid={`check-ent-doc-${doc.toLowerCase().replace(/\s+/g, "-")}`} />
                    <Label className="text-sm">{doc}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox checked={d.hasConditionnement} onCheckedChange={(v) => update({ hasConditionnement: !!v })} disabled={disabled} data-testid="check-ent-conditionnement" />
                <Label className="text-sm">Conditionnement requis</Label>
              </div>
              {d.hasConditionnement && (
                <Textarea value={d.conditionnementDescription} onChange={(e) => update({ conditionnementDescription: e.target.value })} disabled={disabled} rows={2} placeholder="Décrire le conditionnement..." data-testid="input-ent-conditionnement-desc" />
              )}
            </div>

            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox checked={d.hasKitting} onCheckedChange={(v) => update({ hasKitting: !!v })} disabled={disabled} data-testid="check-ent-kitting" />
                <Label className="text-sm">Kitting requis</Label>
              </div>
              {d.hasKitting && (
                <Textarea value={d.kittingDescription} onChange={(e) => update({ kittingDescription: e.target.value })} disabled={disabled} rows={2} placeholder="Décrire le kitting..." data-testid="input-ent-kitting-desc" />
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setOpenNotes((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Notes</h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openNotes ? "" : "-rotate-90"}`} />
          </div>
        </CardHeader>
        {openNotes && (
          <CardContent>
            <Textarea value={d.notes} onChange={(e) => update({ notes: e.target.value })} disabled={disabled} rows={3} placeholder="Notes additionnelles..." data-testid="input-ent-notes" />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
