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
import { ArrowLeft, Save, Send, Loader2, Cloud, CloudOff, Link as LinkIcon, Truck, Download } from "lucide-react";
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
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  completed: "Completed",
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
    if (!formData) return "No data to submit.";
    if (form?.formType === "tri") {
      if (!formData.client?.trim()) return "The Client field is required.";
      if (!formData.nomProjet?.trim()) return "The Project Name field is required.";
      if (!formData.codePiece?.trim()) return "The Part Code field is required.";
    }
    if (form?.formType === "inspection") {
      if (!formData.customer?.trim()) return "The Client field is required.";
      if (!formData.partNumber?.trim()) return "The Part Number field is required.";
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
      toast({ title: "Form submitted", description: "The form has been submitted successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Submission failed.", variant: "destructive" });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/forms/${formId}`, { data: formData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      toast({ title: "Draft saved" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PUT", `/api/forms/${formId}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
      toast({ title: "Status updated" });
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
      toast({ title: "Delivery form created", description: `${livForm.formNumber} linked to this work order.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  const isDraft = form.status === "draft";
  const isDisabled = role === "client" && !isDraft;
  const formFieldsDisabled = role === "client" && !isDraft;
  const revisionHistory = Array.isArray(form.revisionHistory) ? form.revisionHistory : (typeof form.revisionHistory === "string" ? JSON.parse(form.revisionHistory) : []);

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
          {isDraft && saveStatus === "saving" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>}
          {isDraft && saveStatus === "saved" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Cloud className="h-3 w-3" />Saved</span>}
          {isDraft && saveStatus === "error" && <span className="text-xs text-destructive flex items-center gap-1"><CloudOff className="h-3 w-3" />Save error</span>}

          {role === "admin" && !isDraft && (() => {
            const adminTransitions: Record<string, { value: string; label: string }[]> = {
              submitted: [{ value: "in_review", label: "In Review" }],
              in_review: [{ value: "approved", label: "Approved" }, { value: "submitted", label: "Submitted" }],
              approved: [{ value: "completed", label: "Completed" }, { value: "in_review", label: "In Review" }],
              completed: [],
            };
            const options = adminTransitions[form.status] || [];
            if (options.length === 0) return null;
            return (
              <Select value="" onValueChange={(v) => statusMutation.mutate(v)} disabled={statusMutation.isPending}>
                <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-form-status">
                  <SelectValue placeholder="Change status..." />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}

          {!isDisabled && isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={() => saveDraftMutation.mutate()} disabled={saveDraftMutation.isPending} data-testid="button-save-draft">
                <Save className="h-3.5 w-3.5 mr-1" />
                {saveDraftMutation.isPending ? "..." : "Save"}
              </Button>
              <Button size="sm" onClick={() => setSubmitDialogOpen(true)} data-testid="button-submit-form">
                <Send className="h-3.5 w-3.5 mr-1" />
                Submit
              </Button>
            </>
          )}

          {role === "admin" && !isDraft && (
            <Button variant="outline" size="sm" onClick={() => {
              apiRequest("PUT", `/api/forms/${formId}`, { data: formData, revisionDescription: "Admin edit" })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
                  toast({ title: "Changes saved" });
                })
                .catch(() => toast({ title: "Error", variant: "destructive" }));
            }} data-testid="button-admin-save">
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          )}

          {!isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.open(`/api/forms/${formId}/pdf`, "_blank");
              }}
              data-testid="button-download-pdf"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              PDF
            </Button>
          )}
        </div>
      </div>

      {form.linkedFormId && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Linked form:
          </span>
          <Link href={`${backUrl.includes("admin") ? "/admin" : "/portal"}/forms/${form.linkedFormId}`}>
            <Button variant="ghost" size="sm" className="text-blue-600 p-0 h-auto underline" data-testid="link-linked-form">
              View linked form
            </Button>
          </Link>
        </div>
      )}

      {form.formType === "copacking" && !form.linkedFormId && role === "admin" && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            Create a delivery form linked to this work order
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createLinkedLivraisonMutation.mutate()}
            disabled={createLinkedLivraisonMutation.isPending}
            data-testid="button-create-linked-livraison"
          >
            <Truck className="h-3.5 w-3.5 mr-1" />
            {createLinkedLivraisonMutation.isPending ? "Creating..." : "Create delivery"}
          </Button>
        </div>
      )}

      {formData !== null && (
        <>
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
        </>
      )}

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit form</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Once submitted, you will no longer be able to edit this form. The Système-D team will review it.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Submission note (optional)</label>
              <Input
                value={revisionDesc}
                onChange={(e) => setRevisionDesc(e.target.value)}
                placeholder="Describe what changed..."
                data-testid="input-revision-desc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} data-testid="button-confirm-submit">
              {submitMutation.isPending ? "Submitting..." : "Confirm submission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
