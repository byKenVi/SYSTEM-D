import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { FormSubmission, Contact } from "@shared/schema";
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
  Truck,
  Search,
  ArrowUpRight,
  MapPin,
  Package,
  Hash,
  Phone,
  User,
  FileText,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { Link } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const MERCHANDISE_OPTIONS = [
  "Palette",
  "Boîte",
  "Caisse",
  "Enveloppe",
  "Colis",
  "Vrac",
  "Autre",
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
  const first = d.destinations[0];
  return first.adresse || "—";
}

function getContactName(form: FormSubmission, contacts: Contact[]): string {
  const c = contacts.find((c) => c.id === form.contactId);
  return c ? c.name || c.companyName || `#${form.contactId}` : `#${form.contactId}`;
}

export default function AdminLivraisons() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [marchandiseFilter, setMarchandiseFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["/api/admin/livraisons"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const contactsList = contacts || [];

  const filtered = useMemo(() => {
    if (!forms) return [];
    return forms.filter((f) => {
      const d = getLivData(f);
      const dest = getFirstDestination(f);
      const clientName = getContactName(f, contactsList);
      const searchLower = search.toLowerCase();

      const matchesSearch =
        !search ||
        f.formNumber.toLowerCase().includes(searchLower) ||
        clientName.toLowerCase().includes(searchLower) ||
        dest.toLowerCase().includes(searchLower) ||
        (d.reference || "").toLowerCase().includes(searchLower) ||
        (d.typeMarchandise || "").toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === "all" || f.status === statusFilter;
      const matchesClient = clientFilter === "all" || String(f.contactId) === clientFilter;
      const matchesMarchandise = marchandiseFilter === "all" || d.typeMarchandise === marchandiseFilter;

      let matchesDate = true;
      const formDate = new Date(f.updatedAt);
      if (dateFrom) matchesDate = matchesDate && formDate >= new Date(dateFrom);
      if (dateTo) matchesDate = matchesDate && formDate <= new Date(dateTo + "T23:59:59");

      return matchesSearch && matchesStatus && matchesClient && matchesMarchandise && matchesDate;
    });
  }, [forms, search, statusFilter, clientFilter, marchandiseFilter, dateFrom, dateTo, contactsList]);

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
        <p className="text-sm text-muted-foreground mt-1">Historique des sorties d'inventaire du système</p>
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
                <SelectItem value="submitted">Soumis</SelectItem>
                <SelectItem value="in_review">En révision</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
              </SelectContent>
            </Select>

            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-9 w-[160px] text-sm" data-testid="select-client-filter">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les clients</SelectItem>
                {contactsList.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                    {c.name || c.companyName}
                  </SelectItem>
                ))}
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

            {(search || statusFilter !== "all" || clientFilter !== "all" || marchandiseFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setClientFilter("all");
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
                    <TableHead className="text-xs font-semibold">Client</TableHead>
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
                    const clientName = getContactName(form, contactsList);
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
                        <TableCell className="text-sm max-w-[120px] truncate">{clientName}</TableCell>
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
                        <TableCell className="text-sm font-mono text-xs">
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
                              navigate(`/admin/forms/${form.id}`);
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
        <SheetContent className="w-full sm:max-w-md p-0 overflow-y-auto flex flex-col gap-0">
          {selected && (() => {
            const d = getLivData(selected);
            const clientName = getContactName(selected, contactsList);
            return (
              <>
                {/* ── Hero header ── */}
                <div className="bg-emerald-600 dark:bg-emerald-700 text-white px-6 pt-8 pb-6">
                  <SheetHeader className="mb-0">
                    <SheetTitle className="sr-only">{selected.formNumber}</SheetTitle>
                  </SheetHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Truck className="h-6 w-6 text-white" />
                    </div>
                    <Badge className={`mt-0.5 border-0 text-xs font-semibold ${STATUS_COLORS[selected.status] || ""}`}>
                      {STATUS_LABELS[selected.status] || selected.status}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <p className="text-2xl font-bold tracking-tight">{selected.formNumber}</p>
                    <p className="text-emerald-100 text-sm mt-0.5">{clientName}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-200">
                    <Calendar className="h-3 w-3" />
                    {new Date(selected.updatedAt).toLocaleString("fr-CA", {
                      timeZone: "America/New_York",
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* ── Key metrics ── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3 text-center">
                      <Package className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xl font-bold">{d.nbUnites || "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Unités</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3 text-center">
                      <Truck className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xl font-bold leading-tight">
                        {d.poidsTotal ? d.poidsTotal : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">
                        {d.poidsTotal ? (d.unitePoids || "kg") : "Poids"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3 text-center">
                      <Hash className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-sm font-bold font-mono truncate">{d.reference || "—"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Référence</p>
                    </div>
                  </div>

                  {/* ── Marchandise type ── */}
                  {d.typeMarchandise && (
                    <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Type de marchandise</p>
                        <p className="text-sm font-medium mt-0.5">{d.typeMarchandise}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Destinations ── */}
                  {d.destinations && d.destinations.some(dest => dest.adresse || dest.contact || dest.telephone) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                        {(d.destinations.length > 1) ? "Destinations" : "Destination"}
                      </p>
                      {d.destinations.map((dest, i) => (
                        (dest.adresse || dest.contact || dest.telephone || dest.notes) ? (
                          <div key={i} className="rounded-xl border p-4 space-y-2">
                            {d.destinations!.length > 1 && (
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">#{i + 1}</p>
                            )}
                            {dest.adresse && (
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold leading-snug">{dest.adresse}</p>
                              </div>
                            )}
                            {dest.contact && (
                              <div className="flex items-center gap-2 ml-6">
                                <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <p className="text-xs text-muted-foreground">{dest.contact}</p>
                              </div>
                            )}
                            {dest.telephone && (
                              <div className="flex items-center gap-2 ml-6">
                                <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <p className="text-xs text-muted-foreground">{dest.telephone}</p>
                              </div>
                            )}
                            {dest.notes && (
                              <p className="text-xs text-muted-foreground italic ml-6">{dest.notes}</p>
                            )}
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}

                  {/* ── Options ── */}
                  {(d.hasRendezVous || d.hasTailgate) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Options</p>
                      <div className="flex flex-wrap gap-2">
                        {d.hasTailgate && (
                          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
                            <Truck className="h-3 w-3" />
                            Hayon requis
                          </div>
                        )}
                        {d.hasRendezVous && (
                          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
                            <Calendar className="h-3 w-3" />
                            RV : {d.rvDate || ""}{d.rvTime ? ` à ${d.rvTime}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Billing + docs ── */}
                  {(d.modeBilling || (d.documentation && d.documentation.length > 0)) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Facturation & documents</p>
                      <div className="rounded-xl border p-4 space-y-3">
                        {d.modeBilling && (
                          <p className="text-sm capitalize font-medium">{d.modeBilling}</p>
                        )}
                        {d.documentation && d.documentation.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {d.documentation.map((doc) => (
                              <div key={doc} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                                <FileText className="h-3 w-3 text-muted-foreground" />
                                {doc}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Instructions ── */}
                  {d.instructionsSpeciales && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Instructions spéciales</p>
                      <div className="rounded-xl border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{d.instructionsSpeciales}</p>
                      </div>
                    </div>
                  )}

                  {/* ── CTA ── */}
                  <Link href={`/admin/forms/${selected.id}`}>
                    <Button className="w-full gap-2" data-testid="button-open-full-form">
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
