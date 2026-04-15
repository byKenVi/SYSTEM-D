import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import type { FormSubmission } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, ChevronRight } from "lucide-react";
import { useState } from "react";
import FormEditor from "@/pages/form-editor";

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
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

const FORM_TYPES = [
  { value: "tri", label: "Tri (Sorting)", desc: "Demande de service de tri" },
  { value: "entreposage", label: "Entreposage", desc: "Demande d'entreposage" },
  { value: "copacking", label: "Co-packing", desc: "Bon de travail co-packing" },
  { value: "livraison", label: "Livraison", desc: "Demande de livraison" },
];

export default function PortalForms({ viewAsContactId }: { viewAsContactId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isViewAs = !!viewAsContactId;

  const pathPrefix = viewAsContactId ? `/portal/forms` : `/portal/forms`;
  const [matchEdit, paramsEdit] = useRoute("/portal/forms/:id");

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "forms"]
      : ["/api/portal/forms"],
  });

  const [newFormOpen, setNewFormOpen] = useState(false);

  const createFormMutation = useMutation({
    mutationFn: async (formType: string) => {
      const res = await apiRequest("POST", "/api/forms", {
        formType,
        data: {},
      });
      return res.json();
    },
    onSuccess: (form: FormSubmission) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Mes formulaires</h1>
          <p className="text-muted-foreground mt-1">Soumettez et suivez vos demandes de service</p>
        </div>
        {!isViewAs && (
          <Button onClick={() => setNewFormOpen(true)} data-testid="button-new-form-portal">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau formulaire
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !forms || forms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucun formulaire soumis</p>
          {!isViewAs && (
            <Button className="mt-4" onClick={() => setNewFormOpen(true)} data-testid="button-new-form-empty">
              <Plus className="h-4 w-4 mr-1.5" />
              Créer un formulaire
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card
              key={form.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";
                navigate(`/portal/forms/${form.id}${qs}`);
              }}
              data-testid={`card-form-${form.id}`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{form.formNumber}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>
                      {STATUS_LABELS[form.status] || form.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("fr-CA") : ""}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choisissez un type de service</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {FORM_TYPES.map((t) => (
              <Button
                key={t.value}
                variant="outline"
                className="h-auto py-4 justify-start text-left"
                onClick={() => createFormMutation.mutate(t.value)}
                disabled={createFormMutation.isPending}
                data-testid={`button-create-${t.value}`}
              >
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
