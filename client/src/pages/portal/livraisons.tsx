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
  Package, Hash, Phone, User, FileText, Calendar, MessageSquare, Filter,
  CheckCircle2, Box, CalendarClock
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
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  completed: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
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
      const formDate = new Date(f.updatedAt ?? 0);
      if (dateFrom) matchesDate = matchesDate && formDate >= new Date(dateFrom);
      if (dateTo) matchesDate = matchesDate && formDate <= new Date(dateTo + "T23:59:59");

      return matchesSearch && matchesStatus && matchesMarchandise && matchesDate;
    });
  }, [forms, search, statusFilter, marchandiseFilter, dateFrom, dateTo]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!forms) return { total: 0, pending: 0, completed: 0 };
    return {
      total: forms.length,
      pending: forms.filter(f => ["submitted", "in_review", "approved"].includes(f.status)).length,
      completed: forms.filter(f => f.status === "completed").length
    };
  }, [forms]);

  if (isLoading) {
    return (
      <div className="space-y-6 w-full max-w-full">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in w-full max-w-full">
      {/* Header section with gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
        <div className="absolute -top-24 -right-24">
          <div className="h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-widest uppercase mb-4">
              <Truck className="h-3.5 w-3.5" /> Centre d'expédition
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              Livraisons
            </h1>
            <p className="text-muted-foreground mt-3 text-lg">
              Suivi et historique de toutes vos sorties d'inventaire et expéditions.
            </p>
          </div>
          
          <div className="flex gap-4">
            <Card className="bg-background/50 backdrop-blur-sm border-border/50 shadow-sm border-0 min-w-[140px]">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" /> En transit
                </p>
                <p className="text-3xl font-mono font-bold text-amber-500">{stats.pending}</p>
              </CardContent>
            </Card>
            <Card className="bg-background/50 backdrop-blur-sm border-border/50 shadow-sm border-0 min-w-[140px]">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> Complétées
                </p>
                <p className="text-3xl font-mono font-bold text-emerald-500">{stats.completed}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-2">
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Rechercher par numéro, destination, référence..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-12 text-base bg-transparent border-transparent hover:border-border focus:border-border transition-all shadow-none"
                data-testid="input-search-livraisons"
              />
            </div>
            
            <div className="h-px xl:h-8 w-full xl:w-px bg-border my-2 xl:my-0" />
            
            <div className="flex items-center gap-2 px-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-[160px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-status-filter">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={marchandiseFilter} onValueChange={setMarchandiseFilter}>
                <SelectTrigger className="h-10 w-[160px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-marchandise-filter">
                  <SelectValue placeholder="Marchandise" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes marchandises</SelectItem>
                  {MERCHANDISE_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 shrink-0 bg-muted/50 rounded-md p-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[130px] text-xs border-transparent bg-transparent shadow-none"
                  data-testid="input-date-from"
                />
                <span className="text-xs font-medium text-muted-foreground px-1">à</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[130px] text-xs border-transparent bg-transparent shadow-none"
                  data-testid="input-date-to"
                />
              </div>

              {(search || statusFilter !== "all" || marchandiseFilter !== "all" || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 shrink-0 text-muted-foreground hover:text-foreground font-bold"
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
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <Truck className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Aucune livraison trouvée</h3>
            <p className="text-muted-foreground max-w-sm">
              Modifiez vos filtres ou créez une nouvelle demande de livraison pour voir apparaître des résultats.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <Table className="w-full min-w-[1000px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/30 border-b border-border">
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4">Numéro</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4">Date</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4">Destination</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4">Marchandise</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4 text-right">Vol/Poids</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground py-4">Statut</TableHead>
                  <TableHead className="w-12 py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((form) => {
                  const d = getLivData(form);
                  const dest = getFirstDestination(form);
                  return (
                    <TableRow
                      key={form.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50 group"
                      onClick={() => setSelected(form)}
                      data-testid={`row-livraison-${form.id}`}
                    >
                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {form.formNumber}
                          </span>
                          {d.reference && (
                            <span className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              REF: {d.reference}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="text-sm font-medium text-foreground">
                          {new Date(form.updatedAt ?? 0).toLocaleString("fr-CA", {
                            timeZone: "America/New_York",
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 max-w-[250px]">
                          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate" title={dest}>
                            {dest}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-xs font-medium">
                          <Box className="h-3.5 w-3.5 text-muted-foreground" />
                          {d.typeMarchandise || "Non spécifié"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-mono font-bold">
                            {d.nbUnites ? `${d.nbUnites} un.` : "—"}
                          </span>
                          {d.poidsTotal && (
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {d.poidsTotal} {d.unitePoids || "kg"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={`font-bold border px-2.5 py-1 uppercase tracking-wide text-[10px] ${STATUS_COLORS[form.status] || ""}`}>
                          {STATUS_LABELS[form.status] || form.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
                            navigate(`/portal/forms/${form.id}${qs}`);
                          }}
                          data-testid={`button-open-form-${form.id}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-xl p-0 overflow-y-auto border-l-0 sm:border-l sm:rounded-l-2xl shadow-2xl">
          {selected && (() => {
            const d = getLivData(selected);
            const filledDests = d.destinations?.filter(dest => dest.adresse || dest.contact || dest.telephone || dest.notes) ?? [];
            return (
              <div className="flex flex-col h-full bg-background">
                <SheetHeader className="sr-only">
                  <SheetTitle>{selected.formNumber}</SheetTitle>
                </SheetHeader>

                {/* ── Header ── */}
                <div className="bg-card px-8 pt-12 pb-8 border-b relative overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-emerald-500/5" />
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Truck className="h-32 w-32 text-emerald-500" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-widest uppercase">
                        Détails Livraison
                      </div>
                      <Badge variant="outline" className={`font-bold border px-3 py-1.5 uppercase tracking-wide text-xs ${STATUS_COLORS[selected.status] || ""}`}>
                        {STATUS_LABELS[selected.status] || selected.status}
                      </Badge>
                    </div>
                    
                    <h2 className="text-4xl font-mono font-bold tracking-tight text-foreground mb-4">
                      {selected.formNumber}
                    </h2>
                    
                    <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {new Date(selected.updatedAt ?? 0).toLocaleDateString("fr-CA", {
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
                <div className="flex-1 overflow-y-auto p-8 space-y-8">

                  {/* Marchandise Grid */}
                  <section>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Package className="h-4 w-4" /> Informations Marchandise
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Type</p>
                        <p className="font-medium text-foreground">{d.typeMarchandise || "Non spécifié"}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Référence</p>
                        <p className="font-mono font-bold text-foreground">{d.reference || "—"}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Unités</p>
                        <p className="font-mono font-bold text-foreground text-xl">{d.nbUnites || "—"}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Poids Total</p>
                        <p className="font-mono font-bold text-foreground text-xl">
                          {d.poidsTotal ? `${d.poidsTotal} ${d.unitePoids || "kg"}` : "—"}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Destinations Timeline */}
                  {filledDests.length > 0 && (
                    <section>
                      <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> Itinéraire ({filledDests.length})
                      </h3>
                      <div className="relative pl-6 space-y-8">
                        {filledDests.length > 1 && (
                          <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border rounded-full" />
                        )}
                        {filledDests.map((dest, i) => (
                          <div key={i} className="relative">
                            <div className={`absolute -left-[30px] top-1.5 h-4 w-4 rounded-full border-[3px] flex items-center justify-center bg-background
                              ${i === 0 ? "border-primary" : i === filledDests.length - 1 ? "border-emerald-500" : "border-muted-foreground"}`}>
                            </div>
                            
                            <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
                              {dest.adresse && (
                                <p className="font-bold text-base leading-snug">{dest.adresse}</p>
                              )}
                              
                              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-2">
                                {dest.contact && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                                      <User className="h-3.5 w-3.5" />
                                    </div>
                                    <span className="font-medium">{dest.contact}</span>
                                  </div>
                                )}
                                {dest.telephone && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                                      <Phone className="h-3.5 w-3.5" />
                                    </div>
                                    <span className="font-mono">{dest.telephone}</span>
                                  </div>
                                )}
                              </div>
                              
                              {dest.notes && (
                                <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700 dark:text-amber-400">
                                  <span className="font-bold uppercase tracking-widest text-[10px] block mb-1">Note pour le chauffeur</span>
                                  {dest.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Options & Logistics */}
                  <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {(d.hasRendezVous || d.hasTailgate) && (
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Exigences Logistiques</h3>
                        <div className="flex flex-col gap-2">
                          {d.hasTailgate && (
                            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                              <Truck className="h-4 w-4 text-foreground shrink-0" />
                              <span className="font-medium text-sm">Camion avec hayon (Tailgate) requis</span>
                            </div>
                          )}
                          {d.hasRendezVous && (
                            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                              <Calendar className="h-4 w-4 text-foreground shrink-0" />
                              <span className="font-medium text-sm">
                                Sur rendez-vous : <span className="font-bold">{d.rvDate || ""} {d.rvTime ? `à ${d.rvTime}` : ""}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {(d.modeBilling || (d.documentation && d.documentation.length > 0)) && (
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Administration</h3>
                        <div className="space-y-3">
                          {d.modeBilling && (
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                              <span className="text-sm font-medium text-muted-foreground">Facturation</span>
                              <Badge variant="outline" className="uppercase font-bold tracking-widest text-[10px]">{d.modeBilling}</Badge>
                            </div>
                          )}
                          {d.documentation && d.documentation.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {d.documentation.map((doc) => (
                                <Badge key={doc} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-0 flex gap-1.5 py-1">
                                  <FileText className="h-3 w-3" /> {doc}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Instructions */}
                  {d.instructionsSpeciales && (
                    <section>
                      <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Instructions Spéciales
                      </h3>
                      <div className="p-4 rounded-xl border border-border bg-muted/30">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{d.instructionsSpeciales}</p>
                      </div>
                    </section>
                  )}
                </div>

                {/* ── Footer CTA ── */}
                <div className="p-6 bg-card border-t border-border mt-auto shrink-0">
                  <Link href={`/portal/forms/${selected.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                    <Button size="lg" className="w-full font-bold shadow-lg shadow-primary/20 text-base h-14" data-testid="button-open-full-form">
                      Ouvrir le dossier complet
                      <ArrowUpRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>

              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
