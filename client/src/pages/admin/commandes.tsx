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
import { Search, ShoppingCart, ExternalLink, FileText, CheckCircle2, Package } from "lucide-react";

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

export default function AdminCommandes() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");

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

  const stats = useMemo(() => {
    if (!forms) return { total: 0, approved: 0, completed: 0, revenue: 0 };
    return {
      total: forms.length,
      approved: forms.filter((f) => f.status === "approved").length,
      completed: forms.filter((f) => f.status === "completed").length,
      revenue: forms.reduce((sum, f) => sum + (f.price ? Number(f.price) : 0), 0),
    };
  }, [forms]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Commandes
        </h1>
        <p className="text-muted-foreground mt-1">
          Services approuvés et complétés — catalogue de référence pour les clients
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Approuvés</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{stats.approved}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Terminés</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-purple-600 dark:text-purple-400">{stats.completed}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Valeur totale</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">
                {stats.revenue > 0
                  ? `$${stats.revenue.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </p>
            )}
          </CardContent>
        </Card>
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
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
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
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contactFilter} onValueChange={setContactFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-contact-filter">
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
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Prix (CAD)</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead>Bon de travail Zoho</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((form) => {
                    const contact = contactMap.get(form.contactId);
                    return (
                      <TableRow
                        key={form.id}
                        data-testid={`row-commande-${form.id}`}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/forms/${form.id}`)}
                      >
                        <TableCell className="font-mono font-semibold text-sm">
                          {form.formNumber}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[form.formType] || "bg-gray-100 text-gray-700"}`}
                          >
                            {TYPE_LABELS[form.formType] || form.formType}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {contact?.companyName || contact?.name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {form.updatedAt
                            ? new Date(form.updatedAt).toLocaleDateString("fr-CA")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] || ""}`}
                          >
                            {STATUS_LABELS[form.status] || form.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {form.price
                            ? `$${Number(form.price).toFixed(2)}`
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {form.approvedQuantity
                            ? Number(form.approvedQuantity).toLocaleString("fr-CA")
                            : <span className="text-muted-foreground">—</span>}
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
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/forms/${form.id}`);
                            }}
                            data-testid={`button-view-commande-${form.id}`}
                          >
                            <FileText className="h-3 w-3" />
                            Voir
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
    </div>
  );
}
