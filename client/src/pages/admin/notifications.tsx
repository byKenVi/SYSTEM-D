import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Bell, ChevronRight, ExternalLink, Plus, Trash2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contact, Notification } from "@shared/schema";

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  compte:     { label: "Compte",     className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  livraison:  { label: "Livraison",  className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  commande:   { label: "Commande",   className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  projet:     { label: "Projet",     className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  inventaire: { label: "Inventaire", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

const TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  compte: [
    { value: "reception_soumission", label: "Réception de soumission" },
    { value: "devis_preparation", label: "Devis en préparation" },
    { value: "nouveau_devis", label: "Nouveau devis disponible" },
    { value: "dossier_complete", label: "Dossier complété" },
    { value: "autre", label: "Autre" },
  ],
  livraison: [
    { value: "colis_expedie", label: "Colis expédié" },
    { value: "colis_livre", label: "Colis livré" },
    { value: "autre", label: "Autre" },
  ],
  commande: [
    { value: "commande_approuvee", label: "Commande approuvée" },
    { value: "commande_expediee", label: "Commande expédiée" },
    { value: "autre", label: "Autre" },
  ],
  projet: [
    { value: "mise_a_jour", label: "Mise à jour" },
    { value: "autre", label: "Autre" },
  ],
  inventaire: [
    { value: "alerte_stock", label: "Alerte de stock" },
    { value: "inventaire_sync", label: "Synchronisation inventaire" },
    { value: "autre", label: "Autre" },
  ],
};

type EnrichedNotification = Notification & { contact: Contact | null };

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getDestUrl(n: EnrichedNotification): string | null {
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  if (meta.formId) return `/admin/forms/${meta.formId}`;
  if (meta.systemdOrderId) return `/admin/orders#systemd-${meta.systemdOrderId}`;
  return null;
}

export default function AdminNotifications() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);

  const [filterCategory, setFilterCategory] = useState("all");
  const [form, setForm] = useState({
    contactId: "",
    category: "compte",
    type: "autre",
    title: "",
    message: "",
  });

  const { data: notifications, isLoading } = useQuery<EnrichedNotification[]>({
    queryKey: ["/api/admin/notifications"],
    refetchInterval: 30_000,
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const create = useMutation({
    mutationFn: (body: typeof form) =>
      apiRequest("POST", "/api/admin/notifications", body).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      setShowCreate(false);
      setForm({ contactId: "", category: "compte", type: "autre", title: "", message: "" });
      toast({ title: "Notification envoyée" });
    },
    onError: () => toast({ title: "Erreur lors de l'envoi", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/notifications/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "Notification supprimée" });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/notifications/${id}/read`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/new-count"] });
    },
  });

  const filtered = notifications?.filter((n) =>
    filterCategory === "all" ? true : n.category === filterCategory
  );

  const cat = (c: string) => CATEGORY_CONFIG[c] ?? { label: c, className: "bg-muted text-muted-foreground" };

  return (
    <div className="space-y-6" data-testid="page-admin-notifications">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" data-testid="heading-admin-notifications">
              Notifications
            </h1>
            <p className="text-xs text-muted-foreground">
              {notifications?.length ?? 0} notification{(notifications?.length ?? 0) !== 1 ? "s" : ""} au total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-category">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([v, c]) => (
                <SelectItem key={v} value={v}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-new-notification">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle notification
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !filtered?.length ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-30" />
            <p className="text-sm">Aucune notification</p>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="table-admin-notifications">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-32">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-36">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-28">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-52">Titre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground w-16">Lu</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => {
                const cfg = cat(n.category);
                const destUrl = getDestUrl(n);
                return (
                  <tr
                    key={n.id}
                    className={`border-b border-border last:border-0 transition-colors group/row
                      ${destUrl ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/30"}`}
                    onClick={() => {
                      if (!destUrl) return;
                      if (!n.isRead && (n.metadata as any)?.adminOnly) markRead.mutate(n.id);
                      navigate(destUrl);
                    }}
                    data-testid={`row-admin-notification-${n.id}`}
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmt(n.createdAt as unknown as string)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {n.contact?.name || `Contact #${n.contactId}`}
                      </span>
                      {n.contact?.companyName && (
                        <p className="text-xs text-muted-foreground truncate max-w-[130px]">
                          {n.contact.companyName}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs font-medium border-0 ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        {n.type === "systemd_order_paid" ? "Nouvelle commande Système D à traiter" : n.title}
                        {destUrl && (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover/row:text-primary transition-colors shrink-0" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{n.message}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block h-2 w-2 rounded-full ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                    </td>
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(n.id)}
                        disabled={remove.isPending}
                        data-testid={`button-delete-notification-${n.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-notification">
          <DialogHeader>
            <DialogTitle>Nouvelle notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="notif-contact">Client *</Label>
              <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                <SelectTrigger id="notif-contact" data-testid="select-notif-contact">
                  <SelectValue placeholder="Sélectionner un client..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} data-testid={`option-contact-${c.id}`}>
                      {c.name}{c.companyName ? ` (${c.companyName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="notif-category">Catégorie *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v, type: "autre" })}
                >
                  <SelectTrigger id="notif-category" data-testid="select-notif-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_CONFIG).map(([v, c]) => (
                      <SelectItem key={v} value={v}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notif-type">Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger id="notif-type" data-testid="select-notif-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(TYPE_OPTIONS[form.category] ?? TYPE_OPTIONS.compte).map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notif-title">Titre *</Label>
              <Input
                id="notif-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Titre de la notification..."
                data-testid="input-notif-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notif-message">Message *</Label>
              <Textarea
                id="notif-message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                placeholder="Message de la notification..."
                data-testid="input-notif-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-notif">
              Annuler
            </Button>
            <Button
              onClick={() => create.mutate(form)}
              disabled={create.isPending || !form.contactId || !form.title || !form.message}
              data-testid="button-send-notif"
            >
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
