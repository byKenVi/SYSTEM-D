import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, CheckCircle, XCircle } from "lucide-react";
import { FileUpload } from "./file-upload";

interface CriteriaItem {
  processTitle: string;
  processDescription: string;
  nonCompliantDescription: string;
  nonCompliantPhotos: any[];
  nonCompliantVideo: string;
  compliantDescription: string;
  compliantPhotos: any[];
  compliantVideo: string;
  active: boolean;
}

interface InspectionFormData {
  workInstruction: string;
  customer: string;
  partNumber: string;
  partName: string;
  revision: string;
  controlSample: string;
  customSamplePercent: string;
  controlMethod: string[];
  reworkTool: string;
  inspectionDescription: string;
  reworkDescription: string;
  toolList: string;
  ppe: string[];
  ppeOther: string;
  documentationReference: string;
  criteria: CriteriaItem[];
  approvalSystemeDName: string;
  approvalSystemeDDate: string;
  approvalCustomerName: string;
  approvalCustomerDate: string;
}

interface InspectionFormProps {
  data: InspectionFormData;
  onChange: (data: InspectionFormData) => void;
  disabled?: boolean;
  revisionHistory?: { date: string; rev: number; description: string; modifiedBy: string }[];
  onFileAdded?: (fieldKey: string, file: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => void;
}

const defaultInspectionData: InspectionFormData = {
  workInstruction: "",
  customer: "",
  partNumber: "",
  partName: "",
  revision: "",
  controlSample: "100%",
  customSamplePercent: "",
  controlMethod: [],
  reworkTool: "",
  inspectionDescription: "",
  reworkDescription: "",
  toolList: "",
  ppe: [],
  ppeOther: "",
  documentationReference: "",
  criteria: [],
  approvalSystemeDName: "",
  approvalSystemeDDate: "",
  approvalCustomerName: "",
  approvalCustomerDate: "",
};

export { defaultInspectionData };
export type { InspectionFormData };

const PPE_OPTIONS = [
  "Lunettes de sécurité",
  "Chaussures à embout d'acier",
  "Gants",
  "Protection auditive",
  "Casque de sécurité",
  "Autre",
];

const CONTROL_METHODS = ["Visuel", "Électrique", "Dimensionnel", "Autre"];

export function InspectionForm({ data, onChange, disabled, revisionHistory = [], onFileAdded }: InspectionFormProps) {
  const d = { ...defaultInspectionData, ...data };

  function update(partial: Partial<InspectionFormData>) {
    onChange({ ...d, ...partial });
  }

  function toggleArrayItem(arr: string[], item: string): string[] {
    return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
  }

  function updateCriteria(index: number, partial: Partial<CriteriaItem>) {
    const criteria = [...d.criteria];
    criteria[index] = { ...criteria[index], ...partial };
    update({ criteria });
  }

  function addCriteria() {
    update({
      criteria: [...d.criteria, {
        processTitle: "",
        processDescription: "",
        nonCompliantDescription: "",
        nonCompliantPhotos: [],
        nonCompliantVideo: "",
        compliantDescription: "",
        compliantPhotos: [],
        compliantVideo: "",
        active: true,
      }],
    });
  }

  function removeCriteria(index: number) {
    update({ criteria: d.criteria.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">A. En-tête</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label># Instruction de travail</Label>
              <Input value={d.workInstruction} disabled className="opacity-60" data-testid="input-ins-work-instruction" />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Input value={d.customer} disabled className="opacity-60" data-testid="input-ins-customer" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Numéro de pièce</Label>
              <Input value={d.partNumber} disabled className="opacity-60" data-testid="input-ins-part-number" />
            </div>
            <div className="space-y-2">
              <Label>Nom de la pièce</Label>
              <Input value={d.partName} onChange={(e) => update({ partName: e.target.value })} disabled={disabled} data-testid="input-ins-part-name" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Échantillon de contrôle</Label>
              <Select value={d.controlSample} onValueChange={(v) => update({ controlSample: v })} disabled={disabled}>
                <SelectTrigger data-testid="select-ins-control-sample">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100%">100%</SelectItem>
                  <SelectItem value="50%">50%</SelectItem>
                  <SelectItem value="25%">25%</SelectItem>
                  <SelectItem value="10%">10%</SelectItem>
                  <SelectItem value="Personnalisé">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {d.controlSample === "Personnalisé" && (
              <div className="space-y-2">
                <Label>Pourcentage personnalisé</Label>
                <Input type="number" value={d.customSamplePercent} onChange={(e) => update({ customSamplePercent: e.target.value })} disabled={disabled} placeholder="%" data-testid="input-ins-custom-sample" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Méthode de mesure / contrôle</Label>
            <div className="flex flex-wrap gap-2">
              {CONTROL_METHODS.map((method) => (
                <Button
                  key={method}
                  type="button"
                  variant={d.controlMethod.includes(method) ? "default" : "outline"}
                  size="sm"
                  onClick={() => !disabled && update({ controlMethod: toggleArrayItem(d.controlMethod, method) })}
                  disabled={disabled}
                  data-testid={`button-method-${method.toLowerCase()}`}
                >
                  {method}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Outil de reprise</Label>
            <Input value={d.reworkTool} onChange={(e) => update({ reworkTool: e.target.value })} disabled={disabled} placeholder="N/A ou liste d'outils" data-testid="input-ins-rework-tool" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">B. Description</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Description de l'inspection</Label>
            <Textarea value={d.inspectionDescription} onChange={(e) => update({ inspectionDescription: e.target.value })} disabled={disabled} rows={3} data-testid="input-ins-description" />
          </div>
          <div className="space-y-2">
            <Label>Description de la reprise</Label>
            <Textarea value={d.reworkDescription} onChange={(e) => update({ reworkDescription: e.target.value })} disabled={disabled} rows={2} placeholder="N/A" data-testid="input-ins-rework-description" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">C. Liste d'outils</h3>
        </CardHeader>
        <CardContent>
          <Textarea value={d.toolList} onChange={(e) => update({ toolList: e.target.value })} disabled={disabled} rows={2} placeholder="Liste des outils requis ou N/A" data-testid="input-ins-tool-list" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">D. Équipement de protection (PPE)</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PPE_OPTIONS.map((item) => (
              <Button
                key={item}
                type="button"
                variant={d.ppe.includes(item) ? "default" : "outline"}
                size="sm"
                onClick={() => !disabled && update({ ppe: toggleArrayItem(d.ppe, item) })}
                disabled={disabled}
                data-testid={`button-ppe-${item.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item}
              </Button>
            ))}
          </div>
          {d.ppe.includes("Autre") && (
            <Input value={d.ppeOther} onChange={(e) => update({ ppeOther: e.target.value })} disabled={disabled} placeholder="Spécifier..." data-testid="input-ins-ppe-other" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">E. Référence de documentation</h3>
        </CardHeader>
        <CardContent>
          <Input value={d.documentationReference} onChange={(e) => update({ documentationReference: e.target.value })} disabled={disabled} placeholder="Ex: Inspection report F006-4" data-testid="input-ins-doc-ref" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">F. Critères d'inspection</h3>
            {!disabled && (
              <Button type="button" variant="outline" size="sm" onClick={addCriteria} data-testid="button-add-criteria">
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un critère
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {d.criteria.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun critère ajouté. Cliquez sur "Ajouter un critère" pour commencer.</p>
          )}
          {d.criteria.map((c, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-4 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={c.active ? "default" : "secondary"}>Critère {i + 1}</Badge>
                  {c.active ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Actif</Label>

                    <Switch checked={c.active} onCheckedChange={(v) => updateCriteria(i, { active: v })} disabled={disabled} data-testid={`switch-criteria-active-${i}`} />
                  </div>
                  {!disabled && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCriteria(i)} data-testid={`button-remove-criteria-${i}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Titre du processus</Label>
                <Input value={c.processTitle} onChange={(e) => updateCriteria(i, { processTitle: e.target.value })} disabled={disabled} data-testid={`input-criteria-title-${i}`} />
              </div>
              <div className="space-y-2">
                <Label>Description du processus</Label>
                <Textarea value={c.processDescription} onChange={(e) => updateCriteria(i, { processDescription: e.target.value })} disabled={disabled} rows={2} data-testid={`input-criteria-desc-${i}`} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <h4 className="font-medium text-sm text-red-700 dark:text-red-400">Non-conforme</h4>
                  <Textarea value={c.nonCompliantDescription} onChange={(e) => updateCriteria(i, { nonCompliantDescription: e.target.value })} disabled={disabled} rows={2} placeholder="Qu'est-ce qui rend la pièce non-conforme?" data-testid={`input-criteria-nc-desc-${i}`} />
                  <FileUpload value={c.nonCompliantPhotos || []} onChange={(files) => updateCriteria(i, { nonCompliantPhotos: files })} onFileAdded={(f) => onFileAdded?.(`criteria_${i}_nc_photo`, f)} accept=".jpg,.jpeg,.png,.heic" disabled={disabled} label="Photos non-conformes" />
                  <div className="space-y-1">
                    <Label className="text-xs">Vidéo (URL Loom ou fichier)</Label>
                    <Input value={c.nonCompliantVideo || ""} onChange={(e) => updateCriteria(i, { nonCompliantVideo: e.target.value })} disabled={disabled} placeholder="URL de la vidéo (optionnel)" data-testid={`input-criteria-nc-video-${i}`} />
                  </div>
                </div>

                <div className="space-y-3 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                  <h4 className="font-medium text-sm text-emerald-700 dark:text-emerald-400">Conforme</h4>
                  <Textarea value={c.compliantDescription} onChange={(e) => updateCriteria(i, { compliantDescription: e.target.value })} disabled={disabled} rows={2} placeholder="À quoi ressemble une pièce conforme?" data-testid={`input-criteria-c-desc-${i}`} />
                  <FileUpload value={c.compliantPhotos || []} onChange={(files) => updateCriteria(i, { compliantPhotos: files })} onFileAdded={(f) => onFileAdded?.(`criteria_${i}_c_photo`, f)} accept=".jpg,.jpeg,.png,.heic" disabled={disabled} label="Photos conformes" />
                  <div className="space-y-1">
                    <Label className="text-xs">Vidéo (URL Loom ou fichier)</Label>
                    <Input value={c.compliantVideo || ""} onChange={(e) => updateCriteria(i, { compliantVideo: e.target.value })} disabled={disabled} placeholder="URL de la vidéo (optionnel)" data-testid={`input-criteria-c-video-${i}`} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">G. Approbation</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 p-3 border rounded-lg">
              <h4 className="font-medium text-sm">Système-D</h4>
              <div className="space-y-2">
                <Label className="text-xs">Nom</Label>
                <Input value={d.approvalSystemeDName} onChange={(e) => update({ approvalSystemeDName: e.target.value })} disabled={disabled} data-testid="input-ins-approval-sd-name" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={d.approvalSystemeDDate} onChange={(e) => update({ approvalSystemeDDate: e.target.value })} disabled={disabled} data-testid="input-ins-approval-sd-date" />
              </div>
            </div>
            <div className="space-y-3 p-3 border rounded-lg">
              <h4 className="font-medium text-sm">Client</h4>
              <div className="space-y-2">
                <Label className="text-xs">Nom</Label>
                <Input value={d.approvalCustomerName} onChange={(e) => update({ approvalCustomerName: e.target.value })} disabled={disabled} data-testid="input-ins-approval-customer-name" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={d.approvalCustomerDate} onChange={(e) => update({ approvalCustomerDate: e.target.value })} disabled={disabled} data-testid="input-ins-approval-customer-date" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {revisionHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold text-lg">H. Historique des révisions</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Rév.</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Modifié par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revisionHistory.map((entry: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{new Date(entry.date).toLocaleDateString("fr-CA")}</TableCell>
                      <TableCell className="text-sm">{entry.rev}</TableCell>
                      <TableCell className="text-sm">{entry.description}</TableCell>
                      <TableCell className="text-sm">{entry.modifiedBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
