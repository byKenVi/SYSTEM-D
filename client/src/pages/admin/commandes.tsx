import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { FormSubmission, Contact } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ShoppingCart,
  ExternalLink,
  FileText,
  DollarSign,
  Package,
  User,
  Calendar,
  ArrowUpRight,
  Hash,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

const TYPE_COLORS: Record<string, string> = {
  entreposage: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  tri: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  inspection: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  copacking: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  livraison: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approuvé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

// Human-readable labels for common form data fields
const FIELD_LABELS: Record<string, string> = {
  nomClient: "Nom du client",
  raisonSociale: "Raison sociale",
  descriptionMarchandise: "Description marchandise",
  nomProduit: "Nom du produit",
  quantiteUnites: "Quantité (unités)",
  quantite: "Quantité",
  typeEmballage: "Type d'emballage",
  dateReception: "Date de réception",
  dateDebut: "Date de début",
  dateFin: "Date de fin",
  adresseEntreposage: "Adresse d'entreposage",
  description: "Description",
  objetDemande: "Objet de la demande",
  objetInspection: "Objet de l'inspection",
  paletteNb: "Nombre de palettes",
  adresseDest: "Adresse de destination",
  adresseDestination: "Adresse de destination",
  instructions: "Instructions",
  noteSpeciale: "Note spéciale",
  transporteur: "Transporteur",
  telephone: "Téléphone",
  courriel: "Courriel",
  numeroBon: "N° de bon",
};

// Fields to never display (internal/noise)
const HIDDEN_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "revision", "linkedFormId",
  "submittedBy", "submittedByName", "contactId", "formType", "formNumber",
  "status", "data", "revisionHistory", "uploads",
]);

function extractFormFields(data: unknown): Array<{ label: string; value: string }> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const result: Array<{ label: string; value: string }> = [];
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (val === null || val === undefined || val === "" || val === false) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "object" && !Array.isArray(val)) continue; // skip nested objects
    const label = FIELD_LABELS[key] || key;
    const value = Array.isArray(val) ? val.join(", ") : String(val);
    if (value.trim()) result.push({ label, value });
    if (result.length >= 10) break; // cap at 10 fields
  }
  return result;
}

export default function AdminCommandes() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["/api/admin/commandes"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const contactMap = useMemo(() => new Map(contacts?.map((c) => [c.id, c]) || []), [contacts]);

  const filtered = useMemo(() => {
    if (!forms) return [];
    return forms.filter((f) => {
      const contact = contactMap.get(f.contactId);
      const matchesSearch =
        f.formNumber.toLowerCase().includes(search.toLowerCase()) ||
        (contact?.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (contact?.companyName || "").toLowerCase().includes(search.toLowerCase()) ||
        (TYPE_LABELS[f.formType] || f.formType).toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || f.formType === typeFilter;
      const matchesStatus = statusFilter === "all" || f.status === statusFilter;
      const matchesContact = contactFilter === "all" || String(f.contactId) === contactFilter;
      return matchesSearch && matchesType && matchesStatus && matchesContact;
    });
  }, [forms, search, typeFilter, statusFilter, contactFilter, contactMap]);

  const selectedContact = selected ? contactMap.get(selected.contactId) : null;
  const selectedFields = selected ? extractFormFields(selected.data) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Commandes
        </h1>
        <p className="text-muted-foreground mt-1">
          Demandes approuvées devenues des opérations à exécuter, distinctes des commandes de la Boutique.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par n°, type, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-commandes"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contactFilter} onValueChange={setContactFilter}>
          <SelectTrigger className="w-full sm:w-[170px]" data-testid="select-contact-filter">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {contacts?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.companyName || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">Aucune commande</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les commandes apparaissent lorsque des soumissions sont approuvées.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Prix (CAD)</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead>Zoho SO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((form) => {
                    const contact = contactMap.get(form.contactId);
                    const isSelected = selected?.id === form.id;
                    return (
                      <TableRow
                        key={form.id}
                        data-testid={`row-commande-${form.id}`}
                        className="cursor-pointer"
                        data-state={isSelected ? "selected" : undefined}
                        onClick={() => setSelected(form)}
                      >
                        <TableCell className="font-mono font-semibold text-sm">
                          <button
                            className="text-primary hover:underline font-mono font-semibold"
                            onClick={(e) => { e.stopPropagation(); navigate(`/admin/forms/${form.id}`); }}
                          >
                            {form.formNumber}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[form.formType] || "bg-gray-100 text-gray-700"}`}>
                            {TYPE_LABELS[form.formType] || form.formType}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {contact ? (
                            <button
                              className="hover:underline text-left"
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/contacts/${form.contactId}`); }}
                            >
                              {contact.companyName || contact.name || "—"}
                            </button>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("fr-CA") : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] || ""}`}>
                            {STATUS_LABELS[form.status] || form.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {form.price ? `$${Number(form.price).toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {form.approvedQuantity ? Number(form.approvedQuantity).toLocaleString("fr-CA") : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {form.zohoSalesOrderUrl ? (
                            <a
                              href={form.zohoSalesOrderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              data-testid={`link-zoho-so-${form.id}`}
                            >
                              {form.zohoSalesOrderNumber || "Voir"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
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

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-commande-detail">
          {selected && (
            <>
              <SheetHeader className="pb-2">
                <div className="flex items-start gap-3 flex-wrap">
                  <SheetTitle className="font-mono text-xl">{selected.formNumber}</SheetTitle>
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[selected.formType] || ""}`}>
                      {TYPE_LABELS[selected.formType] || selected.formType}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selected.status] || ""}`}>
                      {STATUS_LABELS[selected.status] || selected.status}
                    </span>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 mt-4">

                {/* Client */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium">{selectedContact?.companyName || selectedContact?.name || "—"}</p>
                      {selectedContact?.email && (
                        <p className="text-sm text-muted-foreground">{selectedContact.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Order details */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Détails de la commande</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                        Prix (CAD)
                      </div>
                      <p className="text-xl font-bold font-mono">
                        {selected.price
                          ? `$${Number(selected.price).toFixed(2)}`
                          : <span className="text-sm font-normal text-muted-foreground">Non défini</span>}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Package className="h-3.5 w-3.5" />
                        Quantité
                      </div>
                      <p className="text-xl font-bold font-mono">
                        {selected.approvedQuantity
                          ? Number(selected.approvedQuantity).toLocaleString("fr-CA")
                          : (selected.data as any)?.requestedQuantity
                            ? Number((selected.data as any).requestedQuantity).toLocaleString("fr-CA")
                            : (selected.data as any)?.quantite
                              ? String((selected.data as any).quantite)
                              : <span className="text-sm font-normal text-muted-foreground">Non défini</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      {selected.updatedAt
                        ? new Date(selected.updatedAt).toLocaleString("fr-CA", {
                            timeZone: "America/New_York",
                            dateStyle: "long",
                            timeStyle: "short",
                          })
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Zoho Sales Order */}
                {selected.zohoSalesOrderNumber && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bon de travail Zoho</p>
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono font-medium">{selected.zohoSalesOrderNumber}</span>
                        {selected.zohoSalesOrderUrl && (
                          <a
                            href={selected.zohoSalesOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
                          >
                            Ouvrir dans Zoho
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Zoho Projects */}
                {selected.zohoProjectId && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projet Zoho Projects</p>
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono font-medium text-sm">{selected.zohoProjectId}</span>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Soumission details */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Soumission liée</p>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono font-semibold text-sm">{selected.formNumber}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[selected.formType] || ""}`}>
                          {TYPE_LABELS[selected.formType] || selected.formType}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 px-2"
                        onClick={() => { setSelected(null); navigate(`/admin/forms/${selected.id}`); }}
                        data-testid="button-open-soumission"
                      >
                        Ouvrir
                        <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    </div>

                    {selectedFields.length > 0 && (
                      <div className="space-y-1.5 border-t border-border/50 pt-2.5">
                        {selectedFields.map(({ label, value }) => (
                          <div key={label} className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground min-w-[120px] flex-shrink-0 text-xs pt-0.5">{label}</span>
                            <span className="font-medium text-xs leading-relaxed break-words">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Full form button */}
                <Button
                  className="w-full gap-2"
                  onClick={() => { setSelected(null); navigate(`/admin/forms/${selected.id}`); }}
                  data-testid="button-view-full-soumission"
                >
                  <FileText className="h-4 w-4" />
                  Voir la soumission complète
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
