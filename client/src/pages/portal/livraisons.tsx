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
import {
  Truck, Search, ArrowUpRight, MapPin,
  Package, Hash, Phone, User, FileText, Calendar, MessageSquare,
} from "lucide-react";
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
        <SheetContent className="w-full sm:max-w-md p-0 overflow-y-auto">
          {selected && (() => {
            const d = getLivData(selected);
            const filledDests = d.destinations?.filter(dest => dest.adresse || dest.contact || dest.telephone || dest.notes) ?? [];
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="sr-only">{selected.formNumber}</SheetTitle>
                </SheetHeader>

                {/* ── Dark header ── */}
                <div className="bg-zinc-900 dark:bg-zinc-950 px-6 pt-10 pb-8 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-5"
                    style={{ backgroundImage: "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)", backgroundSize: "12px 12px" }} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                          <Truck className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">Livraison</span>
                      </div>
                      <Badge className={`border-0 text-xs font-semibold ${STATUS_COLORS[selected.status] || ""}`}>
                        {STATUS_LABELS[selected.status] || selected.status}
                      </Badge>
                    </div>
                    <p className="text-white text-3xl font-bold font-mono tracking-tight">{selected.formNumber}</p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className="text-zinc-500 text-xs">
                        {new Date(selected.updatedAt).toLocaleDateString("fr-CA", {
                          timeZone: "America/New_York",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Body ── */}
                <div className="divide-y">

                  {/* Marchandise */}
                  <div className="px-6 py-5 space-y-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Marchandise</p>
                    <div className="space-y-2.5">
                      {d.typeMarchandise && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Type</span>
                          <span className="text-sm font-medium">{d.typeMarchandise}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" /> Unités
                        </span>
                        <span className="text-sm font-semibold">{d.nbUnites || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Poids total</span>
                        <span className="text-sm font-medium">
                          {d.poidsTotal ? `${d.poidsTotal} ${d.unitePoids || "kg"}` : "—"}
                        </span>
                      </div>
                      {d.reference && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5" /> Référence
                          </span>
                          <span className="text-sm font-mono font-medium">{d.reference}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Destinations — route timeline */}
                  {filledDests.length > 0 && (
                    <div className="px-6 py-5 space-y-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        {filledDests.length > 1 ? `${filledDests.length} Destinations` : "Destination"}
                      </p>
                      <div className="relative pl-5">
                        {filledDests.length > 1 && (
                          <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
                        )}
                        <div className="space-y-5">
                          {filledDests.map((dest, i) => (
                            <div key={i} className="relative">
                              <div className={`absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center
                                ${i === 0 ? "bg-primary border-primary" : "bg-background border-border"}`}>
                                {i > 0 && <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
                              </div>
                              <div className="space-y-1 min-h-[1.5rem]">
                                {dest.adresse && (
                                  <p className="text-sm font-semibold leading-snug">{dest.adresse}</p>
                                )}
                                {dest.contact && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <User className="h-3 w-3 flex-shrink-0" />{dest.contact}
                                  </p>
                                )}
                                {dest.telephone && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Phone className="h-3 w-3 flex-shrink-0" />{dest.telephone}
                                  </p>
                                )}
                                {dest.notes && (
                                  <p className="text-xs text-muted-foreground italic">{dest.notes}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Options */}
                  {(d.hasRendezVous || d.hasTailgate) && (
                    <div className="px-6 py-5 space-y-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Options</p>
                      <div className="flex flex-wrap gap-2">
                        {d.hasTailgate && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-2.5 py-1.5">
                            <Truck className="h-3 w-3" /> Hayon requis
                          </span>
                        )}
                        {d.hasRendezVous && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-2.5 py-1.5">
                            <Calendar className="h-3 w-3" />
                            RV : {d.rvDate || ""}{d.rvTime ? ` à ${d.rvTime}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Billing + docs */}
                  {(d.modeBilling || (d.documentation && d.documentation.length > 0)) && (
                    <div className="px-6 py-5 space-y-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Facturation & documents</p>
                      {d.modeBilling && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Mode</span>
                          <span className="text-sm font-medium capitalize">{d.modeBilling}</span>
                        </div>
                      )}
                      {d.documentation && d.documentation.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {d.documentation.map((doc) => (
                            <span key={doc} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                              <FileText className="h-3 w-3 text-muted-foreground" />{doc}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instructions */}
                  {d.instructionsSpeciales && (
                    <div className="px-6 py-5 space-y-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Instructions spéciales</p>
                      <div className="flex gap-3">
                        <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-foreground/80 leading-relaxed">{d.instructionsSpeciales}</p>
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="px-6 py-5">
                    <Link href={`/portal/forms/${selected.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                      <Button variant="outline" className="w-full gap-2 font-medium" data-testid="button-open-full-form">
                        Ouvrir le formulaire complet
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>

                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
