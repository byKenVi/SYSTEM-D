import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { FormSubmission } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Truck, Search, ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const MERCHANDISE_OPTIONS = [
  "Palette", "Boîte", "Caisse", "Enveloppe", "Colis", "Vrac", "Autre",
];

interface LivraisonData {
  typeMarchandise?: string;
  nbUnites?: string;
  poidsTotal?: string;
  unitePoids?: string;
  destinations?: { adresse?: string; contact?: string; telephone?: string; notes?: string }[];
  modeBilling?: string;
  reference?: string;
  instructionsSpeciales?: string;
  hasTailgate?: boolean;
  hasRendezVous?: boolean;
  rvDate?: string;
  rvTime?: string;
  documentation?: string[];
}

function getLivData(form: FormSubmission): LivraisonData {
  return (form.data as LivraisonData) || {};
}

function getFirstDestination(form: FormSubmission): string {
  const d = getLivData(form);
  if (!d.destinations || d.destinations.length === 0) return "—";
  return d.destinations[0].adresse || "—";
}

export default function PortalLivraisons({ viewAsContactId }: { viewAsContactId?: number }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [marchandiseFilter, setMarchandiseFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  const queryKey = viewAsContactId
    ? ["/api/portal/livraisons", { contactId: viewAsContactId }]
    : ["/api/portal/livraisons"];

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey,
    queryFn: () =>
      fetch(
        viewAsContactId
          ? `/api/portal/livraisons?contactId=${viewAsContactId}`
          : "/api/portal/livraisons",
        { credentials: "include" }
      ).then((r) => r.json()),
  });

  const filtered = useMemo(() => {
    if (!forms) return [];
    return forms.filter((f) => {
      const d = getLivData(f);
      const dest = getFirstDestination(f);
      const searchLower = search.toLowerCase();

      const matchesSearch =
        !search ||
        f.formNumber.toLowerCase().includes(searchLower) ||
        dest.toLowerCase().includes(searchLower) ||
        (d.reference || "").toLowerCase().includes(searchLower) ||
        (d.typeMarchandise || "").toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === "all" || f.status === statusFilter;
      const matchesMarchandise = marchandiseFilter === "all" || d.typeMarchandise === marchandiseFilter;

      let matchesDate = true;
      const formDate = new Date(f.updatedAt);
      if (dateFrom) matchesDate = matchesDate && formDate >= new Date(dateFrom);
      if (dateTo) matchesDate = matchesDate && formDate <= new Date(dateTo + "T23:59:59");

      return matchesSearch && matchesStatus && matchesMarchandise && matchesDate;
    });
  }, [forms, search, statusFilter, marchandiseFilter, dateFrom, dateTo]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Livraisons</h1>
        <p className="text-sm text-muted-foreground mt-1">Historique de vos sorties d'inventaire</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
                data-testid="input-search-livraisons"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm" data-testid="select-status-filter">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="submitted">Soumis</SelectItem>
                <SelectItem value="in_review">En révision</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
              </SelectContent>
            </Select>

            <Select value={marchandiseFilter} onValueChange={setMarchandiseFilter}>
              <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="select-marchandise-filter">
                <SelectValue placeholder="Marchandise" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {MERCHANDISE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[135px] text-sm"
                data-testid="input-date-from"
              />
              <span className="text-xs text-muted-foreground flex-shrink-0">à</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[135px] text-sm"
                data-testid="input-date-to"
              />
            </div>

            {(search || statusFilter !== "all" || marchandiseFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setMarchandiseFilter("all");
                  setDateFrom("");
                  setDateTo("");
                }}
                data-testid="button-clear-filters"
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aucune livraison trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">N° formulaire</TableHead>
                    <TableHead className="text-xs font-semibold">Marchandise</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Unités</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Poids</TableHead>
                    <TableHead className="text-xs font-semibold">Destination</TableHead>
                    <TableHead className="text-xs font-semibold">Référence</TableHead>
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Statut</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((form) => {
                    const d = getLivData(form);
                    const dest = getFirstDestination(form);
                    return (
                      <TableRow
                        key={form.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(form)}
                        data-testid={`row-livraison-${form.id}`}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {form.formNumber}
                        </TableCell>
                        <TableCell className="text-sm">{d.typeMarchandise || "—"}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {d.nbUnites || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {d.poidsTotal ? `${d.poidsTotal} ${d.unitePoids || "kg"}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate text-muted-foreground">
                          {dest}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.reference || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(form.updatedAt).toLocaleString("fr-CA", {
                            timeZone: "America/New_York",
                            dateStyle: "short",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${STATUS_COLORS[form.status] || ""}`}>
                            {STATUS_LABELS[form.status] || form.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
                              navigate(`/portal/forms/${form.id}${qs}`);
                            }}
                            data-testid={`button-open-form-${form.id}`}
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (() => {
            const d = getLivData(selected);
            return (
              <>
                <SheetHeader className="mb-6">
                  <SheetTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-emerald-600" />
                    {selected.formNumber}
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-5">
                  {/* Status + date */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[selected.status] || ""}`}>
                      {STATUS_LABELS[selected.status] || selected.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(selected.updatedAt).toLocaleString("fr-CA", {
                        timeZone: "America/New_York",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>

                  {/* Marchandise */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marchandise</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium">{d.typeMarchandise || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Nombre d'unités</p>
                        <p className="font-medium">{d.nbUnites || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Poids total</p>
                        <p className="font-medium">{d.poidsTotal ? `${d.poidsTotal} ${d.unitePoids || "kg"}` : "—"}</p>
                      </div>
                      {d.reference && (
                        <div>
                          <p className="text-xs text-muted-foreground">Référence</p>
                          <p className="font-mono text-xs font-medium">{d.reference}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Destinations */}
                  {d.destinations && d.destinations.length > 0 && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Destination{d.destinations.length > 1 ? "s" : ""}
                      </p>
                      {d.destinations.map((dest, i) => (
                        <div key={i} className="text-sm space-y-0.5 pb-3 last:pb-0 border-b last:border-0">
                          {dest.adresse && <p className="font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{dest.adresse}</p>}
                          {dest.contact && <p className="text-muted-foreground text-xs">{dest.contact}</p>}
                          {dest.telephone && <p className="text-muted-foreground text-xs">{dest.telephone}</p>}
                          {dest.notes && <p className="text-muted-foreground text-xs italic">{dest.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* RV + options */}
                  {(d.hasRendezVous || d.hasTailgate) && (
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Options</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {d.hasTailgate && <Badge variant="outline">Hayon requis</Badge>}
                        {d.hasRendezVous && (
                          <Badge variant="outline">
                            RV: {d.rvDate || ""} {d.rvTime || ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Billing + docs */}
                  {(d.modeBilling || (d.documentation && d.documentation.length > 0)) && (
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Facturation & documents</p>
                      {d.modeBilling && <p className="text-sm capitalize">{d.modeBilling}</p>}
                      {d.documentation && d.documentation.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {d.documentation.map((doc) => (
                            <Badge key={doc} variant="secondary" className="text-xs">{doc}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instructions */}
                  {d.instructionsSpeciales && (
                    <div className="rounded-lg border p-4 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Instructions spéciales</p>
                      <p className="text-sm text-muted-foreground">{d.instructionsSpeciales}</p>
                    </div>
                  )}

                  <Link href={`/portal/forms/${selected.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                    <Button variant="outline" size="sm" className="w-full gap-2" data-testid="button-open-full-form">
                      <ArrowUpRight className="h-4 w-4" />
                      Ouvrir le formulaire complet
                    </Button>
                  </Link>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
