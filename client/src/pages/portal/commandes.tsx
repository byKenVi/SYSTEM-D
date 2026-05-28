import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FormSubmission } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
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

const TYPE_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  entreposage: {
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    light: "bg-amber-50 dark:bg-amber-950/40",
  },
  tri: {
    bg: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    light: "bg-blue-50 dark:bg-blue-950/40",
  },
  inspection: {
    bg: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    light: "bg-rose-50 dark:bg-rose-950/40",
  },
  copacking: {
    bg: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    light: "bg-violet-50 dark:bg-violet-950/40",
  },
  livraison: {
    bg: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    light: "bg-emerald-50 dark:bg-emerald-950/40",
  },
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approuvé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Commandes
        </h1>
        <p className="text-muted-foreground mt-1">
          Vos services approuvés — re-commandez en un clic
        </p>
      </div>

      {/* Summary chips */}
      {!isLoading && stats.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-muted font-medium">
            <ShoppingCart className="h-3.5 w-3.5" />
            {stats.total} service{stats.total !== 1 ? "s" : ""} disponible{stats.total !== 1 ? "s" : ""}
          </span>
          {Object.entries(stats.types).map(([type, count]) => {
            const colors = TYPE_COLORS[type];
            return (
              <span
                key={type}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${colors?.light || "bg-muted"} ${colors?.text || ""}`}
              >
                {TYPE_LABELS[type] || type} ({count})
              </span>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par n°, type, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-commandes"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type de service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">Aucune commande disponible</p>
            <p className="text-sm text-muted-foreground mt-1">
              Les commandes apparaissent ici une fois vos soumissions approuvées.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/portal/forms">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Créer une demande de service
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((form) => {
            const TypeIcon = TYPE_ICONS[form.formType] || FileText;
            const colors = TYPE_COLORS[form.formType] || {
              bg: "bg-gray-500",
              text: "text-gray-600",
              light: "bg-gray-50",
            };
            const description = getFormDescription(form);
            const previewTags = getFormPreviewTags(form);
            const hasPrice = form.price != null && Number(form.price) > 0;
            const hasQty = form.approvedQuantity != null && Number(form.approvedQuantity) > 0;
            return (
              <Card
                key={form.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                data-testid={`card-commande-${form.id}`}
                onClick={() => navigate(`/portal/forms/${form.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`h-10 w-10 rounded-lg ${colors.light} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon className={`h-5 w-5 ${colors.text}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm" data-testid={`text-form-number-${form.id}`}>
                          {form.formNumber}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.light} ${colors.text}`}>
                          {TYPE_LABELS[form.formType] || form.formType}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] || ""}`}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {STATUS_LABELS[form.status] || form.status}
                        </span>
                        {hasPrice && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" data-testid={`text-price-${form.id}`}>
                            <DollarSign className="h-3 w-3" />
                            {Number(form.price).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
                            {hasQty && <span className="opacity-70">· {Number(form.approvedQuantity).toLocaleString("fr-CA")} unité{Number(form.approvedQuantity) !== 1 ? "s" : ""}</span>}
                          </span>
                        )}
                      </div>

                      {description && (
                        <p className="text-sm text-muted-foreground mt-1.5 truncate">{description}</p>
                      )}

                      {previewTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {previewTags.map((t) => (
                            <span key={t.label} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-1.5 py-0.5">
                              <span className="text-muted-foreground">{t.label} :</span>
                              <span className="font-medium truncate max-w-[120px]">{t.value}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground mt-2">
                        Approuvé le{" "}
                        {form.updatedAt
                          ? new Date(form.updatedAt).toLocaleDateString("fr-CA", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        asChild
                        data-testid={`button-view-form-${form.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/portal/forms/${form.id}`}>
                          <FileText className="h-3.5 w-3.5" />
                          Voir
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={(e) => { e.stopPropagation(); setConfirmForm(form); }}
                        disabled={reorderMutation.isPending}
                        data-testid={`button-reorder-${form.id}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Re-commander
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirmForm} onOpenChange={(open) => { if (!open) setConfirmForm(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-reorder-confirm">
          <DialogHeader>
            <DialogTitle>Confirmer la re-commande</DialogTitle>
          </DialogHeader>
          {confirmForm && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Une nouvelle demande basée sur{" "}
                <span className="font-mono font-semibold text-foreground">{confirmForm.formNumber}</span>{" "}
                ({TYPE_LABELS[confirmForm.formType] || confirmForm.formType}) sera soumise <span className="font-semibold text-foreground">directement à l'administration</span> pour approbation avec les mêmes informations. Une fois approuvée, un bon de commande sera créé automatiquement.
              </p>
              <div className={`flex items-start gap-3 p-3 rounded-lg ${TYPE_COLORS[confirmForm.formType]?.light || "bg-muted"}`}>
                {(() => {
                  const TypeIcon = TYPE_ICONS[confirmForm.formType] || FileText;
                  const colors = TYPE_COLORS[confirmForm.formType];
                  return (
                    <>
                      <TypeIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${colors?.text || ""}`} />
                      <div>
                        <p className={`text-sm font-semibold ${colors?.text || ""}`}>
                          {TYPE_LABELS[confirmForm.formType] || confirmForm.formType}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{confirmForm.formNumber}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmForm(null)}
              data-testid="button-cancel-reorder"
            >
              Annuler
            </Button>
            <Button
              onClick={() => confirmForm && reorderMutation.mutate(confirmForm.id)}
              disabled={reorderMutation.isPending}
              data-testid="button-confirm-reorder"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {reorderMutation.isPending ? "Soumission..." : "Soumettre la commande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
