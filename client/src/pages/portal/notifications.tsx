import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Bell, BellOff, Check, CheckCheck, ChevronRight, Inbox, Settings2, ShieldAlert, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import type { Notification } from "@shared/schema";

const CATEGORY_CONFIG: Record<string, { label: string; description: string; colors: string; iconBg: string }> = {
  compte:     { 
    label: "Compte",     
    description: "Soumissions, devis et mises à jour de dossier",   
    colors: "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10",
    iconBg: "bg-blue-500"
  },
  livraison:  { 
    label: "Livraison",  
    description: "Expédition, transit et confirmation de livraison", 
    colors: "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10",
    iconBg: "bg-purple-500"
  },
  commande:   { 
    label: "Commande",   
    description: "Co-packing et commandes de service",               
    colors: "text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10",
    iconBg: "bg-emerald-500"
  },
  projet:     { 
    label: "Projet",     
    description: "Projets en cours et jalons importants",            
    colors: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10",
    iconBg: "bg-amber-500"
  },
  inventaire: { 
    label: "Inventaire", 
    description: "Alertes de stock et synchronisation",              
    colors: "text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10",
    iconBg: "bg-orange-500"
  },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG);

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function timeAgo(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  return fmt(dateString);
}

/** Retourne l'URL de destination d'une notification si metadata le permet, sinon null. */
function getNotificationUrl(n: Notification): string | null {
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  if (meta.formId) return `/portal/forms/${meta.formId}`;
  if (meta.systemdOrderId) return `/portal/boutique?tab=orders&orderId=${meta.systemdOrderId}`;
  return null;
}

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

    [880, 1108, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.35);
    });
  } catch (_) {}
}

export default function PortalNotifications({ viewAsContactId }: { viewAsContactId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: role } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/role"],
  });
  const isAdmin = role?.role === "admin";

  const notifKey = isAdmin
    ? viewAsContactId
      ? `/api/admin/view-as/${viewAsContactId}/notifications`
      : null
    : "/api/portal/notifications";

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: [notifKey!],
    refetchInterval: 8_000,
    enabled: role !== undefined && notifKey !== null,
  });

  const [soundPrefs, setSoundPrefs] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("notif-sound-prefs") || "{}"); }
    catch { return {}; }
  });

  const isSoundOn = (category: string) => soundPrefs[category] !== false;

  const toggleSound = (category: string) => {
    const next = { ...soundPrefs, [category]: !isSoundOn(category) };
    setSoundPrefs(next);
    try { localStorage.setItem("notif-sound-prefs", JSON.stringify(next)); } catch {}
  };

  const seenIds = useRef<Set<number>>(new Set());
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!notifications) return;
    if (initialLoad.current) {
      initialLoad.current = false;
      notifications.forEach((n) => seenIds.current.add(n.id));
      return;
    }
    const newOnes = notifications.filter((n) => !seenIds.current.has(n.id));
    if (newOnes.length > 0) {
      const shouldRing = newOnes.some((n) => soundPrefs[n.category] !== false);
      if (shouldRing) playNotificationSound();
      newOnes.forEach((n) => seenIds.current.add(n.id));
    }
  }, [notifications]);

  const { data: preferences, isLoading: prefsLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/portal/notifications/preferences"],
    staleTime: Infinity,
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/notifications/${id}/read`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [notifKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/portal/notifications/read-all").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [notifKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications/unread-count"] });
      toast({ title: "Toutes les notifications marquées comme lues" });
    },
  });

  const togglePref = useMutation({
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) =>
      apiRequest("PUT", "/api/portal/notifications/preferences", { category, enabled }).then((r) => r.json()),
    onMutate: async ({ category, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/portal/notifications/preferences"] });
      const prev = queryClient.getQueryData<Record<string, boolean>>(["/api/portal/notifications/preferences"]);
      queryClient.setQueryData<Record<string, boolean>>(["/api/portal/notifications/preferences"], (old) => ({
        ...old,
        [category]: enabled,
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["/api/portal/notifications/preferences"], ctx?.prev);
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    },
  });

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;
  const cat = (c: string) => CATEGORY_CONFIG[c] ?? { label: c, description: "", colors: "bg-muted text-muted-foreground border-border", iconBg: "bg-muted-foreground" };
  const isEnabled = (category: string) => preferences?.[category] ?? true;

  return (
    <div className="space-y-8 animate-in w-full" data-testid="page-portal-notifications">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-border/50">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
            <Bell className="h-3.5 w-3.5" /> Centre de Contrôle
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="heading-notifications">
            Notifications
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Alertes système, suivis opérationnels et messages importants.
          </p>
        </div>
        
        {unread > 0 && (
          <Button
            variant="outline"
            className="shrink-0 font-bold border-primary/20 text-primary hover:bg-primary/10 shadow-sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Tout marquer comme lu ({unread})
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        
        {/* Main Content: Notifications List */}
        <div className="lg:col-span-8 space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            Flux d'activité
            {unread > 0 && (
              <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full border-0 font-mono">
                {unread} NOUVEAU
              </Badge>
            )}
          </h2>

          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="border-border/50 shadow-none">
                  <CardContent className="p-4 flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : !notifications?.length ? (
              <Card className="border-dashed border-2 bg-transparent shadow-none">
                <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Inbox className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  {isAdmin && !viewAsContactId ? (
                    <>
                      <h3 className="text-lg font-bold tracking-tight mb-1">Vue client requise</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        Pour voir les notifications d'un client, ouvrez son portail via "Voir en tant que". Pour gérer toutes les notifications, consultez le panneau admin.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold tracking-tight mb-1">Boîte de réception vide</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-4">
                        Vous n'avez aucune notification pour le moment. L'activité de votre compte apparaîtra ici.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => navigate("/portal/dashboard")}>
                        Retour au tableau de bord
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              notifications.map((n) => {
                const cfg = cat(n.category);
                const isError = n.type === "error" || n.title.toLowerCase().includes("erreur");
                const destUrl = getNotificationUrl(n);
                const isClickable = !!destUrl;

                return (
                  <Card
                    key={n.id}
                    className={`relative overflow-hidden transition-all duration-200 border-border/50 shadow-sm
                      ${!n.isRead ? "bg-card shadow-md shadow-primary/5" : "bg-muted/30 opacity-75"}
                      ${isClickable ? "cursor-pointer hover:shadow-lg hover:border-primary/20 group/notif" : ""}
                    `}
                    onClick={() => {
                      if (!isClickable) return;
                      if (!n.isRead) markRead.mutate(n.id);
                      navigate(destUrl!);
                    }}
                    data-testid={`row-notification-${n.id}`}
                  >
                    {!n.isRead && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}

                    <CardContent className="p-4 sm:p-5 flex gap-4">
                      {/* Icon */}
                      <div className="shrink-0 mt-1">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white shadow-inner
                          ${isError ? "bg-destructive" : cfg.iconBg}
                          ${!n.isRead ? "ring-4 ring-background" : "opacity-70"}
                        `}>
                          {isError ? <ShieldAlert className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-widest border px-2 py-0.5 ${cfg.colors}`}>
                              {cfg.label}
                            </Badge>
                            <span className="text-xs font-mono font-medium text-muted-foreground">
                              {timeAgo(n.createdAt as unknown as string)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!n.isRead && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs font-medium text-primary hover:bg-primary/10 hidden sm:flex"
                                onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                                disabled={markRead.isPending}
                                data-testid={`button-mark-read-${n.id}`}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Marquer lu
                              </Button>
                            )}
                            {isClickable && (
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover/notif:text-primary transition-colors" />
                            )}
                          </div>
                        </div>

                        <h4 className={`text-base font-bold tracking-tight mt-1 mb-1.5 ${!n.isRead ? "text-foreground" : "text-foreground/80"}`}>
                          {n.title}
                        </h4>

                        <p className={`text-sm leading-relaxed ${!n.isRead ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                          {n.message}
                        </p>

                        {isClickable && (
                          <p className="text-xs text-primary font-medium mt-2 group-hover/notif:underline">
                            Voir le détail →
                          </p>
                        )}

                        {!n.isRead && (
                          <div className="mt-4 sm:hidden">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                              disabled={markRead.isPending}
                            >
                              <Check className="h-3.5 w-3.5 mr-2" /> Marquer comme lu
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Sidebar: Preferences */}
        <div className="lg:col-span-4 sticky top-6">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-4">
            <Settings2 className="h-4 w-4" /> Paramètres
          </h2>
          
          <Card className="border-border/50 shadow-sm bg-card overflow-hidden" data-testid="panel-notification-preferences">
            <div className="p-5 border-b border-border/50 bg-muted/20">
              <h3 className="font-bold">Canaux d'alertes</h3>
              <p className="text-xs text-muted-foreground mt-1">Configurez les événements qui déclenchent une notification.</p>
            </div>

            {/* Column headers */}
            <div className="px-4 py-2 flex items-center justify-end gap-5 border-b border-border/30 bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Volume2 className="h-3 w-3" /> Son
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-9 text-center">Actif</span>
            </div>
            
            <div className="divide-y divide-border/50">
              {CATEGORIES.map((category) => {
                const cfg = cat(category);
                const enabled = isEnabled(category);
                const soundOn = isSoundOn(category);
                return (
                  <div
                    key={category}
                    className="px-4 py-3.5 transition-colors hover:bg-muted/10 flex items-center gap-4"
                    data-testid={`pref-row-${category}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${cfg.iconBg}`} />
                        <span className="text-sm font-bold text-foreground">{cfg.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed pl-4">
                        {cfg.description}
                      </p>
                    </div>
                    
                    {/* Sound toggle */}
                    <button
                      onClick={() => toggleSound(category)}
                      className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors
                        ${soundOn
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-muted/50 text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground"
                        }`}
                      title={soundOn ? "Son activé — cliquer pour désactiver" : "Son désactivé — cliquer pour activer"}
                      data-testid={`button-sound-${category}`}
                    >
                      {soundOn
                        ? <Bell className="h-3.5 w-3.5" />
                        : <BellOff className="h-3.5 w-3.5" />
                      }
                    </button>

                    {/* Notification toggle */}
                    <div className="shrink-0 w-9 flex justify-center">
                      {prefsLoading ? (
                        <Skeleton className="h-5 w-9 rounded-full" />
                      ) : (
                        <Switch
                          checked={enabled}
                          onCheckedChange={(val) => togglePref.mutate({ category, enabled: val })}
                          disabled={togglePref.isPending}
                          data-testid={`switch-pref-${category}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        
      </div>
    </div>
  );
}
