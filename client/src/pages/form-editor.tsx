import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Save, Send, Loader2, Cloud, CloudOff, Link as LinkIcon, Truck, Download, User, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import type { FormSubmission, Contact } from "@shared/schema";
import { TriForm, defaultTriData, type TriFormData } from "@/components/forms/tri-form";
import { InspectionForm, defaultInspectionData, type InspectionFormData } from "@/components/forms/inspection-form";
import { EntreposageForm, defaultEntreposageData, type EntreposageFormData } from "@/components/forms/entreposage-form";
import { CopackingForm, defaultCopackingData, type CopackingFormData } from "@/components/forms/copacking-form";
import { LivraisonForm, defaultLivraisonData, type LivraisonFormData } from "@/components/forms/livraison-form";

type FormData = TriFormData | InspectionFormData | EntreposageFormData | CopackingFormData | LivraisonFormData;

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
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  completed: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
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
      let d: Partial<FormData>;
      if (typeof form.data === "string") {
        try { d = JSON.parse(form.data); } catch { d = {}; }
      } else {
        d = (form.data as Partial<FormData>) || {};
      }
      const defaults: Record<string, FormData> = {
        tri: defaultTriData,
        inspection: defaultInspectionData,
        entreposage: defaultEntreposageData,
        copacking: defaultCopackingData,
        livraison: defaultLivraisonData,
      };
      const typeDefault = defaults[form.formType];
      const merged = typeDefault ? { ...typeDefault, ...d } : d;
      setFormData(merged);
    }
  }, [form]);

  const handleChange = useCallback((data: FormData) => {
    setFormData(data);
    setData(data);
  }, [setData]);

  const persistUploadRecord = useCallback(async (fieldKey: string, file: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => {
    if (!formId) return;
    try {
      await apiRequest("POST", `/api/forms/${formId}/uploads`, {
        fieldKey,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        fileSize: file.fileSize,
      });
    } catch (err) {
      console.error("Failed to persist upload record:", err);
    }
  }, [formId]);

  function validateBeforeSubmit(): string | null {
    if (!formData) return "Aucune donnée à soumettre.";
    if (form?.formType === "tri") {
      if (!formData.client?.trim()) return "Le champ Client est requis.";
      if (!formData.nomProjet?.trim()) return "Le champ Nom du projet est requis.";
      if (!formData.codePiece?.trim()) return "Le champ Code pièce est requis.";
    }
    if (form?.formType === "inspection") {
      if (!formData.customer?.trim()) return "Le champ Client est requis.";
      if (!formData.partNumber?.trim()) return "Le champ Numéro de pièce est requis.";
    }
    return null;
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateBeforeSubmit();
      if (validationError) throw new Error(validationError);
      await apiRequest("PUT", `/api/forms/${formId}`, {
        data: formData,
        status: "submitted",
        revisionDescription: revisionDesc || "Initial submission",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      setSubmitDialogOpen(false);
      toast({ title: "Formulaire soumis", description: "Le formulaire a été soumis avec succès." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message || "Échec de la soumission.", variant: "destructive" });
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

  const createLinkedLivraisonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/forms/${formId}/create-linked-livraison`);
      return res.json();
    },
    onSuccess: (livForm: FormSubmission) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      toast({ title: "Formulaire de livraison créé", description: `${livForm.formNumber} lié à ce bon de travail.` });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 w-full">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  const isDraft = form.status === "draft";
  const isDisabled = role === "client" && !isDraft;
  const formFieldsDisabled = role === "client" && !isDraft;
  const revisionHistory = Array.isArray(form.revisionHistory) ? form.revisionHistory : (typeof form.revisionHistory === "string" ? JSON.parse(form.revisionHistory) : []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in pb-20 w-full">
      
      {/* ── Action Header (Sticky) ── */}
      <div className="sticky top-0 z-40 -mx-4 px-4 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50 mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-muted shrink-0"
            data-testid="button-back-forms"
            onClick={async () => {
              if (isDraft) {
                await save();
                queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
                queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
              }
              navigate(backUrl);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground" data-testid="text-form-number">
                {form.formNumber}
              </h1>
              <Badge variant="outline" className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest border ${STATUS_COLORS[form.status] || "border-border text-muted-foreground"}`}>
                {STATUS_LABELS[form.status] || form.status}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 mt-1 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              {FORM_TYPE_LABELS[form.formType] || form.formType}
              
              {contact && (
                <>
                  <span className="text-border mx-2">•</span>
                  <User className="h-4 w-4" />
                  <span className="text-foreground">
                    {contact.name}
                    {contact.companyName && <span className="opacity-60 ml-1">({contact.companyName})</span>}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          
          {/* Status Indicators */}
          <div className="hidden sm:flex items-center px-4">
            {isDraft && saveStatus === "saving" && (
              <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Auto-save...
              </span>
            )}
            {isDraft && saveStatus === "saved" && (
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Cloud className="h-3.5 w-3.5" /> À jour
              </span>
            )}
            {isDraft && saveStatus === "error" && (
              <span className="text-xs font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                <CloudOff className="h-3.5 w-3.5" /> Hors ligne
              </span>
            )}
            {!isDraft && (
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verrouillé
              </span>
            )}
          </div>

          {/* Actions */}
          {!isDisabled && isDraft && (
            <>
              <Button 
                variant="outline" 
                onClick={() => saveDraftMutation.mutate()} 
                disabled={saveDraftMutation.isPending || saveStatus === "saving"} 
                className="font-bold flex-1 sm:flex-none"
                data-testid="button-save-draft"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveDraftMutation.isPending ? "..." : "Enregistrer"}
              </Button>
              <Button 
                onClick={() => setSubmitDialogOpen(true)} 
                className="font-bold shadow-lg shadow-primary/20 flex-1 sm:flex-none"
                data-testid="button-submit-form"
              >
                <Send className="h-4 w-4 mr-2" />
                Soumettre
              </Button>
            </>
          )}

          {role === "admin" && !isDraft && (
            <Button 
              variant="default" 
              onClick={() => {
                apiRequest("PUT", `/api/forms/${formId}`, { data: formData, revisionDescription: "Admin edit" })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
                    toast({ title: "Modifications enregistrées" });
                  })
                  .catch(() => toast({ title: "Erreur", variant: "destructive" }));
              }} 
              className="font-bold shadow-md shadow-primary/20 flex-1 sm:flex-none"
              data-testid="button-admin-save"
            >
              <Save className="h-4 w-4 mr-2" />
              Forcer sauvegarde
            </Button>
          )}

          {!isDraft && (
            <Button variant="outline" asChild className="font-bold flex-1 sm:flex-none" data-testid="button-download-pdf">
              <a href={`/api/forms/${formId}/pdf`} download>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* ── Banners ── */}
      <div className="space-y-4">
        {form.linkedFormId && (
          <div className="flex items-center justify-between p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">Liaison de document</p>
                <p className="text-sm font-medium text-foreground">Ce document est lié à une autre demande de service.</p>
              </div>
            </div>
            <Button variant="outline" asChild className="shrink-0 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10">
              <Link href={`${backUrl.includes("admin") ? "/admin" : "/portal"}/forms/${form.linkedFormId}`} data-testid="link-linked-form">
                Voir le document lié
              </Link>
            </Button>
          </div>
        )}

        {form.formType === "copacking" && !form.linkedFormId && role === "admin" && (
          <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-0.5">Action Admin</p>
                <p className="text-sm font-medium text-foreground">Générer un bon de livraison à partir de ce Co-packing.</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-bold"
              onClick={() => createLinkedLivraisonMutation.mutate()}
              disabled={createLinkedLivraisonMutation.isPending}
              data-testid="button-create-linked-livraison"
            >
              <Truck className="h-4 w-4 mr-2" />
              {createLinkedLivraisonMutation.isPending ? "Création..." : "Créer Livraison"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Form Render ── */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        {formData !== null && (
          <div className="p-6 sm:p-8">
            {form.formType === "tri" && (
              <TriForm data={formData} onChange={handleChange} disabled={formFieldsDisabled} />
            )}
            {form.formType === "inspection" && (
              <InspectionForm data={formData} onChange={handleChange} disabled={formFieldsDisabled} revisionHistory={revisionHistory} onFileAdded={(fieldKey, file) => persistUploadRecord(fieldKey, file)} />
            )}
            {form.formType === "entreposage" && (
              <EntreposageForm data={formData} onChange={handleChange} disabled={formFieldsDisabled} />
            )}
            {form.formType === "copacking" && (
              <CopackingForm data={formData} onChange={handleChange} disabled={formFieldsDisabled} />
            )}
            {form.formType === "livraison" && (
              <LivraisonForm data={formData} onChange={handleChange} disabled={formFieldsDisabled} />
            )}
          </div>
        )}
      </div>

      {/* ── Submit Dialog ── */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/50 shadow-2xl">
          <div className="bg-primary/5 p-6 border-b border-border/50 flex gap-4 items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight mb-2">Verrouiller et soumettre</DialogTitle>
              <DialogDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
                Une fois soumis, ce document passera en mode lecture seule. L'équipe Système-D sera notifiée et procédera à l'évaluation de votre demande.
              </DialogDescription>
            </div>
          </div>
          
          <div className="p-6 space-y-4 bg-background">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Note pour l'administration (optionnel)
              </label>
              <Input
                value={revisionDesc}
                onChange={(e) => setRevisionDesc(e.target.value)}
                placeholder="Ex: Urgent, commande client en attente..."
                className="h-12 text-base font-medium shadow-none focus-visible:ring-1"
                data-testid="input-revision-desc"
              />
            </div>
            
            <DialogFooter className="pt-4 gap-2 sm:gap-0">
              <Button variant="ghost" className="font-bold" onClick={() => setSubmitDialogOpen(false)}>
                Annuler
              </Button>
              <Button 
                className="font-bold shadow-lg shadow-primary/20" 
                onClick={() => submitMutation.mutate()} 
                disabled={submitMutation.isPending} 
                data-testid="button-confirm-submit"
              >
                {submitMutation.isPending ? "Validation en cours..." : "Soumettre définitivement"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
