import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import type { FormSubmission, Contact } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileText, Trash2, ArrowLeft, Pencil, Download, Link as LinkIcon, CheckCircle2, Circle } from "lucide-react";
import { Fragment, useState } from "react";

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
  draft: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-transparent",
  submitted: "bg-blue-500 text-white dark:bg-blue-600 border-transparent",
  in_review: "bg-amber-400 text-amber-950 dark:bg-amber-500 border-transparent",
  approved: "bg-emerald-500 text-white dark:bg-emerald-600 border-transparent",
  completed: "bg-purple-500 text-white dark:bg-purple-600 border-transparent",
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
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("DELETE", "/api/forms/bulk", { ids });
      return res.json();
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      setSelectedIds(new Set());
      toast({ title: `${ids.length} form(s) deleted` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete forms.", variant: "destructive" });
    },
  });

  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);

  const filtered = forms?.filter((f) => {
    if (typeFilter !== "all" && f.formType !== typeFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (clientFilter !== "all" && f.contactId !== Number(clientFilter)) return false;
    return true;
  }) || [];

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));
  const someFilteredSelected = filtered.some((f) => selectedIds.has(f.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.delete(f.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.add(f.id));
        return next;
      });
    }
  }

  function toggleSelectId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedCount = [...selectedIds].filter((id) => filtered.some((f) => f.id === id)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Service Requests</h1>
          <p className="text-muted-foreground mt-1">Manage client service requests</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete {selectedCount} selected
            </Button>
          )}
          <Button onClick={() => setNewFormOpen(true)} data-testid="button-new-form">
            <Plus className="h-4 w-4 mr-1.5" />
            New form
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Tabs value={typeFilter} onValueChange={setTypeFilter} data-testid="tabs-form-type">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
            {[{ value: "all", label: "All" }, ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))].map(({ value, label }) => {
              const count = value === "all"
                ? (forms?.length ?? 0)
                : (forms?.filter((f) => f.formType === value).length ?? 0);
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="text-sm gap-1.5"
                  data-testid={`tab-type-${value}`}
                >
                  {label}
                  <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0 leading-4 min-w-[18px] text-center ${typeFilter === value ? "bg-primary/20 text-primary" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-3">
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      data-state={someFilteredSelected && !allFilteredSelected ? "indeterminate" : undefined}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
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
                  const isSelected = selectedIds.has(form.id);
                  return (
                    <TableRow
                      key={form.id}
                      className={`cursor-pointer hover:bg-muted/50 ${isSelected ? "bg-muted/30" : ""}`}
                      onClick={() => navigate(`/admin/forms/${form.id}`)}
                      data-testid={`row-form-${form.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectId(form.id)}
                          aria-label={`Select ${form.formNumber}`}
                          data-testid={`checkbox-form-${form.id}`}
                        />
                      </TableCell>
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

// ─── Read-only Detail View ───────────────────────────────────────────────────

const STATUS_FLOW = ["draft", "submitted", "in_review", "approved", "completed"] as const;

const ADVANCE_LABELS: Record<string, string> = {
  submitted: "Start Review",
  in_review: "Approve",
  approved: "Mark Complete",
};

function FieldRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function FormSummary({ form }: { form: FormSubmission }) {
  const data: any = form.data || {};

  if (form.formType === "entreposage") {
    const dims = [data.longueur, data.largeur, data.hauteur].filter(Boolean).join(" × ");
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <FieldRow label="Nature du produit" value={data.natureProduit} />
        <FieldRow label="Type d'emballage" value={data.typeEmballage || (data.hasBinRack ? "Bin/Rack" : undefined)} />
        <FieldRow label="Dimensions" value={dims ? `${dims} ${data.uniteDimension || "cm"}` : undefined} />
        <FieldRow label="Poids" value={data.poids ? `${data.poids} ${data.unitePoids || "kg"}` : undefined} />
        <FieldRow label="Type palette" value={data.paletteType} />
        <FieldRow label="Destination" value={data.destinationType} />
        <FieldRow label="Facturation" value={data.modeBilling} />
        {data.hasRendezVous && <FieldRow label="Rendez-vous" value={[data.rvDate, data.rvTime].filter(Boolean).join(" ")} />}
        {data.hasLivraison && <FieldRow label="Livraison" value="Demandée" />}
        {data.hasKitting && <FieldRow label="Kitting" value={data.kittingDescription || "Oui"} />}
        {data.hasConditionnement && <FieldRow label="Conditionnement" value={data.conditionnementDescription || "Oui"} />}
        {data.notes && <div className="col-span-full"><FieldRow label="Notes" value={data.notes} /></div>}
      </div>
    );
  }

  if (form.formType === "tri") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <FieldRow label="Client" value={data.client} />
        <FieldRow label="Nom du projet" value={data.nomProjet} />
        <FieldRow label="Code pièce" value={data.codePiece} />
        <FieldRow label="Date" value={data.date} />
        <FieldRow label="Raison NC" value={data.raisonNC} />
        <FieldRow label="Éléments NC" value={data.ncItems?.length ? `${data.ncItems.length} item(s)` : undefined} />
        <FieldRow label="Contacts" value={data.contacts?.length ? `${data.contacts.length} contact(s)` : undefined} />
        {data.description && <div className="col-span-full"><FieldRow label="Description" value={data.description} /></div>}
      </div>
    );
  }

  if (form.formType === "inspection") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <FieldRow label="Client" value={data.customer} />
        <FieldRow label="Numéro de pièce" value={data.partNumber} />
        <FieldRow label="Ordre de travail" value={data.workOrder} />
        <FieldRow label="Date" value={data.date} />
        <FieldRow label="Critères d'inspection" value={data.criteria?.length ? `${data.criteria.length} critère(s)` : undefined} />
        <FieldRow label="Inspecteur" value={data.inspector} />
        {data.notes && <div className="col-span-full"><FieldRow label="Notes" value={data.notes} /></div>}
      </div>
    );
  }

  if (form.formType === "copacking") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <FieldRow label="Client" value={data.client} />
        <FieldRow label="Projet" value={data.project} />
        <FieldRow label="Date" value={data.date} />
        <FieldRow label="Suivi de temps" value={data.timeTracking?.length ? `${data.timeTracking.length} entrée(s)` : undefined} />
        <FieldRow label="Picks" value={data.picks?.length ? `${data.picks.length} ligne(s)` : undefined} />
        <FieldRow label="Emballeurs" value={data.packers?.length ? `${data.packers.length} emballeur(s)` : undefined} />
      </div>
    );
  }

  if (form.formType === "livraison") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <FieldRow label="Client" value={data.client} />
        <FieldRow label="Date de livraison" value={data.deliveryDate} />
        <FieldRow label="Destinations" value={data.destinations?.length ? `${data.destinations.length} destination(s)` : undefined} />
        <FieldRow label="Mode de transport" value={data.transportMode} />
        {data.notes && <div className="col-span-full"><FieldRow label="Notes" value={data.notes} /></div>}
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">No summary available for this form type.</p>;
}

export function AdminFormDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: form, isLoading } = useQuery<FormSubmission>({
    queryKey: ["/api/forms", id],
    queryFn: () => fetch(`/api/forms/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest("PUT", `/api/forms/${id}`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Form not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/forms")}>Back to list</Button>
      </div>
    );
  }

  const contact = contacts?.find((c) => c.id === form.contactId);
  const currentStep = STATUS_FLOW.indexOf(form.status as any);
  const nextStatus = currentStep < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentStep + 1] : null;
  const canAdvance = nextStatus && form.status !== "draft";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/admin/forms")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Service Requests
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-form-number">{form.formNumber}</h1>
            <Badge className={`text-xs ${STATUS_COLORS[form.status]}`} data-testid="badge-form-status">
              {STATUS_LABELS[form.status] || form.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <span>{TYPE_LABELS[form.formType] || form.formType}</span>
            {contact && (
              <>
                <span>·</span>
                <Link href={`/admin/contacts/${contact.id}`}>
                  <span className="hover:underline hover:text-foreground cursor-pointer transition-colors" data-testid="text-form-client">
                    {contact.companyName || contact.name}
                  </span>
                </Link>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Updated {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString() : "—"} · Rev. {form.revision}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {form.status !== "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/forms/${id}/pdf`, "_blank")}
              data-testid="button-download-pdf"
            >
              <Download className="h-4 w-4 mr-1.5" />
              PDF
            </Button>
          )}
          {canAdvance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate(nextStatus!)}
              disabled={statusMutation.isPending}
              data-testid="button-advance-status"
            >
              {ADVANCE_LABELS[form.status] || `→ ${STATUS_LABELS[nextStatus!]}`}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => navigate(`/admin/forms/${id}/edit`)}
            data-testid="button-edit-form"
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Status stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_FLOW.map((s, i) => (
          <Fragment key={s}>
            <div className={`flex items-center gap-1.5 flex-shrink-0 ${i <= currentStep ? "text-foreground" : "text-muted-foreground/40"}`}>
              {i < currentStep ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              ) : i === currentStep ? (
                <div className="h-3.5 w-3.5 rounded-full bg-primary flex-shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5" />
              )}
              <span className={`text-xs whitespace-nowrap ${i === currentStep ? "font-semibold" : ""}`}>
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div className={`h-px flex-1 min-w-4 max-w-10 ${i < currentStep ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Linked form */}
      {form.linkedFormId && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30 text-sm">
          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Linked to</span>
          <button
            className="text-primary hover:underline font-medium"
            onClick={() => navigate(`/admin/forms/${form.linkedFormId}`)}
            data-testid="button-linked-form"
          >
            View linked form →
          </button>
        </div>
      )}

      {/* Form data summary */}
      <Card>
        <CardContent className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Form Summary</p>
          <FormSummary form={form} />
        </CardContent>
      </Card>
    </div>
  );
}
