import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import type { FormSubmission } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const FORM_TYPES = [
  { value: "tri", label: "Tri (Sorting)", desc: "Sorting service request" },
  { value: "entreposage", label: "Entreposage", desc: "Warehousing request" },
  { value: "copacking", label: "Co-packing", desc: "Co-packing work order" },
  { value: "livraison", label: "Livraison", desc: "Delivery request" },
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Service Requests</h1>
          <p className="text-muted-foreground mt-1">Submit and track your service requests</p>
        </div>
        <Button
          onClick={() => setNewFormOpen(true)}
          data-testid="button-new-form-portal"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New form
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !forms || forms.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No forms submitted yet</p>
              <Button
                className="mt-4"
                onClick={() => setNewFormOpen(true)}
                data-testid="button-new-form-empty"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create a form
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
                  <TableRow
                    key={form.id}
                    className="cursor-pointer"
                    onClick={() => goToForm(form.id)}
                    data-testid={`row-form-${form.id}`}
                  >
                    <TableCell className="font-semibold font-mono">{form.formNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>
                        {STATUS_LABELS[form.status] || form.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("fr-CA") : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a service type</DialogTitle>
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
