import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Save, Send, Loader2, Cloud, CloudOff, Link as LinkIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import type { FormSubmission, Contact } from "@shared/schema";
import { TriForm, defaultTriData } from "@/components/forms/tri-form";
import { InspectionForm, defaultInspectionData } from "@/components/forms/inspection-form";

const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Informations globales du TRI",
  inspection: "Instructions d'inspection / Tri / Rework",
  copacking: "Bon de travail / Co-packing",
  livraison: "Formulaire de livraison",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Complété",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface FormEditorProps {
  formId: number;
  role: "admin" | "client";
  backUrl: string;
}

export default function FormEditor({ formId, role, backUrl }: FormEditorProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState<any>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [revisionDesc, setRevisionDesc] = useState("");

  const { data: form, isLoading } = useQuery<FormSubmission & { uploads?: any[] }>({
    queryKey: ["/api/forms", formId],
  });

  const { data: contact } = useQuery<Contact>({
    queryKey: ["/api/contacts", form?.contactId],
    enabled: !!form?.contactId && role === "admin",
  });

  const { status: saveStatus, setData, save } = useAutoSave(
    form && form.status === "draft" ? form.id : null
  );

  useEffect(() => {
    if (form) {
      try {
        const parsed = JSON.parse(form.data || "{}");
        setFormData(parsed);
      } catch {
        setFormData({});
      }
    }
  }, [form]);

  const handleChange = useCallback((data: any) => {
    setFormData(data);
    setData(data);
  }, [setData]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/forms/${formId}`, {
        data: formData,
        status: "submitted",
        revisionDescription: revisionDesc || "Soumission initiale",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      setSubmitDialogOpen(false);
      toast({ title: "Formulaire soumis", description: "Le formulaire a été soumis avec succès." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message || "La soumission a échoué.", variant: "destructive" });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/forms/${formId}`, { data: formData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      toast({ title: "Brouillon sauvegardé" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PUT", `/api/forms/${formId}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      toast({ title: "Statut mis à jour" });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isDisabled = role === "client" && form.status !== "draft";
  const isDraft = form.status === "draft";
  const revisionHistory = JSON.parse(form.revisionHistory || "[]");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={backUrl}>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-forms">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" data-testid="text-form-number">{form.formNumber}</h1>
              <Badge className={STATUS_COLORS[form.status]}>{STATUS_LABELS[form.status] || form.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{FORM_TYPE_LABELS[form.formType] || form.formType}</p>
            {contact && <p className="text-xs text-muted-foreground">Client: {contact.name}{contact.companyName ? ` (${contact.companyName})` : ""}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && saveStatus === "saving" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sauvegarde...</span>}
          {isDraft && saveStatus === "saved" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Cloud className="h-3 w-3" />Sauvegardé</span>}
          {isDraft && saveStatus === "error" && <span className="text-xs text-destructive flex items-center gap-1"><CloudOff className="h-3 w-3" />Erreur</span>}

          {role === "admin" && !isDraft && (
            <Select value={form.status} onValueChange={(v) => statusMutation.mutate(v)} disabled={statusMutation.isPending}>
              <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-form-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="submitted">Soumis</SelectItem>
                <SelectItem value="in_review">En révision</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="completed">Complété</SelectItem>
              </SelectContent>
            </Select>
          )}

          {!isDisabled && isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={() => saveDraftMutation.mutate()} disabled={saveDraftMutation.isPending} data-testid="button-save-draft">
                <Save className="h-3.5 w-3.5 mr-1" />
                {saveDraftMutation.isPending ? "..." : "Sauvegarder"}
              </Button>
              <Button size="sm" onClick={() => setSubmitDialogOpen(true)} data-testid="button-submit-form">
                <Send className="h-3.5 w-3.5 mr-1" />
                Soumettre
              </Button>
            </>
          )}

          {role === "admin" && !isDraft && (
            <Button variant="outline" size="sm" onClick={() => {
              apiRequest("PUT", `/api/forms/${formId}`, { data: formData, revisionDescription: "Modification admin" })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
                  toast({ title: "Modifications sauvegardées" });
                })
                .catch(() => toast({ title: "Erreur", variant: "destructive" }));
            }} data-testid="button-admin-save">
              <Save className="h-3.5 w-3.5 mr-1" />
              Sauvegarder
            </Button>
          )}
        </div>
      </div>

      {form.linkedFormId && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Formulaire lié :
          </span>
          <Link href={`${backUrl.includes("admin") ? "/admin" : "/portal"}/forms/${form.linkedFormId}`}>
            <Button variant="link" size="sm" className="text-blue-600 p-0 h-auto" data-testid="link-linked-form">
              Voir le formulaire lié
            </Button>
          </Link>
        </div>
      )}

      {formData !== null && (
        <>
          {form.formType === "tri" && (
            <TriForm data={formData} onChange={handleChange} disabled={isDisabled && role !== "admin"} />
          )}
          {form.formType === "inspection" && (
            <InspectionForm data={formData} onChange={handleChange} disabled={isDisabled && role !== "admin"} revisionHistory={revisionHistory} />
          )}
          {!["tri", "inspection"].includes(form.formType) && (
            <div className="text-center py-12 text-muted-foreground">
              Ce type de formulaire sera disponible prochainement.
            </div>
          )}
        </>
      )}

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soumettre le formulaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Une fois soumis, vous ne pourrez plus modifier ce formulaire. L'équipe Système-D le révisera.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Note de soumission (optionnel)</label>
              <Input
                value={revisionDesc}
                onChange={(e) => setRevisionDesc(e.target.value)}
                placeholder="Décrivez ce qui a changé..."
                data-testid="input-revision-desc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} data-testid="button-confirm-submit">
              {submitMutation.isPending ? "Soumission..." : "Confirmer la soumission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
