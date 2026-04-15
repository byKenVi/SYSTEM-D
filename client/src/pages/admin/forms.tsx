import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import type { FormSubmission, Contact } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Trash2 } from "lucide-react";
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
  { value: "tri", label: "Tri (Sorting)" },
  { value: "inspection", label: "Inspection" },
  { value: "entreposage", label: "Entreposage (Storage)" },
  { value: "copacking", label: "Co-packing (F015)" },
  { value: "livraison", label: "Livraison (Delivery)" },
];

export default function AdminForms() {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/admin/forms/:id");
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  const { data: forms, isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["/api/forms"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const createFormMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/forms", {
        formType: selectedType,
        contactId: Number(selectedClient),
        data: {},
      });
      return res.json();
    },
    onSuccess: (form: FormSubmission) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      setNewFormOpen(false);
      navigate(`/admin/forms/${form.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Form deleted" });
    },
  });

  if (matchEdit && paramsEdit?.id) {
    return <FormEditor formId={Number(paramsEdit.id)} role="admin" backUrl="/admin/forms" />;
  }

  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);

  const filtered = forms?.filter((f) => {
    if (typeFilter !== "all" && f.formType !== typeFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (clientFilter !== "all" && f.contactId !== Number(clientFilter)) return false;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Forms</h1>
          <p className="text-muted-foreground mt-1">Manage form submissions</p>
        </div>
        <Button onClick={() => setNewFormOpen(true)} data-testid="button-new-form">
          <Plus className="h-4 w-4 mr-1.5" />
          New form
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-client">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {contacts?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}{c.companyName ? ` (${c.companyName})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No forms found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((form) => {
                  const contact = contactMap.get(form.contactId);
                  return (
                    <TableRow
                      key={form.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/forms/${form.id}`)}
                      data-testid={`row-form-${form.id}`}
                    >
                      <TableCell className="font-medium">{form.formNumber}</TableCell>
                      <TableCell>{TYPE_LABELS[form.formType] || form.formType}</TableCell>
                      <TableCell>{contact?.name || `#${form.contactId}`}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("fr-CA") : "—"}
                      </TableCell>
                      <TableCell>
                        {form.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(form.id); }}
                            data-testid={`button-delete-form-${form.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Form type *</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger data-testid="select-new-form-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Client *</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger data-testid="select-new-form-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {contacts?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.companyName ? ` (${c.companyName})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => createFormMutation.mutate()}
              disabled={!selectedType || !selectedClient || createFormMutation.isPending}
              data-testid="button-create-form"
            >
              {createFormMutation.isPending ? "Creating..." : "Create form"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
