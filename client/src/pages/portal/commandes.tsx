import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FormSubmission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShoppingCart,
  RotateCcw,
  FileText,
  Search,
  ArrowLeftRight,
  Warehouse,
  Package2,
  Truck,
  ClipboardCheck,
  CheckCircle2,
  DollarSign,
  Filter,
  LayoutGrid,
  LayoutList,
} from "lucide-react";
import { Link } from "wouter";

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

const TYPE_ICONS: Record<string, any> = {
  entreposage: Warehouse,
  tri: ArrowLeftRight,
  inspection: ClipboardCheck,
  copacking: Package2,
  livraison: Truck,
};

const TYPE_COLORS: Record<string, { bg: string; text: string; light: string; border: string }> = {
  entreposage: {
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    light: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/20"
  },
  tri: {
    bg: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    light: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20"
  },
  inspection: {
    bg: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    light: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/20"
  },
  copacking: {
    bg: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    light: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20"
  },
  livraison: {
    bg: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    light: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20"
  },
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approuvé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/30",
};

function getFormDescription(form: FormSubmission): string {
  const data = form.data as Record<string, any> | null;
  if (!data) return "";
  if (form.formType === "entreposage") return data.descriptionMarchandise || data.nomProduit || "";
  if (form.formType === "tri") return data.description || data.objetDemande || "";
  if (form.formType === "copacking") return data.description || data.objetDemande || "";
  if (form.formType === "livraison") return data.description || data.adresseDest || "";
  if (form.formType === "inspection") return data.description || data.objetInspection || "";
  return "";
}

function getFormPreviewTags(form: FormSubmission): { label: string; value: string }[] {
  const data = form.data as Record<string, any> | null;
  if (!data) return [];
  const tag = (label: string, value: any) =>
    value ? { label, value: String(value) } : null;

  if (form.formType === "entreposage") {
    return [
      tag("Client", data.client || data.nomClient),
      tag("Produit", data.nomProduit || data.descriptionMarchandise),
      tag("Palettes", data.nbPalettes),
      tag("Arrivée", data.dateArrivee),
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (form.formType === "tri") {
    return [
      tag("Client", data.client),
      tag("Projet", data.nomProjet),
      tag("Code pièce", data.codePiece),
      tag("Qté", data.qteTotal),
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (form.formType === "inspection") {
    return [
      tag("Client", data.customer),
      tag("Pièce", data.partNumber),
      tag("Poste", data.posteTravail),
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (form.formType === "copacking") {
    return [
      tag("Client", data.client),
      tag("Projet", data.projet),
      tag("Référence", data.reference),
      tag("Date BT", data.dateBonTravail),
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (form.formType === "livraison") {
    return [
      tag("Destinataire", data.nomDest || data.clientName),
      tag("Adresse", data.adresseDest),
      tag("Ville", data.villeDest),
    ].filter(Boolean) as { label: string; value: string }[];
  }
  return [];
}

export default function PortalCommandes({ viewAsContactId }: { viewAsContactId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [confirmForm, setConfirmForm] = useState<FormSubmission | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("commandes_viewMode") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });

  const queryKey = viewAsContactId
    ? ["/api/portal/commandes", { contactId: viewAsContactId }]
    : ["/api/portal/commandes"];

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey,
    queryFn: () =>
      fetch(
        viewAsContactId
          ? `/api/portal/commandes?contactId=${viewAsContactId}`
          : "/api/portal/commandes",
        { credentials: "include" }
      ).then((r) => r.json()),
  });

  const reorderMutation = useMutation({
    mutationFn: async (formId: number) => {
      const res = await apiRequest("POST", `/api/forms/${formId}/reorder`);
      return res.json();
    },
    onSuccess: (newForm) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/commandes"] });
      toast({ title: "Commande soumise", description: `La demande ${newForm.formNumber} a été soumise à l'admin pour approbation.` });
      setConfirmForm(null);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de soumettre la commande.", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!forms) return [];
    return forms.filter((f) => {
      const label = TYPE_LABELS[f.formType] || f.formType;
      const matchesSearch =
        f.formNumber.toLowerCase().includes(search.toLowerCase()) ||
        label.toLowerCase().includes(search.toLowerCase()) ||
        getFormDescription(f).toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || f.formType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [forms, search, typeFilter]);

  const stats = useMemo(() => {
    if (!forms) return { total: 0, types: {} as Record<string, number> };
    const types: Record<string, number> = {};
    for (const f of forms) {
      types[f.formType] = (types[f.formType] || 0) + 1;
    }
    return { total: forms.length, types };
  }, [forms]);

  return (
    <div className="space-y-8 animate-in w-full max-w-full">
      {/* Header section with gradient background */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
          <div className="h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              <ShoppingCart className="h-3.5 w-3.5" /> Catalogue Services
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              Commandes Approuvées
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Historique de vos services validés. Re-commandez d'un simple clic.
            </p>
          </div>
          
          <Button asChild size="lg" className="shadow-lg shadow-primary/20 shrink-0">
            <Link href={`/portal/forms${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
              <FileText className="h-5 w-5 mr-2" />
              Nouvelle Demande
            </Link>
          </Button>
        </div>

        {/* Stats Chips */}
        {!isLoading && stats.total > 0 && (
          <div className="flex flex-wrap gap-3 mt-8 pt-6 border-t border-border/50">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-background/50 border border-border/50 backdrop-blur-sm shadow-sm">
              <span className="text-2xl font-mono font-bold text-foreground leading-none">{stats.total}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider leading-tight">Total<br/>Dispo</span>
            </div>
            {Object.entries(stats.types).map(([type, count]) => {
              const colors = TYPE_COLORS[type];
              const Icon = TYPE_ICONS[type] || FileText;
              return (
                <div
                  key={type}
                  className={`flex items-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-sm shadow-sm transition-transform hover:scale-105 ${colors?.light || "bg-muted"} ${colors?.border || "border-border"}`}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-background/50`}>
                    <Icon className={`h-4 w-4 ${colors?.text || "text-foreground"}`} />
                  </div>
                  <div>
                    <span className="block text-xl font-mono font-bold leading-none text-foreground">{count}</span>
                    <span className={`block text-[10px] font-bold uppercase tracking-widest leading-tight ${colors?.text || "text-muted-foreground"}`}>
                      {TYPE_LABELS[type] || type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters & Content */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-card/50 p-2 rounded-xl border shadow-sm">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              placeholder="Rechercher par numéro, type, ou description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-12 text-base bg-background border-transparent hover:border-border focus:border-primary transition-all shadow-none"
              data-testid="input-search-commandes"
            />
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 w-full sm:w-auto px-2">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-12 w-full sm:w-[200px] bg-background border-transparent hover:border-border focus:border-primary transition-all shadow-none font-medium" data-testid="select-type-filter">
                <SelectValue placeholder="Type de service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-medium">Tous les services</SelectItem>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="font-medium">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1 px-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-10 w-10"
              onClick={() => { setViewMode("grid"); try { localStorage.setItem("commandes_viewMode", "grid"); } catch {} }}
              title="Vue grille"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-10 w-10"
              onClick={() => { setViewMode("list"); try { localStorage.setItem("commandes_viewMode", "list"); } catch {} }}
              title="Vue liste"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[220px] w-full rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">Aucune commande disponible</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Les commandes apparaissent ici une fois vos demandes de services approuvées par l'administration.
              </p>
              <Button size="lg" asChild className="shadow-sm">
                <Link href={`/portal/forms${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Créer une demande
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "list" ? (
          <div className="flex flex-col gap-2">
            {filtered.map((form) => {
              const TypeIcon = TYPE_ICONS[form.formType] || FileText;
              const colors = TYPE_COLORS[form.formType] || {
                bg: "bg-gray-500",
                text: "text-gray-600",
                light: "bg-gray-50",
                border: "border-gray-200"
              };
              const description = getFormDescription(form);
              const hasPrice = form.price != null && Number(form.price) > 0;
              const hasQty = form.approvedQuantity != null && Number(form.approvedQuantity) > 0;

              return (
                <div
                  key={form.id}
                  className="group flex items-center gap-4 px-4 py-3 rounded-xl border bg-card hover:bg-accent/30 transition-colors cursor-pointer"
                  data-testid={`card-commande-${form.id}`}
                  onClick={() => navigate(`/portal/forms/${form.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`)}
                >
                  <div className={`h-9 w-9 rounded-lg ${colors.light} ${colors.border} border flex items-center justify-center shrink-0`}>
                    <TypeIcon className={`h-4 w-4 ${colors.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm" data-testid={`text-form-number-${form.id}`}>{form.formNumber}</span>
                      <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-widest border-0 px-1.5 py-0 ${colors.light} ${colors.text}`}>
                        {TYPE_LABELS[form.formType] || form.formType}
                      </Badge>
                    </div>
                    {description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{description}</p>
                    )}
                  </div>
                  {hasPrice && (
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 shrink-0 hidden sm:flex items-center gap-1" data-testid={`text-price-${form.id}`}>
                      <DollarSign className="h-3.5 w-3.5" />
                      {Number(form.price).toLocaleString("fr-CA", { minimumFractionDigits: 2 })}
                      {hasQty && <span className="text-xs text-muted-foreground">/ {Number(form.approvedQuantity).toLocaleString("fr-CA")} un.</span>}
                    </span>
                  )}
                  <div className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${STATUS_COLORS[form.status] || "bg-muted"}`}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {STATUS_LABELS[form.status] || form.status}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 font-bold text-xs shadow-sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmForm(form); }}
                      disabled={reorderMutation.isPending}
                      data-testid={`button-reorder-${form.id}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Re-commander
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      asChild
                      data-testid={`button-view-form-${form.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/portal/forms/${form.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                        <FileText className="h-3.5 w-3.5" />
                        <span className="sr-only">Voir</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {filtered.map((form) => {
              const TypeIcon = TYPE_ICONS[form.formType] || FileText;
              const colors = TYPE_COLORS[form.formType] || {
                bg: "bg-gray-500",
                text: "text-gray-600",
                light: "bg-gray-50",
                border: "border-gray-200"
              };
              const description = getFormDescription(form);
              const previewTags = getFormPreviewTags(form);
              const hasPrice = form.price != null && Number(form.price) > 0;
              const hasQty = form.approvedQuantity != null && Number(form.approvedQuantity) > 0;
              
              return (
                <Card
                  key={form.id}
                  className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 cursor-pointer flex flex-col h-full bg-card"
                  data-testid={`card-commande-${form.id}`}
                  onClick={() => navigate(`/portal/forms/${form.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`)}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${colors.bg}`} />
                  
                  <CardContent className="p-6 flex flex-col h-full relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl ${colors.light} ${colors.border} border flex items-center justify-center shadow-sm`}>
                          <TypeIcon className={`h-6 w-6 ${colors.text}`} />
                        </div>
                        <div>
                          <Badge variant="outline" className={`mb-1.5 font-bold uppercase tracking-widest text-[9px] border-0 px-2 py-0.5 ${colors.light} ${colors.text}`}>
                            {TYPE_LABELS[form.formType] || form.formType}
                          </Badge>
                          <h3 className="font-mono font-bold text-lg leading-none" data-testid={`text-form-number-${form.id}`}>
                            {form.formNumber}
                          </h3>
                        </div>
                      </div>
                      
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[form.status] || "bg-muted"}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        {STATUS_LABELS[form.status] || form.status}
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      {description && (
                        <p className="text-sm font-medium text-foreground line-clamp-2">
                          {description}
                        </p>
                      )}

                      {hasPrice && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Tarif Approuvé</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1" data-testid={`text-price-${form.id}`}>
                            <DollarSign className="h-4 w-4" />
                            {Number(form.price).toLocaleString("fr-CA", { minimumFractionDigits: 2 })}
                            {hasQty && <span className="text-xs text-muted-foreground ml-1">/ {Number(form.approvedQuantity).toLocaleString("fr-CA")} un.</span>}
                          </span>
                        </div>
                      )}

                      {previewTags.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                          {previewTags.slice(0, 4).map((t) => (
                            <div key={t.label} className="space-y-0.5">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t.label}</p>
                              <p className="text-xs font-medium truncate text-foreground">{t.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3">
                      <Button
                        size="sm"
                        className="flex-1 font-bold shadow-md shadow-primary/20 transition-transform group-hover:scale-[1.02]"
                        onClick={(e) => { e.stopPropagation(); setConfirmForm(form); }}
                        disabled={reorderMutation.isPending}
                        data-testid={`button-reorder-${form.id}`}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Re-commander
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                        asChild
                        data-testid={`button-view-form-${form.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/portal/forms/${form.id}${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`}>
                          <FileText className="h-4 w-4" />
                          <span className="sr-only">Voir</span>
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!confirmForm} onOpenChange={(open) => { if (!open) setConfirmForm(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-reorder-confirm">
          <DialogHeader>
            <DialogTitle className="text-xl">Confirmer la re-commande</DialogTitle>
          </DialogHeader>
          {confirmForm && (
            <div className="space-y-6 py-4">
              <p className="text-base text-muted-foreground">
                Une nouvelle demande basée sur le service <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{confirmForm.formNumber}</span> sera soumise pour approbation.
              </p>
              
              <div className={`relative overflow-hidden rounded-xl border p-4 ${TYPE_COLORS[confirmForm.formType]?.light || "bg-muted"} ${TYPE_COLORS[confirmForm.formType]?.border || "border-border"}`}>
                <div className="flex items-start gap-4 relative z-10">
                  {(() => {
                    const TypeIcon = TYPE_ICONS[confirmForm.formType] || FileText;
                    const colors = TYPE_COLORS[confirmForm.formType];
                    return (
                      <>
                        <div className={`h-10 w-10 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm border ${colors?.border}`}>
                          <TypeIcon className={`h-5 w-5 ${colors?.text || ""}`} />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Service à dupliquer</p>
                          <p className={`font-bold ${colors?.text || ""}`}>
                            {TYPE_LABELS[confirmForm.formType] || confirmForm.formType}
                          </p>
                          <p className="text-sm font-medium mt-1 truncate">
                            {getFormDescription(confirmForm)}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setConfirmForm(null)}
              data-testid="button-cancel-reorder"
            >
              Annuler
            </Button>
            <Button
              className="shadow-lg shadow-primary/20 font-bold"
              onClick={() => confirmForm && reorderMutation.mutate(confirmForm.id)}
              disabled={reorderMutation.isPending}
              data-testid="button-confirm-reorder"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {reorderMutation.isPending ? "Soumission..." : "Soumettre la commande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
