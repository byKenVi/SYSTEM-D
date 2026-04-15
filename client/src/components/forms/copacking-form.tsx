import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X } from "lucide-react";
import { TimeTrackingTable, type TimeRow } from "./time-tracking-table";

function emptyTimeRow(): TimeRow {
  return { date: "", debut: "", fin: "", nbGens: "", noms: "", qte: "", agence: "", totalHeure: 0 };
}

interface WorkBlock {
  description: string;
  rows: TimeRow[];
}

interface PickRow {
  date: string;
  nbPicks: string;
  nbItems: string;
}

interface PackerRow {
  date: string;
  nom: string;
  debut: string;
  fin: string;
  totalHeure: number;
  montages: string;
  rendement: number;
}

interface DailyLogRow {
  date: string;
  nom: string;
  debut: string;
  fin: string;
  montages: string;
}

interface CopackingFormData {
  client: string;
  projet: string;
  dateBonTravail: string;
  reference: string;
  gapVerificationRows: TimeRow[];
  photoApprovalRows: TimeRow[];
  montagePrepRows: TimeRow[];
  paletteType: string;
  paletteNb: string;
  materiauxDescription: string;
  materiauxDisponible: string;
  performanceQteTotal: string;
  performanceQteConforme: string;
  performanceQteNC: string;
  montageRows: TimeRow[];
  montageComments: string;
  workBlocks: WorkBlock[];
  picksAvecFacture: PickRow[];
  picksSansFacture: PickRow[];
  packerRows: PackerRow[];
  dailyLogs: DailyLogRow[];
}

interface CopackingFormProps {
  data: CopackingFormData;
  onChange: (data: CopackingFormData) => void;
  disabled?: boolean;
}

const defaultCopackingData: CopackingFormData = {
  client: "",
  projet: "",
  dateBonTravail: "",
  reference: "",
  gapVerificationRows: [emptyTimeRow()],
  photoApprovalRows: [emptyTimeRow()],
  montagePrepRows: [emptyTimeRow()],
  paletteType: "standard",
  paletteNb: "",
  materiauxDescription: "",
  materiauxDisponible: "oui",
  performanceQteTotal: "",
  performanceQteConforme: "",
  performanceQteNC: "",
  montageRows: [emptyTimeRow()],
  montageComments: "",
  workBlocks: [{ description: "", rows: [emptyTimeRow()] }],
  picksAvecFacture: [{ date: "", nbPicks: "", nbItems: "" }],
  picksSansFacture: [{ date: "", nbPicks: "", nbItems: "" }],
  packerRows: [{ date: "", nom: "", debut: "", fin: "", totalHeure: 0, montages: "", rendement: 0 }],
  dailyLogs: [{ date: "", nom: "", debut: "", fin: "", montages: "" }],
};

export { defaultCopackingData };
export type { CopackingFormData };

function calcPackerHours(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const [dh, dm] = debut.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  if (isNaN(dh) || isNaN(dm) || isNaN(fh) || isNaN(fm)) return 0;
  let diff = (fh * 60 + fm - (dh * 60 + dm)) / 60;
  if (diff < 0) diff += 24;
  return Math.round(diff * 100) / 100;
}

export function CopackingForm({ data, onChange, disabled }: CopackingFormProps) {
  const d = { ...defaultCopackingData, ...data };

  function update(partial: Partial<CopackingFormData>) {
    onChange({ ...d, ...partial });
  }

  function addWorkBlock() {
    update({ workBlocks: [...d.workBlocks, { description: "", rows: [emptyTimeRow()] }] });
  }

  function removeWorkBlock(i: number) {
    if (d.workBlocks.length <= 1) return;
    update({ workBlocks: d.workBlocks.filter((_, idx) => idx !== i) });
  }

  function updateWorkBlockDesc(i: number, desc: string) {
    const blocks = [...d.workBlocks];
    blocks[i] = { ...blocks[i], description: desc };
    update({ workBlocks: blocks });
  }

  function updateWorkBlockRows(i: number, rows: TimeRow[]) {
    const blocks = [...d.workBlocks];
    blocks[i] = { ...blocks[i], rows };
    update({ workBlocks: blocks });
  }

  function updatePickRow(type: "avecFacture" | "sansFacture", i: number, field: string, value: string) {
    const key = type === "avecFacture" ? "picksAvecFacture" : "picksSansFacture";
    const rows = [...d[key]];
    rows[i] = { ...rows[i], [field]: value };
    update({ [key]: rows });
  }

  function addPickRow(type: "avecFacture" | "sansFacture") {
    const key = type === "avecFacture" ? "picksAvecFacture" : "picksSansFacture";
    update({ [key]: [...d[key], { date: "", nbPicks: "", nbItems: "" }] });
  }

  function removePickRow(type: "avecFacture" | "sansFacture", i: number) {
    const key = type === "avecFacture" ? "picksAvecFacture" : "picksSansFacture";
    if (d[key].length <= 1) return;
    update({ [key]: d[key].filter((_: PickRow, idx: number) => idx !== i) });
  }

  function updatePackerRow(i: number, field: string, value: string) {
    const rows = [...d.packerRows];
    rows[i] = { ...rows[i], [field]: value };
    const hours = calcPackerHours(rows[i].debut, rows[i].fin);
    rows[i].totalHeure = hours;
    const montages = parseFloat(rows[i].montages) || 0;
    rows[i].rendement = hours > 0 ? Math.round((montages / hours) * 100) / 100 : 0;
    update({ packerRows: rows });
  }

  function addPackerRow() {
    update({ packerRows: [...d.packerRows, { date: "", nom: "", debut: "", fin: "", totalHeure: 0, montages: "", rendement: 0 }] });
  }

  function removePackerRow(i: number) {
    if (d.packerRows.length <= 1) return;
    update({ packerRows: d.packerRows.filter((_, idx) => idx !== i) });
  }

  function updateDailyLog(i: number, field: string, value: string) {
    const logs = [...d.dailyLogs];
    logs[i] = { ...logs[i], [field]: value };
    update({ dailyLogs: logs });
  }

  function addDailyLog() {
    update({ dailyLogs: [...d.dailyLogs, { date: "", nom: "", debut: "", fin: "", montages: "" }] });
  }

  function removeDailyLog(i: number) {
    if (d.dailyLogs.length <= 1) return;
    update({ dailyLogs: d.dailyLogs.filter((_, idx) => idx !== i) });
  }

  const pickAvecTotal = d.picksAvecFacture.reduce((s, r) => s + (parseInt(r.nbPicks) || 0), 0);
  const pickAvecItemsTotal = d.picksAvecFacture.reduce((s, r) => s + (parseInt(r.nbItems) || 0), 0);
  const pickSansTotal = d.picksSansFacture.reduce((s, r) => s + (parseInt(r.nbPicks) || 0), 0);
  const pickSansItemsTotal = d.picksSansFacture.reduce((s, r) => s + (parseInt(r.nbItems) || 0), 0);
  const packerHoursTotal = d.packerRows.reduce((s, r) => s + (r.totalHeure || 0), 0);
  const packerMontagesTotal = d.packerRows.reduce((s, r) => s + (parseFloat(r.montages) || 0), 0);
  const packerRendementGlobal = packerHoursTotal > 0 ? Math.round((packerMontagesTotal / packerHoursTotal) * 100) / 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">En-tête</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Client</Label>
              <Input value={d.client} onChange={(e) => update({ client: e.target.value })} disabled={disabled} data-testid="input-cop-client" />
            </div>
            <div className="space-y-1">
              <Label>Projet</Label>
              <Input value={d.projet} onChange={(e) => update({ projet: e.target.value })} disabled={disabled} data-testid="input-cop-projet" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Date du bon de travail</Label>
              <Input type="date" value={d.dateBonTravail} onChange={(e) => update({ dateBonTravail: e.target.value })} disabled={disabled} data-testid="input-cop-date" />
            </div>
            <div className="space-y-1">
              <Label>Référence</Label>
              <Input value={d.reference} onChange={(e) => update({ reference: e.target.value })} disabled={disabled} data-testid="input-cop-reference" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="detaillee" className="w-full">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="detaillee" data-testid="tab-cop-detaillee">Détaillée</TabsTrigger>
          <TabsTrigger value="montage" data-testid="tab-cop-montage">Montage</TabsTrigger>
          <TabsTrigger value="ajout" data-testid="tab-cop-ajout">Ajout</TabsTrigger>
          <TabsTrigger value="express-global" data-testid="tab-cop-express-global">Express G.</TabsTrigger>
          <TabsTrigger value="express-individuel" data-testid="tab-cop-express-individuel">Express I.</TabsTrigger>
        </TabsList>

        <TabsContent value="detaillee" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Vérification du gap</h3></CardHeader>
            <CardContent>
              <TimeTrackingTable rows={d.gapVerificationRows} onChange={(r) => update({ gapVerificationRows: r })} disabled={disabled} showNbGens showNoms label="" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Approbation photo</h3></CardHeader>
            <CardContent>
              <TimeTrackingTable rows={d.photoApprovalRows} onChange={(r) => update({ photoApprovalRows: r })} disabled={disabled} showNbGens showNoms label="" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Préparation montage</h3></CardHeader>
            <CardContent>
              <TimeTrackingTable rows={d.montagePrepRows} onChange={(r) => update({ montagePrepRows: r })} disabled={disabled} showNbGens showNoms label="" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Palette & Matériaux</h3></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Type de palette</Label>
                  <RadioGroup value={d.paletteType} onValueChange={(v) => update({ paletteType: v })} disabled={disabled} className="flex gap-3">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="standard" id="cop-pal-std" />
                      <Label htmlFor="cop-pal-std" className="text-sm">Standard</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="custom" id="cop-pal-custom" />
                      <Label htmlFor="cop-pal-custom" className="text-sm">Sur mesure</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nb palettes</Label>
                  <Input type="number" value={d.paletteNb} onChange={(e) => update({ paletteNb: e.target.value })} disabled={disabled} data-testid="input-cop-palette-nb" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description matériaux</Label>
                <Textarea value={d.materiauxDescription} onChange={(e) => update({ materiauxDescription: e.target.value })} disabled={disabled} rows={2} data-testid="input-cop-materiaux-desc" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Matériaux disponibles</Label>
                <RadioGroup value={d.materiauxDisponible} onValueChange={(v) => update({ materiauxDisponible: v })} disabled={disabled} className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="oui" id="cop-mat-oui" />
                    <Label htmlFor="cop-mat-oui" className="text-sm">Oui</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="non" id="cop-mat-non" />
                    <Label htmlFor="cop-mat-non" className="text-sm">Non</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="partiel" id="cop-mat-partiel" />
                    <Label htmlFor="cop-mat-partiel" className="text-sm">Partiel</Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Performance</h3></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Qté totale</Label>
                  <Input type="number" value={d.performanceQteTotal} onChange={(e) => update({ performanceQteTotal: e.target.value })} disabled={disabled} data-testid="input-cop-perf-total" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qté conforme</Label>
                  <Input type="number" value={d.performanceQteConforme} onChange={(e) => update({ performanceQteConforme: e.target.value })} disabled={disabled} data-testid="input-cop-perf-conforme" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qté non-conforme</Label>
                  <Input type="number" value={d.performanceQteNC} onChange={(e) => update({ performanceQteNC: e.target.value })} disabled={disabled} data-testid="input-cop-perf-nc" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="montage" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Suivi montage</h3></CardHeader>
            <CardContent className="space-y-4">
              <TimeTrackingTable rows={d.montageRows} onChange={(r) => update({ montageRows: r })} disabled={disabled} showNbGens showNoms />
              <div className="space-y-1">
                <Label>Commentaires</Label>
                <Textarea value={d.montageComments} onChange={(e) => update({ montageComments: e.target.value })} disabled={disabled} rows={3} data-testid="input-cop-montage-comments" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ajout" className="space-y-6 mt-4">
          {d.workBlocks.map((block, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Travail supplémentaire {i + 1}</h3>
                  {!disabled && d.workBlocks.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeWorkBlock(i)} data-testid={`button-cop-remove-block-${i}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={block.description} onChange={(e) => updateWorkBlockDesc(i, e.target.value)} disabled={disabled} rows={2} data-testid={`input-cop-block-desc-${i}`} />
                </div>
                <TimeTrackingTable rows={block.rows} onChange={(r) => updateWorkBlockRows(i, r)} disabled={disabled} showNbGens showNoms showQte showAgence />
              </CardContent>
            </Card>
          ))}
          {!disabled && (
            <Button type="button" variant="outline" onClick={addWorkBlock} data-testid="button-cop-add-block">
              <Plus className="h-4 w-4 mr-1" />
              Ajouter un bloc de travail
            </Button>
          )}
        </TabsContent>

        <TabsContent value="express-global" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Picks avec facture</h3></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Nb picks</th>
                      <th className="text-left p-2 font-medium">Nb items</th>
                      {!disabled && <th className="w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.picksAvecFacture.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-1"><Input type="date" value={r.date} onChange={(e) => updatePickRow("avecFacture", i, "date", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-pick-af-date-${i}`} /></td>
                        <td className="p-1"><Input type="number" value={r.nbPicks} onChange={(e) => updatePickRow("avecFacture", i, "nbPicks", e.target.value)} disabled={disabled} className="h-8 text-xs w-20" data-testid={`input-cop-pick-af-picks-${i}`} /></td>
                        <td className="p-1"><Input type="number" value={r.nbItems} onChange={(e) => updatePickRow("avecFacture", i, "nbItems", e.target.value)} disabled={disabled} className="h-8 text-xs w-20" data-testid={`input-cop-pick-af-items-${i}`} /></td>
                        {!disabled && (
                          <td className="p-1">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePickRow("avecFacture", i)} disabled={d.picksAvecFacture.length <= 1} data-testid={`button-cop-pick-af-remove-${i}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50">
                      <td className="p-2 text-right font-medium">Total</td>
                      <td className="p-2 font-mono font-bold" data-testid="text-cop-pick-af-total">{pickAvecTotal}</td>
                      <td className="p-2 font-mono font-bold" data-testid="text-cop-pick-af-items-total">{pickAvecItemsTotal}</td>
                      {!disabled && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!disabled && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addPickRow("avecFacture")} data-testid="button-cop-pick-af-add">
                  <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Picks sans facture</h3></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Nb picks</th>
                      <th className="text-left p-2 font-medium">Nb items</th>
                      {!disabled && <th className="w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.picksSansFacture.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-1"><Input type="date" value={r.date} onChange={(e) => updatePickRow("sansFacture", i, "date", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-pick-sf-date-${i}`} /></td>
                        <td className="p-1"><Input type="number" value={r.nbPicks} onChange={(e) => updatePickRow("sansFacture", i, "nbPicks", e.target.value)} disabled={disabled} className="h-8 text-xs w-20" data-testid={`input-cop-pick-sf-picks-${i}`} /></td>
                        <td className="p-1"><Input type="number" value={r.nbItems} onChange={(e) => updatePickRow("sansFacture", i, "nbItems", e.target.value)} disabled={disabled} className="h-8 text-xs w-20" data-testid={`input-cop-pick-sf-items-${i}`} /></td>
                        {!disabled && (
                          <td className="p-1">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePickRow("sansFacture", i)} disabled={d.picksSansFacture.length <= 1} data-testid={`button-cop-pick-sf-remove-${i}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50">
                      <td className="p-2 text-right font-medium">Total</td>
                      <td className="p-2 font-mono font-bold" data-testid="text-cop-pick-sf-total">{pickSansTotal}</td>
                      <td className="p-2 font-mono font-bold" data-testid="text-cop-pick-sf-items-total">{pickSansItemsTotal}</td>
                      {!disabled && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!disabled && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addPickRow("sansFacture")} data-testid="button-cop-pick-sf-add">
                  <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Suivi des packers</h3></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Nom</th>
                      <th className="text-left p-2 font-medium">Début</th>
                      <th className="text-left p-2 font-medium">Fin</th>
                      <th className="text-right p-2 font-medium">Heures</th>
                      <th className="text-right p-2 font-medium">Montages</th>
                      <th className="text-right p-2 font-medium">Rendement</th>
                      {!disabled && <th className="w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.packerRows.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-1"><Input type="date" value={r.date} onChange={(e) => updatePackerRow(i, "date", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-packer-date-${i}`} /></td>
                        <td className="p-1"><Input value={r.nom} onChange={(e) => updatePackerRow(i, "nom", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-packer-nom-${i}`} /></td>
                        <td className="p-1"><Input type="time" value={r.debut} onChange={(e) => updatePackerRow(i, "debut", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-cop-packer-debut-${i}`} /></td>
                        <td className="p-1"><Input type="time" value={r.fin} onChange={(e) => updatePackerRow(i, "fin", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-cop-packer-fin-${i}`} /></td>
                        <td className="p-2 text-right font-mono text-xs">{r.totalHeure.toFixed(2)}</td>
                        <td className="p-1"><Input type="number" value={r.montages} onChange={(e) => updatePackerRow(i, "montages", e.target.value)} disabled={disabled} className="h-8 text-xs w-20 text-right" data-testid={`input-cop-packer-montages-${i}`} /></td>
                        <td className="p-2 text-right font-mono text-xs">{r.rendement.toFixed(2)}</td>
                        {!disabled && (
                          <td className="p-1">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePackerRow(i)} disabled={d.packerRows.length <= 1} data-testid={`button-cop-packer-remove-${i}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50">
                      <td colSpan={4} className="p-2 text-right font-medium">Total</td>
                      <td className="p-2 text-right font-mono font-bold" data-testid="text-cop-packer-hours-total">{packerHoursTotal.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono font-bold" data-testid="text-cop-packer-montages-total">{packerMontagesTotal}</td>
                      <td className="p-2 text-right font-mono font-bold" data-testid="text-cop-packer-rendement-total">{packerRendementGlobal.toFixed(2)}</td>
                      {!disabled && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!disabled && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addPackerRow} data-testid="button-cop-packer-add">
                  <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="express-individuel" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3"><h3 className="font-semibold">Journal quotidien individuel</h3></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Nom</th>
                      <th className="text-left p-2 font-medium">Début</th>
                      <th className="text-left p-2 font-medium">Fin</th>
                      <th className="text-left p-2 font-medium">Montages</th>
                      {!disabled && <th className="w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.dailyLogs.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-1"><Input type="date" value={r.date} onChange={(e) => updateDailyLog(i, "date", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-daily-date-${i}`} /></td>
                        <td className="p-1"><Input value={r.nom} onChange={(e) => updateDailyLog(i, "nom", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-cop-daily-nom-${i}`} /></td>
                        <td className="p-1"><Input type="time" value={r.debut} onChange={(e) => updateDailyLog(i, "debut", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-cop-daily-debut-${i}`} /></td>
                        <td className="p-1"><Input type="time" value={r.fin} onChange={(e) => updateDailyLog(i, "fin", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-cop-daily-fin-${i}`} /></td>
                        <td className="p-1"><Input value={r.montages} onChange={(e) => updateDailyLog(i, "montages", e.target.value)} disabled={disabled} className="h-8 text-xs w-20" data-testid={`input-cop-daily-montages-${i}`} /></td>
                        {!disabled && (
                          <td className="p-1">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDailyLog(i)} disabled={d.dailyLogs.length <= 1} data-testid={`button-cop-daily-remove-${i}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!disabled && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addDailyLog} data-testid="button-cop-daily-add">
                  <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
