import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, X, Mail, User } from "lucide-react";

interface TriFormData {
  client: string;
  sousTraitant: string;
  nomProjet: string;
  codePiece: string;
  description: string;
  instructionsNumero: string;
  typeTri: string;
  ncReferences: string[];
  ncItems: { description: string }[];
  methodeTri: string;
  outils: string;
  uniteParBoite: string;
  besoinQuotidien: string;
  cycleTri: string;
  cycleTriType: string;
  langueEchangee: string;
  contacts: { nom: string; email: string; role: string }[];
}

interface TriFormProps {
  data: TriFormData;
  onChange: (data: TriFormData) => void;
  disabled?: boolean;
}

const defaultTriData: TriFormData = {
  client: "",
  sousTraitant: "",
  nomProjet: "",
  codePiece: "",
  description: "",
  instructionsNumero: "",
  typeTri: "nouveau",
  ncReferences: [],
  ncItems: [
    { description: "" },
    { description: "" },
    { description: "" },
    { description: "" },
  ],
  methodeTri: "",
  outils: "",
  uniteParBoite: "",
  besoinQuotidien: "",
  cycleTri: "",
  cycleTriType: "",
  langueEchangee: "Français",
  contacts: [{ nom: "", email: "", role: "Client" }],
};

export { defaultTriData };
export type { TriFormData };

export function TriForm({ data, onChange, disabled }: TriFormProps) {
  const d = { ...defaultTriData, ...data };

  function update(partial: Partial<TriFormData>) {
    onChange({ ...d, ...partial });
  }

  function updateNcItem(index: number, description: string) {
    const items = [...d.ncItems];
    items[index] = { description };
    update({ ncItems: items });
  }

  function addNcItem() {
    if (d.ncItems.length >= 10) return;
    update({ ncItems: [...d.ncItems, { description: "" }] });
  }

  function removeNcItem(index: number) {
    if (d.ncItems.length <= 1) return;
    update({ ncItems: d.ncItems.filter((_, i) => i !== index) });
  }

  function updateContact(index: number, field: string, value: string) {
    const contacts = [...d.contacts];
    contacts[index] = { ...contacts[index], [field]: value };
    update({ contacts });
  }

  function addContact() {
    update({ contacts: [...d.contacts, { nom: "", email: "", role: "Client" }] });
  }

  function removeContact(index: number) {
    if (d.contacts.length <= 1) return;
    update({ contacts: d.contacts.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">A. Identification</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Input value={d.client} onChange={(e) => update({ client: e.target.value })} disabled={disabled} placeholder="Nom du client" data-testid="input-tri-client" />
            </div>
            <div className="space-y-2">
              <Label>Sous-traitant</Label>
              <Input value={d.sousTraitant} onChange={(e) => update({ sousTraitant: e.target.value })} disabled={disabled} placeholder="Optionnel" data-testid="input-tri-sous-traitant" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nom du projet *</Label>
              <Input value={d.nomProjet} onChange={(e) => update({ nomProjet: e.target.value })} disabled={disabled} placeholder="Nom du projet" data-testid="input-tri-nom-projet" />
            </div>
            <div className="space-y-2">
              <Label>Code pièce *</Label>
              <Input value={d.codePiece} onChange={(e) => update({ codePiece: e.target.value })} disabled={disabled} placeholder="Ex: L1406A" data-testid="input-tri-code-piece" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={d.description} onChange={(e) => update({ description: e.target.value })} disabled={disabled} placeholder="Description courte (ex: Gasket)" data-testid="input-tri-description" />
            </div>
            <div className="space-y-2">
              <Label># Instructions</Label>
              <Input value={d.instructionsNumero} onChange={(e) => update({ instructionsNumero: e.target.value })} disabled={disabled} placeholder="Numéro d'instruction" data-testid="input-tri-instructions-numero" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">B. Type de tri</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={d.typeTri} onValueChange={(v) => update({ typeTri: v })} disabled={disabled}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nouveau" id="tri-nouveau" />
              <Label htmlFor="tri-nouveau">Nouveau TRI</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nouveau_critere" id="tri-nouveau-critere" />
              <Label htmlFor="tri-nouveau-critere">Nouveau critère sur tri existant</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ajustement" id="tri-ajustement" />
              <Label htmlFor="tri-ajustement">Ajustement d'un critère existant</Label>
            </div>
          </RadioGroup>

          {(d.typeTri === "nouveau_critere" || d.typeTri === "ajustement") && (
            <div className="space-y-2 mt-4 p-3 bg-muted/50 rounded-lg">
              <Label>{d.typeTri === "nouveau_critere" ? "Cocher le numéro NC ajouté" : "Cocher le NC modifié"}</Label>
              <Input value={d.ncReferences.join(", ")} onChange={(e) => update({ ncReferences: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} disabled={disabled} placeholder="Entrez les numéros NC (séparés par virgule)" data-testid="input-tri-nc-references" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">C. Lexique (Non-conformité)</h3>
            {!disabled && d.ncItems.length < 10 && (
              <Button type="button" variant="outline" size="sm" onClick={addNcItem} data-testid="button-add-nc">
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter NC
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.ncItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-medium w-14 shrink-0 text-muted-foreground">NC {i + 1}</span>
              <Input
                value={item.description}
                onChange={(e) => updateNcItem(i, e.target.value)}
                disabled={disabled}
                placeholder={`Description NC ${i + 1}`}
                data-testid={`input-nc-${i}`}
              />
              {!disabled && d.ncItems.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeNcItem(i)} data-testid={`button-remove-nc-${i}`}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{d.ncItems.length}/10 critères</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">D. Paramètres opérationnels</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Méthode de tri</Label>
            <Textarea value={d.methodeTri} onChange={(e) => update({ methodeTri: e.target.value })} disabled={disabled} placeholder="Décrivez la méthode de tri" data-testid="input-tri-methode" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Outils</Label>
              <Input value={d.outils} onChange={(e) => update({ outils: e.target.value })} disabled={disabled} placeholder="Ex: N/A ou liste d'outils" data-testid="input-tri-outils" />
            </div>
            <div className="space-y-2">
              <Label>Unité par boîte</Label>
              <Input type="number" value={d.uniteParBoite} onChange={(e) => update({ uniteParBoite: e.target.value })} disabled={disabled} placeholder="Ex: 240" data-testid="input-tri-unite-boite" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Besoin quotidien</Label>
              <Input type="number" value={d.besoinQuotidien} onChange={(e) => update({ besoinQuotidien: e.target.value })} disabled={disabled} placeholder="Ex: 960" data-testid="input-tri-besoin-quotidien" />
            </div>
            <div className="space-y-2">
              <Label>Cycle de tri</Label>
              <div className="flex gap-2">
                <Input type="number" value={d.cycleTri} onChange={(e) => update({ cycleTri: e.target.value })} disabled={disabled} placeholder="Durée" className="flex-1" data-testid="input-tri-cycle" />
                <Input value={d.cycleTriType} onChange={(e) => update({ cycleTriType: e.target.value })} disabled={disabled} placeholder="Type" className="flex-1" data-testid="input-tri-cycle-type" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Langue échangée</Label>
            <Select value={d.langueEchangee} onValueChange={(v) => update({ langueEchangee: v })} disabled={disabled}>
              <SelectTrigger data-testid="select-tri-langue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Français">Français</SelectItem>
                <SelectItem value="English">English</SelectItem>
                <SelectItem value="Español">Español</SelectItem>
                <SelectItem value="Other">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">E. Contacts</h3>
            {!disabled && (
              <Button type="button" variant="outline" size="sm" onClick={addContact} data-testid="button-add-contact">
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {d.contacts.map((contact, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3 relative">
              {!disabled && d.contacts.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => removeContact(i)} data-testid={`button-remove-contact-${i}`}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" />Nom</Label>
                  <Input value={contact.nom} onChange={(e) => updateContact(i, "nom", e.target.value)} disabled={disabled} placeholder="Nom du contact" data-testid={`input-contact-nom-${i}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" />Email</Label>
                  <Input type="email" value={contact.email} onChange={(e) => updateContact(i, "email", e.target.value)} disabled={disabled} placeholder="email@exemple.com" data-testid={`input-contact-email-${i}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rôle</Label>
                  <Select value={contact.role} onValueChange={(v) => updateContact(i, "role", v)} disabled={disabled}>
                    <SelectTrigger data-testid={`select-contact-role-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Client">Client</SelectItem>
                      <SelectItem value="Sous-traitant">Sous-traitant</SelectItem>
                      <SelectItem value="Autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
