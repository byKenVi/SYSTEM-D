import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

export interface TimeRow {
  date: string;
  debut: string;
  fin: string;
  nbGens?: string;
  noms?: string;
  qte?: string;
  agence?: string;
  totalHeure: number;
}

interface TimeTrackingTableProps {
  rows: TimeRow[];
  onChange: (rows: TimeRow[]) => void;
  disabled?: boolean;
  showNbGens?: boolean;
  showNoms?: boolean;
  showQte?: boolean;
  showAgence?: boolean;
  label?: string;
}

function calcHours(debut: string, fin: string, nbGens?: string): number {
  if (!debut || !fin) return 0;
  const [dh, dm] = debut.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  if (isNaN(dh) || isNaN(dm) || isNaN(fh) || isNaN(fm)) return 0;
  let diff = (fh * 60 + fm - (dh * 60 + dm)) / 60;
  if (diff < 0) diff += 24;
  const people = nbGens ? parseFloat(nbGens) || 1 : 1;
  return Math.round(diff * people * 100) / 100;
}

function emptyRow(): TimeRow {
  return { date: "", debut: "", fin: "", nbGens: "", noms: "", qte: "", agence: "", totalHeure: 0 };
}

export function TimeTrackingTable({
  rows,
  onChange,
  disabled,
  showNbGens = false,
  showNoms = false,
  showQte = false,
  showAgence = false,
  label,
}: TimeTrackingTableProps) {
  const safeRows = (rows.length > 0 ? rows : [emptyRow()]).map((row) => ({
    ...row,
    totalHeure: calcHours(row.debut, row.fin, showNbGens ? row.nbGens : undefined),
  }));

  function updateRow(index: number, field: string, value: string) {
    const updated = [...safeRows];
    updated[index] = { ...updated[index], [field]: value };
    updated[index].totalHeure = calcHours(updated[index].debut, updated[index].fin, showNbGens ? updated[index].nbGens : undefined);
    onChange(updated);
  }

  function addRow() {
    onChange([...safeRows, emptyRow()]);
  }

  function removeRow(index: number) {
    if (safeRows.length <= 1) return;
    onChange(safeRows.filter((_, i) => i !== index));
  }

  const totalSum = safeRows.reduce((sum, r) => sum + (r.totalHeure || 0), 0);

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Début</th>
              <th className="text-left p-2 font-medium">Fin</th>
              {showNbGens && <th className="text-left p-2 font-medium">Nb gens</th>}
              {showNoms && <th className="text-left p-2 font-medium">Noms</th>}
              {showQte && <th className="text-left p-2 font-medium">Qté</th>}
              {showAgence && <th className="text-left p-2 font-medium">Agence</th>}
              <th className="text-right p-2 font-medium">Total heure</th>
              {!disabled && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="p-1">
                  <Input type="date" value={row.date} onChange={(e) => updateRow(i, "date", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-tt-date-${i}`} />
                </td>
                <td className="p-1">
                  <Input type="time" value={row.debut} onChange={(e) => updateRow(i, "debut", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-tt-debut-${i}`} />
                </td>
                <td className="p-1">
                  <Input type="time" value={row.fin} onChange={(e) => updateRow(i, "fin", e.target.value)} disabled={disabled} className="h-8 text-xs w-24" data-testid={`input-tt-fin-${i}`} />
                </td>
                {showNbGens && (
                  <td className="p-1">
                    <Input type="number" value={row.nbGens || ""} onChange={(e) => updateRow(i, "nbGens", e.target.value)} disabled={disabled} className="h-8 text-xs w-16" min="1" data-testid={`input-tt-nbgens-${i}`} />
                  </td>
                )}
                {showNoms && (
                  <td className="p-1">
                    <Input value={row.noms || ""} onChange={(e) => updateRow(i, "noms", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-tt-noms-${i}`} />
                  </td>
                )}
                {showQte && (
                  <td className="p-1">
                    <Input type="number" value={row.qte || ""} onChange={(e) => updateRow(i, "qte", e.target.value)} disabled={disabled} className="h-8 text-xs w-16" data-testid={`input-tt-qte-${i}`} />
                  </td>
                )}
                {showAgence && (
                  <td className="p-1">
                    <Input value={row.agence || ""} onChange={(e) => updateRow(i, "agence", e.target.value)} disabled={disabled} className="h-8 text-xs" data-testid={`input-tt-agence-${i}`} />
                  </td>
                )}
                <td className="p-2 text-right font-mono text-xs">{row.totalHeure.toFixed(2)}</td>
                {!disabled && (
                  <td className="p-1">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)} disabled={safeRows.length <= 1} data-testid={`button-tt-remove-${i}`}>
                      <X className="h-3 w-3" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50">
              <td colSpan={showNbGens || showNoms || showQte || showAgence ? 3 + (showNbGens ? 1 : 0) + (showNoms ? 1 : 0) + (showQte ? 1 : 0) + (showAgence ? 1 : 0) : 3} className="p-2 text-right font-medium text-sm">
                Total
              </td>
              <td className="p-2 text-right font-mono font-bold text-sm" data-testid="text-tt-total">{totalSum.toFixed(2)}</td>
              {!disabled && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={addRow} data-testid="button-tt-add-row">
          <Plus className="h-3 w-3 mr-1" />
          Ajouter une ligne
        </Button>
      )}
    </div>
  );
}
