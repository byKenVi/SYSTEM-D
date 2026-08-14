import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import type { FormSubmission } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, ChevronRight, ArrowLeftRight, Warehouse, Package2, Truck, ClipboardList, ClipboardEdit, Download } from "lucide-react";
import { useState } from "react";
import FormEditor from "@/pages/form-editor";

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
  product_work_order: "Bon de travail produit",
};

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

const FORM_TYPES = [
  {
    value: "tri",
    label: "Tri",
    desc: "Demande de service de tri",
    icon: ArrowLeftRight,
    color: "bg-blue-500",
    light: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    value: "entreposage",
    label: "Entreposage",
    desc: "Demande d'entreposage et de stockage",
    icon: Warehouse,
    color: "bg-amber-500",
    light: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    value: "copacking",
    label: "Co-packing",
    desc: "Bon de travail co-packing",
    icon: Package2,
    color: "bg-violet-500",
    light: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
  {
    value: "livraison",
    label: "Livraison",
    desc: "Demande de livraison",
    icon: Truck,
    color: "bg-emerald-500",
    light: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
];

export default function PortalForms({ viewAsContactId }: { viewAsContactId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isViewAs = !!viewAsContactId;

  const [matchEdit, paramsEdit] = useRoute("/portal/forms/:id");

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "forms"]
      : ["/api/portal/forms"],
  });

  const [newFormOpen, setNewFormOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadPdf = async (e: React.MouseEvent, formId: number) => {
    e.stopPropagation();
    setDownloadingId(formId);
    try {
      const r = await fetch(`/api/forms/${formId}/pdf`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast({
          title: "Erreur de téléchargement",
          description: body.message || `Erreur HTTP ${r.status}`,
          variant: "destructive",
        });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `Soumission-${formId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erreur", description: "Impossible de télécharger le PDF.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const createFormMutation = useMutation({
    mutationFn: async (formType: string) => {
      const body: Record<string, any> = { formType, data: {} };
      if (viewAsContactId) body.contactId = viewAsContactId;
      const res = await apiRequest("POST", "/api/forms", body);
      return res.json();
    },
    onSuccess: (form: FormSubmission) => {
      if (viewAsContactId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/view-as", viewAsContactId, "forms"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
      }
      setNewFormOpen(false);
      const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
      navigate(`/portal/forms/${form.id}${qs}`);
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  if (matchEdit && paramsEdit?.id) {
    const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
    return <FormEditor formId={Number(paramsEdit.id)} role={isViewAs ? "admin" : "client"} backUrl={`/portal/forms${qs}`} />;
  }

  const goToForm = (id: number) => {
    const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
    navigate(`/portal/forms/${id}${qs}`);
  };

  return (
    <div className="space-y-6 animate-in w-full max-w-full">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
          <div className="h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              <ClipboardEdit className="h-3.5 w-3.5" /> Centre de Formulaires
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              Mes Soumissions
            </h1>
            <p className="text-muted-foreground mt-3 text-lg">
              Créez de nouvelles demandes de services et suivez leur état d'avancement.
            </p>
          </div>
          <Button
            size="lg"
            className="shadow-lg shadow-primary/20 shrink-0 font-bold"
            onClick={() => setNewFormOpen(true)}
            data-testid="button-new-form-portal"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nouveau Formulaire
          </Button>
        </div>
      </div>

      {/* Main List */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !forms || forms.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">Aucun formulaire</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Commencez par créer votre première demande de service.
              </p>
              <Button
                size="lg"
                onClick={() => setNewFormOpen(true)}
                data-testid="button-new-form-empty"
                className="font-bold shadow-md shadow-primary/20"
              >
                <Plus className="h-4 w-4 mr-2" />
                Créer un formulaire
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Numéro</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Type</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Statut</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Date de Création</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Dernière Modif.</TableHead>
                    <TableHead className="w-12 py-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => {
                    const typeCfg = FORM_TYPES.find(t => t.value === form.formType);
                    const TypeIcon = typeCfg?.icon || FileText;
                    return (
                      <TableRow
                        key={form.id}
                        className="cursor-pointer group hover:bg-muted/50 transition-colors"
                        onClick={() => goToForm(form.id)}
                        data-testid={`row-form-${form.id}`}
                      >
                        <TableCell className="py-4">
                          <span className="font-mono font-bold text-base text-foreground">{form.formNumber}</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${typeCfg?.light || "bg-muted"} border-border`}>
                              <TypeIcon className={`h-4 w-4 ${typeCfg?.text || "text-muted-foreground"}`} />
                            </div>
                            <span className="font-bold text-sm text-foreground">{TYPE_LABELS[form.formType] || form.formType}</span>
                            {form.formType === "product_work_order" && (form.data as any)?.sourceProductName && (
                              <span className="text-xs text-muted-foreground">{(form.data as any).sourceProductName}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className={`font-bold border px-2.5 py-1 uppercase tracking-wide text-[10px] ${STATUS_COLORS[form.status]}`}>
                            {STATUS_LABELS[form.status] || form.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                          {form.createdAt ? new Date(form.createdAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell className="py-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                          {form.updatedAt ? new Date(form.updatedAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {form.status !== "draft" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                disabled={downloadingId === form.id}
                                onClick={(e) => handleDownloadPdf(e, form.id)}
                                title="Télécharger le PDF"
                                data-testid={`button-download-pdf-${form.id}`}
                              >
                                <Download className={`h-4 w-4 ${downloadingId === form.id ? "animate-spin" : ""}`} />
                              </Button>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
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

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden border-border/50 shadow-2xl">
          <div className="bg-primary/5 p-6 border-b border-border/50 flex gap-4 items-start">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight mb-2">Nouvelle demande de service</DialogTitle>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                Sélectionnez le type de formulaire que vous souhaitez créer. Un brouillon sera automatiquement sauvegardé.
              </p>
            </div>
          </div>
          
          <div className="p-6 bg-background">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FORM_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => createFormMutation.mutate(t.value)}
                    disabled={createFormMutation.isPending}
                    data-testid={`button-create-${t.value}`}
                    className={`group flex items-start gap-4 rounded-xl border border-border/50 p-4 text-left transition-all hover:border-primary/40 hover:shadow-md bg-card disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className={`h-10 w-10 rounded-lg ${t.color} flex items-center justify-center flex-shrink-0 shadow-sm text-white`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={`font-bold text-sm text-foreground mb-1 group-hover:text-primary transition-colors`}>{t.label}</p>
                      <p className="text-[11px] font-medium text-muted-foreground leading-snug">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
