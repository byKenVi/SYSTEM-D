import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@shared/schema";
import { useNotificationToast } from "@/hooks/use-notification-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Settings,
  User,
  LogOut,
  Eye,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  BoxIcon,
  PackageCheck,
  Truck,
  Bell,
  Camera,
} from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

interface AppSidebarProps {
  role: "admin" | "client";
  viewAsContactId?: number;
}

const adminItems = [
  { title: "Tableau de bord", url: "/admin/dashboard",     icon: LayoutDashboard },
  { title: "Clients",         url: "/admin/contacts",      icon: Users,        matchPaths: ["/admin/contacts"] },
  { title: "Boutique",        url: "/admin/boutique",      icon: ShoppingCart, matchPaths: ["/admin/boutique", "/admin/customers", "/admin/orders", "/admin/products"] },
  { title: "Inventaire",      url: "/admin/inventaire",    icon: BoxIcon },
  { title: "Soumissions",     url: "/admin/forms",         icon: ClipboardList },
  { title: "Commandes",       url: "/admin/commandes",     icon: PackageCheck },
  { title: "Livraisons",      url: "/admin/livraisons",    icon: Truck },
  { title: "Notifications",   url: "/admin/notifications", icon: Bell },
  { title: "Paramètres",      url: "/admin/settings",      icon: Settings },
];

const clientItems = [
  { title: "Tableau de bord", url: "/portal/dashboard",      icon: LayoutDashboard },
  { title: "Profil",          url: "/portal/profile",        icon: User },
  { title: "Boutique",        url: "/portal/boutique",       icon: ShoppingCart, matchPaths: ["/portal/boutique", "/portal/customers", "/portal/orders", "/portal/products"] },
  { title: "Soumissions",     url: "/portal/forms",          icon: ClipboardList },
  { title: "Commandes",       url: "/portal/commandes",      icon: PackageCheck },
  { title: "Livraisons",      url: "/portal/livraisons",     icon: Truck },
  { title: "Notifications",   url: "/portal/notifications",  icon: Bell },
];

export function AppSidebar({ role, viewAsContactId }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Photo de profil mise à jour" });
    },
    onError: () => {
      toast({ title: "Erreur lors du téléchargement", variant: "destructive" });
    },
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) avatarMutation.mutate(file);
    e.target.value = "";
  }

  const baseItems = role === "admin" ? adminItems : clientItems;
  const items = viewAsContactId
    ? baseItems.map((item) => ({
        ...item,
        url: item.url.startsWith("/portal") ? `${item.url}?viewAs=${viewAsContactId}` : item.url,
      }))
    : baseItems;
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: role === "admin",
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/portal/notifications/unread-count"],
    enabled: role === "client" && !viewAsContactId,
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const unreadCount = unreadData?.count ?? 0;

  // ── Badge admin : nouvelles notifs depuis la dernière visite ───────────────
  const adminNotifViewedAt = (() => {
    try { return localStorage.getItem("adminNotifViewedAt") || new Date(0).toISOString(); }
    catch { return new Date(0).toISOString(); }
  })();
  const { data: adminNewData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/notifications/new-count", adminNotifViewedAt],
    queryFn: () =>
      fetch(`/api/admin/notifications/new-count?since=${encodeURIComponent(adminNotifViewedAt)}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: role === "admin" && !viewAsContactId,
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const adminNotifCount = adminNewData?.count ?? 0;

  useNotificationToast(role === "client" && !viewAsContactId);

  function handleViewAsChange(value: string) {
    if (value === "__admin__") {
      navigate("/admin/contacts");
    } else {
      navigate(`/portal/profile?viewAs=${value}`);
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      {/* ── Header ── */}
      <SidebarHeader className="p-4 pt-6 pb-6 group-data-[collapsible=icon]:p-2 border-b border-sidebar-border/50">
        {/* Expanded */}
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
          <Link href={role === "admin" ? "/admin/dashboard" : "/portal/dashboard"}>
            <div
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-colors hover:bg-sidebar-accent/50"
              data-testid="link-sidebar-home"
            >
              <img src={logoSrc} alt="Système D" className="h-11 w-auto object-contain rounded-md bg-white/90 px-2 py-0.5" />
            </div>
          </Link>
          <SidebarTrigger className="text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent" data-testid="button-sidebar-toggle" />
        </div>
        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
          <SidebarTrigger className="text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent" data-testid="button-sidebar-toggle-collapsed" />
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent className="px-3 pt-4 scrollbar-hide group-data-[collapsible=icon]:px-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                const basePath = item.url.split("?")[0];
                const pathsToMatch = (item as any).matchPaths ?? [basePath];
                const isActive = pathsToMatch.some(
                  (p: string) => location === p || location.startsWith(p + "/")
                );
                const isNotifications = item.title === "Notifications";
                const notifBadgeCount = role === "client" ? unreadCount : (role === "admin" ? adminNotifCount : 0);
                const showBadge = isNotifications && notifBadgeCount > 0 && !viewAsContactId;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`h-9 px-3 rounded-md transition-all duration-200 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:mx-auto ${
                        isActive 
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm" 
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground font-medium"
                      }`}
                    >
                      <Link
                        href={item.url}
                        data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        className="flex items-center gap-3 w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                      >
                        <div className="relative flex-shrink-0">
                          <item.icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
                          {showBadge && !isActive && (
                            <span
                              className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 rounded-full bg-primary ring-2 ring-sidebar"
                              data-testid="badge-unread-count-dot"
                            />
                          )}
                        </div>
                        <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                        {showBadge && (
                          <span className={`ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none group-data-[collapsible=icon]:hidden ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"}`}>
                            {notifBadgeCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role === "admin" && viewAsContactId && contacts && contacts.length > 0 && (
          <SidebarGroup className="mt-4 pt-4 border-t border-sidebar-border/50">
            <SidebarGroupLabel className="text-[10px] font-bold text-primary uppercase tracking-widest px-2 mb-2">
              <span className="flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Mode Client
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-1">
              <Select
                value={viewAsContactId ? String(viewAsContactId) : "__admin__"}
                onValueChange={handleViewAsChange}
              >
                <SelectTrigger
                  className="w-full h-9 text-xs font-medium border-primary/20 bg-primary/10 text-primary ring-offset-sidebar focus:ring-primary/30"
                  data-testid="select-view-as-contact"
                >
                  <SelectValue placeholder="Voir en tant que client..." />
                </SelectTrigger>
                <SelectContent className="border-sidebar-border bg-sidebar text-sidebar-foreground">
                  <SelectItem value="__admin__" className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" data-testid="option-view-as-admin">
                    — Revenir à la vue admin
                  </SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem
                      key={contact.id}
                      value={String(contact.id)}
                      className="hover:bg-sidebar-accent focus:bg-sidebar-accent"
                      data-testid={`option-view-as-${contact.id}`}
                    >
                      {contact.name}
                      {contact.companyName ? ` · ${contact.companyName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t border-sidebar-border/50 p-4">
        {/* Expanded */}
        <div className="group-data-[collapsible=icon]:hidden space-y-2">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
            data-testid="input-avatar"
          />
          <div className="w-full flex items-center gap-3 px-2 py-1 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            <div
              className="relative flex-shrink-0"
            >
              <Avatar className="h-9 w-9 ring-2 ring-sidebar-border/50">
                <AvatarImage src={(user as any)?.customAvatarUrl || user?.profileImageUrl || undefined} alt={user?.firstName || "Utilisateur"} />
                <AvatarFallback className="text-xs font-bold bg-sidebar-accent text-sidebar-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarMutation.isPending}
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors border border-sidebar-background shadow-sm"
                title="Changer la photo"
                data-testid="button-avatar-change"
              >
                {avatarMutation.isPending
                  ? <span className="h-2.5 w-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="h-2.5 w-2.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left py-1"
              data-testid="button-profile-toggle"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight truncate text-sidebar-foreground" data-testid="text-sidebar-username">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-sidebar-foreground/50 font-medium truncate mt-0.5">{user?.email}</p>
              </div>
              <svg
                className={`h-4 w-4 text-sidebar-foreground/40 flex-shrink-0 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {profileOpen && (
            <div className="flex items-center gap-2 px-1 pt-2 border-t border-sidebar-border/30">
              <ThemeToggle />
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 justify-start gap-2 h-9 text-xs font-semibold text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10"
                onClick={() => logout()}
                data-testid="button-logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </Button>
            </div>
          )}
        </div>

        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-3">
          <div className="relative group/avatar">
            <Avatar className="h-8 w-8 ring-2 ring-sidebar-border/50">
              <AvatarImage src={(user as any)?.customAvatarUrl || user?.profileImageUrl || undefined} alt={user?.firstName || "Utilisateur"} />
              <AvatarFallback className="text-[10px] font-bold bg-sidebar-accent text-sidebar-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity"
              title="Changer la photo"
            >
              <Camera className="h-3 w-3 text-white" />
            </button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout()}
            data-testid="button-logout-icon"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
