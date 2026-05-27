import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Check, CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Notification } from "@shared/schema";

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  compte:     { label: "Compte",     className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  livraison:  { label: "Livraison",  className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  commande:   { label: "Commande",   className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  projet:     { label: "Projet",     className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  inventaire: { label: "Inventaire", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function PortalNotifications() {
  const { toast } = useToast();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/portal/notifications"],
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/notifications/${id}/read`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/portal/notifications/read-all").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications/unread-count"] });
      toast({ title: "Toutes les notifications marquées comme lues" });
    },
  });

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;
  const cat = (c: string) => CATEGORY_CONFIG[c] ?? { label: c, className: "bg-muted text-muted-foreground" };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-portal-notifications">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" data-testid="heading-notifications">
              Notifications
            </h1>
            {unread > 0 && (
              <p className="text-xs text-muted-foreground">
                {unread} non lue{unread > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Tout marquer comme lu
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !notifications?.length ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-30" />
            <p className="text-sm">Aucune notification</p>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="table-notifications">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-36">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-32">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-64">Titre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => {
                const cfg = cat(n.category);
                return (
                  <tr
                    key={n.id}
                    className={`border-b border-border last:border-0 transition-colors hover:bg-muted/30 ${!n.isRead ? "bg-primary/5" : ""}`}
                    data-testid={`row-notification-${n.id}`}
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmt(n.createdAt as unknown as string)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs font-medium border-0 ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </span>
                      {!n.isRead && (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{n.message}</td>
                    <td className="px-2 py-3">
                      {!n.isRead && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => markRead.mutate(n.id)}
                          disabled={markRead.isPending}
                          title="Marquer comme lu"
                          data-testid={`button-mark-read-${n.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
