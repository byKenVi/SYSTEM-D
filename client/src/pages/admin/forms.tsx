import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import type { FormSubmission, Contact } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileText, Trash2, ArrowLeft, Pencil, Download, Link as LinkIcon, CheckCircle2, Circle, Layers, User, Calendar, DollarSign } from "lucide-react";
import { Fragment, useState, useMemo } from "react";

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

const STATUS_BORDER: Record<string, string> = {
  draft: "border-l-gray-300 dark:border-l-gray-600",
  submitted: "border-l-blue-500",
  in_review: "border-l-amber-400",
  approved: "border-l-emerald-500",
  completed: "border-l-purple-500",
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
  const [groupBy, setGroupBy] = useState<"none" | "type" | "status" | "client">(
    () => (localStorage.getItem("forms_groupBy") as any) || "none"
  );

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

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, { label: string; forms: typeof filtered }>();
    for (const form of filtered) {
      let key: string;
      let label: string;
      if (groupBy === "type") {
        key = form.formType;
        label = TYPE_LABELS[form.formType] || form.formType;
      } else if (groupBy === "status") {
        key = form.status;
        label = STATUS_LABELS[form.status] || form.status;
      } else {
        const contact = contactMap.get(form.contactId);
        key = String(form.contactId);
        label = contact?.name || `Client #${form.contactId}`;
      }
      if (!map.has(key)) map.set(key, { label, forms: [] });
      map.get(key)!.forms.push(form);
    }
    return [...map.entries()].map(([key, val]) => ({ key, ...val }));
  }, [filtered, groupBy, contactMap]);

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
          <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as any); localStorage.setItem("forms_groupBy", v); }}>
            <SelectTrigger className="w-[160px]" data-testid="select-group-by">
              <Layers className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="type">Group by Type</SelectItem>
              <SelectItem value="status">Group by Status</SelectItem>
              <SelectItem value="client">Group by Client</SelectItem>
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
                {groups ? (
                  groups.map((group) => (
                    <Fragment key={group.key}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40 pointer-events-none">
                        <TableCell colSpan={7} className="py-2 px-4">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="ml-2 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-muted-foreground/15 text-muted-foreground">
                            {group.forms.length}
                          </span>
                        </TableCell>
                      </TableRow>
                      {group.forms.map((form) => {
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
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectId(form.id)} aria-label={`Select ${form.formNumber}`} data-testid={`checkbox-form-${form.id}`} />
                            </TableCell>
                            <TableCell className="font-medium">{form.formNumber}</TableCell>
                            <TableCell>{TYPE_LABELS[form.formType] || form.formType}</TableCell>
                            <TableCell>{contact?.name || `#${form.contactId}`}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {form.updatedAt ? new Date(form.updatedAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : "—"}
                            </TableCell>
                            <TableCell>
                              {form.status === "draft" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(form.id); }} data-testid={`button-delete-form-${form.id}`}>
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))
                ) : (
                  filtered.map((form) => {
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
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectId(form.id)} aria-label={`Select ${form.formNumber}`} data-testid={`checkbox-form-${form.id}`} />
                        </TableCell>
                        <TableCell className="font-medium">{form.formNumber}</TableCell>
                        <TableCell>{TYPE_LABELS[form.formType] || form.formType}</TableCell>
                        <TableCell>{contact?.name || `#${form.contactId}`}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {form.updatedAt ? new Date(form.updatedAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell>
                          {form.status === "draft" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(form.id); }} data-testid={`button-delete-form-${form.id}`}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 col-span-full border-b pb-1 mb-1 mt-2 first:mt-0">
      {children}
    </p>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full border">{item}</span>
      ))}
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function FormSummary({ form }: { form: FormSubmission }) {
  const data: any = form.data || {};

  if (form.formType === "entreposage") {
    const dims = [data.longueur, data.largeur, data.hauteur].filter(Boolean).join(" × ");
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <SectionTitle>A. Entreposage</SectionTitle>
        <FieldRow label="Nature du produit" value={data.natureProduit} />
        <FieldRow label="Type d'emballage" value={data.typeEmballage || (data.hasBinRack ? "Bin/Rack" : undefined)} />
        <FieldRow label="Dimensions" value={dims ? `${dims} ${data.uniteDimension || "cm"}` : undefined} />
        <FieldRow label="Poids" value={data.poids ? `${data.poids} ${data.unitePoids || "kg"}` : undefined} />

        {data.typeEmballage === "Palette" && (
          <>
            <FieldRow label="Dimensions palette" value={data.paletteDimensions} />
            <FieldRow label="Nb unités / palette" value={data.paletteNbUnites} />
            <FieldRow label="Hauteur palette" value={data.paletteHauteur} />
            <FieldRow label="Type palette" value={data.paletteType} />
          </>
        )}
        {data.typeEmballage === "Boîte" && (
          <>
            <FieldRow label="Format boîte" value={data.boiteFormat} />
            <FieldRow label="Nb unités / boîte" value={data.boiteNbUnites} />
          </>
        )}
        {data.typeEmballage === "Vrac" && (
          <div className="col-span-full"><FieldRow label="Description vrac" value={data.vracDescription} /></div>
        )}
        {data.typeEmballage === "Sac" && (
          <>
            <FieldRow label="Format sac" value={data.sacFormat} />
            <FieldRow label="Nb unités / sac" value={data.sacNbUnites} />
          </>
        )}
        {data.hasBinRack && (
          <>
            <FieldRow label="Taille Bin" value={data.binSize} />
            <FieldRow label="Taille Rack" value={data.rackSize} />
          </>
        )}

        {data.hasLivraison && (
          <>
            <SectionTitle>B. Service de livraison</SectionTitle>
            {data.typeMarchandise?.length > 0 && (
              <div className="col-span-full">
                <FieldBlock label="Type de marchandise">
                  <TagList items={data.typeMarchandise} />
                </FieldBlock>
              </div>
            )}
            <FieldRow label="Destination" value={data.destinationType === "longue_distance" ? "Longue distance" : "Local"} />
            {data.destinationType === "longue_distance" && data.hasTailgate && (
              <FieldRow label="Tailgate" value="Requis" />
            )}
            {data.hasRendezVous && (
              <FieldRow label="Rendez-vous" value={[data.rvDate, data.rvTime].filter(Boolean).join(" à ")} />
            )}
            {data.adresses?.filter((a: any) => a.adresse).length > 0 && (
              <div className="col-span-full space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Adresse(s)</p>
                {data.adresses.filter((a: any) => a.adresse).map((a: any, i: number) => (
                  <div key={i} className="text-sm">
                    <span>{a.adresse}</span>
                    {a.notes && <span className="text-muted-foreground ml-2">— {a.notes}</span>}
                  </div>
                ))}
              </div>
            )}
            <FieldRow label="Mode de facturation" value={data.modeBilling} />
            {data.documentation?.length > 0 && (
              <div className="col-span-full">
                <FieldBlock label="Documentation requise">
                  <TagList items={data.documentation} />
                </FieldBlock>
              </div>
            )}
            {data.hasConditionnement && (
              <div className="col-span-full">
                <FieldRow label="Conditionnement" value={data.conditionnementDescription || "Requis"} />
              </div>
            )}
            {data.hasKitting && (
              <div className="col-span-full">
                <FieldRow label="Kitting" value={data.kittingDescription || "Requis"} />
              </div>
            )}
          </>
        )}

        {data.notes && (
          <>
            <SectionTitle>Notes</SectionTitle>
            <div className="col-span-full"><FieldRow label="Notes" value={data.notes} /></div>
          </>
        )}
      </div>
    );
  }

  if (form.formType === "tri") {
    const ncFilled = data.ncItems?.filter((i: any) => i.description) || [];
    const contactsFilled = data.contacts?.filter((c: any) => c.nom || c.email) || [];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <SectionTitle>Identification</SectionTitle>
        <FieldRow label="Client" value={data.client} />
        <FieldRow label="Sous-traitant" value={data.sousTraitant} />
        <FieldRow label="Nom du projet" value={data.nomProjet} />
        <FieldRow label="Code pièce" value={data.codePiece} />
        <FieldRow label="N° instructions" value={data.instructionsNumero} />
        <FieldRow label="Type TRI" value={data.typeTri} />
        <FieldRow label="Langue échangée" value={data.langueEchangee} />
        {data.description && (
          <div className="col-span-full"><FieldRow label="Description" value={data.description} /></div>
        )}
        {data.ncReferences?.length > 0 && (
          <div className="col-span-full">
            <FieldBlock label="Références NC">
              <TagList items={data.ncReferences} />
            </FieldBlock>
          </div>
        )}

        {ncFilled.length > 0 && (
          <>
            <SectionTitle>Éléments NC ({ncFilled.length})</SectionTitle>
            {ncFilled.map((item: any, i: number) => (
              <div key={i} className="col-span-full">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">NC {i + 1}</p>
                <p className="text-sm">{item.description}</p>
              </div>
            ))}
          </>
        )}

        <SectionTitle>Méthode de tri</SectionTitle>
        <FieldRow label="Méthode" value={data.methodeTri} />
        <FieldRow label="Outils" value={data.outils} />
        <FieldRow label="Unité / boîte" value={data.uniteParBoite} />
        <FieldRow label="Besoin quotidien" value={data.besoinQuotidien} />
        <FieldRow label="Cycle de tri" value={data.cycleTri ? `${data.cycleTri} (${data.cycleTriType || ""})` : undefined} />

        {contactsFilled.length > 0 && (
          <>
            <SectionTitle>Contacts ({contactsFilled.length})</SectionTitle>
            {contactsFilled.map((c: any, i: number) => (
              <div key={i} className="col-span-full text-sm flex flex-wrap gap-x-4 gap-y-0.5">
                {c.nom && <span className="font-medium">{c.nom}</span>}
                {c.role && <span className="text-muted-foreground">{c.role}</span>}
                {c.email && <span className="text-muted-foreground">{c.email}</span>}
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  if (form.formType === "inspection") {
    const criteriaFilled = data.criteria?.filter((c: any) => c.processTitle || c.processDescription) || [];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <SectionTitle>En-tête</SectionTitle>
        <FieldRow label="Client" value={data.customer} />
        <FieldRow label="Numéro de pièce" value={data.partNumber} />
        <FieldRow label="Nom de pièce" value={data.partName} />
        <FieldRow label="Révision" value={data.revision} />
        <FieldRow label="Instruction de travail" value={data.workInstruction} />
        <FieldRow label="Échantillon de contrôle" value={data.controlSample} />
        {data.controlSample === "custom" && <FieldRow label="% personnalisé" value={data.customSamplePercent} />}
        {data.controlMethod?.length > 0 && (
          <div className="col-span-full">
            <FieldBlock label="Méthode de contrôle">
              <TagList items={data.controlMethod} />
            </FieldBlock>
          </div>
        )}
        {data.ppe?.length > 0 && (
          <div className="col-span-full">
            <FieldBlock label="PPE requis">
              <TagList items={[...data.ppe, ...(data.ppeOther ? [data.ppeOther] : [])]} />
            </FieldBlock>
          </div>
        )}
        <FieldRow label="Outil de rework" value={data.reworkTool} />
        <FieldRow label="Liste d'outils" value={data.toolList} />
        <FieldRow label="Référence documentation" value={data.documentationReference} />
        {data.inspectionDescription && (
          <div className="col-span-full"><FieldRow label="Description inspection" value={data.inspectionDescription} /></div>
        )}
        {data.reworkDescription && (
          <div className="col-span-full"><FieldRow label="Description rework" value={data.reworkDescription} /></div>
        )}

        {criteriaFilled.length > 0 && (
          <>
            <SectionTitle>Critères d'inspection ({criteriaFilled.length})</SectionTitle>
            {criteriaFilled.map((c: any, i: number) => (
              <div key={i} className="col-span-full border rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold">{c.processTitle || `Critère ${i + 1}`}</p>
                {c.processDescription && <p className="text-xs text-muted-foreground">{c.processDescription}</p>}
                {c.compliantDescription && <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ {c.compliantDescription}</p>}
                {c.nonCompliantDescription && <p className="text-xs text-red-600 dark:text-red-400">✗ {c.nonCompliantDescription}</p>}
              </div>
            ))}
          </>
        )}

        {(data.approvalSystemeDName || data.approvalCustomerName) && (
          <>
            <SectionTitle>Approbations</SectionTitle>
            {data.approvalSystemeDName && (
              <FieldRow label="Système-D" value={`${data.approvalSystemeDName}${data.approvalSystemeDDate ? ` — ${data.approvalSystemeDDate}` : ""}`} />
            )}
            {data.approvalCustomerName && (
              <FieldRow label="Client" value={`${data.approvalCustomerName}${data.approvalCustomerDate ? ` — ${data.approvalCustomerDate}` : ""}`} />
            )}
          </>
        )}
      </div>
    );
  }

  if (form.formType === "copacking") {
    const totalPickers = data.packerRows?.filter((r: any) => r.nom).length || 0;
    const totalPicksAvec = data.picksAvecFacture?.filter((r: any) => r.date).length || 0;
    const totalPicksSans = data.picksSansFacture?.filter((r: any) => r.date).length || 0;
    const workBlocksFilled = data.workBlocks?.filter((b: any) => b.description) || [];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <SectionTitle>En-tête</SectionTitle>
        <FieldRow label="Client" value={data.client} />
        <FieldRow label="Projet" value={data.projet} />
        <FieldRow label="Date bon de travail" value={data.dateBonTravail} />
        <FieldRow label="Référence" value={data.reference} />

        <SectionTitle>Palette & Matériaux</SectionTitle>
        <FieldRow label="Type palette" value={data.paletteType} />
        <FieldRow label="Nb palettes" value={data.paletteNb} />
        <FieldRow label="Matériaux disponibles" value={data.materiauxDisponible} />
        {data.materiauxDescription && (
          <div className="col-span-full"><FieldRow label="Description matériaux" value={data.materiauxDescription} /></div>
        )}

        <SectionTitle>Performance</SectionTitle>
        <FieldRow label="Qté totale" value={data.performanceQteTotal} />
        <FieldRow label="Qté conforme" value={data.performanceQteConforme} />
        <FieldRow label="Qté NC" value={data.performanceQteNC} />

        {workBlocksFilled.length > 0 && (
          <>
            <SectionTitle>Blocs de travail ({workBlocksFilled.length})</SectionTitle>
            {workBlocksFilled.map((b: any, i: number) => (
              <div key={i} className="col-span-full text-sm font-medium">{b.description}</div>
            ))}
          </>
        )}

        <SectionTitle>Picks & Emballeurs</SectionTitle>
        {totalPicksAvec > 0 && <FieldRow label="Picks avec facture" value={`${totalPicksAvec} ligne(s)`} />}
        {totalPicksSans > 0 && <FieldRow label="Picks sans facture" value={`${totalPicksSans} ligne(s)`} />}
        {totalPickers > 0 && <FieldRow label="Emballeurs" value={`${totalPickers} personne(s)`} />}
        {data.montageComments && (
          <div className="col-span-full"><FieldRow label="Commentaires montage" value={data.montageComments} /></div>
        )}
      </div>
    );
  }

  if (form.formType === "livraison") {
    const destFilled = data.destinations?.filter((d: any) => d.adresse) || [];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <SectionTitle>Marchandise</SectionTitle>
        <FieldRow label="Type de marchandise" value={data.typeMarchandise} />
        <FieldRow label="Nb unités" value={data.nbUnites} />
        <FieldRow label="Poids total" value={data.poidsTotal ? `${data.poidsTotal} ${data.unitePoids || "kg"}` : undefined} />
        <FieldRow label="Référence" value={data.reference} />

        <SectionTitle>Livraison</SectionTitle>
        <FieldRow label="Type destination" value={data.destinationType === "longue_distance" ? "Longue distance" : "Local"} />
        {data.hasTailgate && <FieldRow label="Tailgate" value="Requis" />}
        {data.hasRendezVous && (
          <FieldRow label="Rendez-vous" value={[data.rvDate, data.rvTime].filter(Boolean).join(" à ")} />
        )}
        <FieldRow label="Mode de facturation" value={data.modeBilling} />

        {destFilled.length > 0 && (
          <>
            <SectionTitle>Destinations ({destFilled.length})</SectionTitle>
            {destFilled.map((d: any, i: number) => (
              <div key={i} className="col-span-full border rounded-lg p-3 space-y-0.5">
                <p className="text-sm font-medium">{d.adresse}</p>
                {d.contact && <p className="text-xs text-muted-foreground">Contact: {d.contact}</p>}
                {d.telephone && <p className="text-xs text-muted-foreground">Tél: {d.telephone}</p>}
                {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
              </div>
            ))}
          </>
        )}

        {data.documentation?.length > 0 && (
          <>
            <SectionTitle>Documentation</SectionTitle>
            <div className="col-span-full">
              <TagList items={data.documentation} />
            </div>
          </>
        )}

        {data.instructionsSpeciales && (
          <>
            <SectionTitle>Instructions spéciales</SectionTitle>
            <div className="col-span-full"><FieldRow label="Instructions" value={data.instructionsSpeciales} /></div>
          </>
        )}
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">No summary available for this form type.</p>;
}

function getQuantityLabel(form: FormSubmission): string {
  const d = form.data as any;
  switch (form.formType) {
    case "entreposage":
      if (d?.hasBinRack) return "Quantité (bins/racks)";
      switch (d?.typeEmballage) {
        case "Palette": return "Quantité (palettes)";
        case "Boîte": return "Quantité (boîtes)";
        case "Sac": return "Quantité (sacs)";
        case "Vrac": return "Quantité (unités vrac)";
        default: return "Quantité";
      }
    case "tri": return "Quantité (articles)";
    case "copacking": return "Quantité (palettes)";
    case "livraison": return "Quantité (colis)";
    case "inspection": return "Quantité (items)";
    default: return "Quantité";
  }
}

function getQuantityUnit(form: FormSubmission): string {
  const d = form.data as any;
  switch (form.formType) {
    case "entreposage":
      if (d?.hasBinRack) return "bin(s)";
      switch (d?.typeEmballage) {
        case "Palette": return "palette(s)";
        case "Boîte": return "boîte(s)";
        case "Sac": return "sac(s)";
        case "Vrac": return "unité(s)";
        default: return "";
      }
    case "copacking": return "palette(s)";
    case "livraison": return "colis";
    default: return "";
  }
}

export function AdminFormDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [priceDialog, setPriceDialog] = useState<{ open: boolean; priceInput: string; quantityInput: string }>({ open: false, priceInput: "", quantityInput: "" });

  const { data: form, isLoading } = useQuery<FormSubmission>({
    queryKey: ["/api/forms", id],
    queryFn: () => fetch(`/api/forms/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const statusMutation = useMutation({
    mutationFn: async ({ newStatus, price, approvedQuantity }: { newStatus: string; price?: string; approvedQuantity?: string }) => {
      const body: Record<string, unknown> = { status: newStatus };
      if (price !== undefined) body.price = price;
      if (approvedQuantity !== undefined) body.approvedQuantity = approvedQuantity;
      const res = await apiRequest("PUT", `/api/forms/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Status updated" });
      setPriceDialog({ open: false, priceInput: "", quantityInput: "" });
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
      {/* Header card */}
      <div className={`rounded-xl border-l-4 border border-border bg-card shadow-sm overflow-hidden ${STATUS_BORDER[form.status] || "border-l-gray-300"}`}>
        <div className="px-5 pt-4 pb-5 space-y-3">
          {/* Top row: back + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={() => navigate("/admin/forms")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Service Requests
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {form.status !== "draft" && (
                <a href={`/api/forms/${id}/pdf`} download data-testid="button-download-pdf">
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    PDF
                  </Button>
                </a>
              )}
              {canAdvance && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-status"
                  onClick={() => {
                    if (nextStatus === "approved") {
                      const fd = form.data as any;
                      let defaultQty = form.approvedQuantity ? String(form.approvedQuantity) : "";
                      if (!defaultQty && form.formType === "copacking") defaultQty = fd?.paletteNb || "";
                      setPriceDialog({ open: true, priceInput: form.price ? String(form.price) : "", quantityInput: defaultQty });
                    } else {
                      statusMutation.mutate({ newStatus: nextStatus! });
                    }
                  }}
                >
                  {ADVANCE_LABELS[form.status] || `→ ${STATUS_LABELS[nextStatus!]}`}
                </Button>
              )}
              <Button size="sm" onClick={() => navigate(`/admin/forms/${id}/edit`)} data-testid="button-edit-form">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </div>
          </div>

          {/* Form number + badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono tracking-tight" data-testid="text-form-number">{form.formNumber}</h1>
            <Badge className={`text-xs ${STATUS_COLORS[form.status]}`} data-testid="badge-form-status">
              {STATUS_LABELS[form.status] || form.status}
            </Badge>
          </div>

          {/* Meta row: type + client + date */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              {TYPE_LABELS[form.formType] || form.formType}
            </span>
            {contact && (
              <Link href={`/admin/contacts/${contact.id}`}>
                <span className="flex items-center gap-1.5 hover:text-foreground cursor-pointer transition-colors" data-testid="text-form-client">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  {contact.companyName || contact.name}
                </span>
              </Link>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              Updated {form.updatedAt ? new Date(form.updatedAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : "—"}
              <span className="text-muted-foreground/50">·</span>
              Rev. {form.revision}
            </span>
          </div>
        </div>
      </div>

      {/* Status stepper */}
      <div className="flex items-center w-full">
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
              <div className={`h-px flex-1 mx-2 ${i < currentStep ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
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

      {/* Admin-only price & quantity display */}
      {(form.price || form.approvedQuantity) && (
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div className="flex gap-6 flex-wrap">
              {form.price && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix (Admin Only)</p>
                  <p className="text-lg font-bold text-primary" data-testid="text-service-price">
                    {Number(form.price).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
                  </p>
                </div>
              )}
              {form.approvedQuantity && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantité approuvée</p>
                  <p className="text-lg font-bold text-foreground" data-testid="text-approved-quantity">
                    {Number(form.approvedQuantity).toLocaleString("fr-CA")} {getQuantityUnit(form)}
                  </p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => {
                const fd = form.data as any;
                let defaultQty = form.approvedQuantity ? String(form.approvedQuantity) : "";
                if (!defaultQty && form.formType === "copacking") defaultQty = fd?.paletteNb || "";
                setPriceDialog({ open: true, priceInput: form.price ? String(form.price) : "", quantityInput: defaultQty });
              }}
              data-testid="button-edit-price"
            >
              Modifier
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Form data summary */}
      <Card>
        <CardContent className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Form Summary</p>
          <FormSummary form={form} />
        </CardContent>
      </Card>

      {/* Price & quantity dialog */}
      <Dialog open={priceDialog.open} onOpenChange={(open) => setPriceDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-price">
          <DialogHeader>
            <DialogTitle>Approbation du service</DialogTitle>
            <DialogDescription>
              Entrez le prix et la quantité pour cette demande. Ces informations sont visibles uniquement par les administrateurs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="price-input">Prix (CAD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="price-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={priceDialog.priceInput}
                  onChange={(e) => setPriceDialog((p) => ({ ...p, priceInput: e.target.value }))}
                  data-testid="input-service-price"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity-input">{getQuantityLabel(form)}</Label>
              <Input
                id="quantity-input"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={priceDialog.quantityInput}
                onChange={(e) => setPriceDialog((p) => ({ ...p, quantityInput: e.target.value }))}
                data-testid="input-approved-quantity"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialog({ open: false, priceInput: "", quantityInput: "" })}>Annuler</Button>
            <Button
              disabled={(!priceDialog.priceInput && !priceDialog.quantityInput) || statusMutation.isPending}
              onClick={() => {
                const isApproving = form.status === "in_review";
                statusMutation.mutate({
                  newStatus: isApproving ? "approved" : form.status,
                  price: priceDialog.priceInput || undefined,
                  approvedQuantity: priceDialog.quantityInput || undefined,
                });
              }}
              data-testid="button-confirm-price"
            >
              {form.status === "in_review" ? "Approuver" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
