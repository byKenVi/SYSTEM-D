import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { Contact } from "@shared/schema";
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
} from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

interface AppSidebarProps {
  role: "admin" | "client";
  viewAsContactId?: number;
}

const adminItems = [
  { title: "Tableau de bord", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Clients",         url: "/admin/contacts",      icon: Users },
  { title: "Boutique",        url: "/admin/boutique",      icon: ShoppingCart },
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
  { title: "Boutique",        url: "/portal/boutique",       icon: ShoppingCart },
  { title: "Soumissions",     url: "/portal/forms",          icon: ClipboardList },
  { title: "Commandes",       url: "/portal/commandes",      icon: PackageCheck },
  { title: "Livraisons",      url: "/portal/livraisons",     icon: Truck },
  { title: "Notifications",   url: "/portal/notifications",  icon: Bell },
];

export function AppSidebar({ role, viewAsContactId }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
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

  function handleViewAsChange(value: string) {
    if (value === "__admin__") {
      navigate("/admin/contacts");
    } else {
      navigate(`/portal/profile?viewAs=${value}`);
    }
  }

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ── */}
      <SidebarHeader className="p-4 pb-3 group-data-[collapsible=icon]:p-2">
        {/* Expanded */}
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
          <Link href={role === "admin" ? "/admin/dashboard" : "/portal/dashboard"}>
            <div
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 cursor-pointer transition-colors hover:bg-sidebar-accent"
              data-testid="link-sidebar-home"
            >
              <img src={logoSrc} alt="Système D" className="h-11 w-auto object-contain" />
            </div>
          </Link>
          <SidebarTrigger className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent" data-testid="button-sidebar-toggle" />
        </div>
        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex justify-center">
          <SidebarTrigger className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent" data-testid="button-sidebar-toggle-collapsed" />
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const basePath = item.url.split("?")[0];
                const isActive =
                  location === basePath || location.startsWith(basePath + "/");
                const isNotifications = item.title === "Notifications" && role === "client";
                const showBadge = isNotifications && unreadCount > 0 && !viewAsContactId;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? "bg-primary/15 text-primary font-semibold hover:bg-primary/20 hover:text-primary" : ""}
                    >
                      <Link
                        href={item.url}
                        data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <div className="relative flex-shrink-0">
                          <item.icon className="h-4 w-4" />
                          {showBadge && (
                            <span
                              className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center leading-none"
                              data-testid="badge-unread-count"
                            >
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          )}
                        </div>
                        <span>{item.title}</span>
                        {showBadge && (
                          <span className="ml-auto text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
                            {unreadCount}
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
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40">
              <span className="flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Aperçu portail
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <Select
                value={viewAsContactId ? String(viewAsContactId) : "__admin__"}
                onValueChange={handleViewAsChange}
              >
                <SelectTrigger
                  className="w-full h-8 text-xs border-sidebar-border bg-sidebar-accent text-sidebar-foreground"
                  data-testid="select-view-as-contact"
                >
                  <SelectValue placeholder="Voir en tant que client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__admin__" data-testid="option-view-as-admin">
                    — Vue admin
                  </SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem
                      key={contact.id}
                      value={String(contact.id)}
                      data-testid={`option-view-as-${contact.id}`}
                    >
                      {contact.name}
                      {contact.companyName ? ` (${contact.companyName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {/* Expanded */}
        <div className="group-data-[collapsible=icon]:hidden space-y-1">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
            data-testid="button-profile-toggle"
          >
            <Avatar className="h-7 w-7 flex-shrink-0 ring-1 ring-sidebar-border">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "Utilisateur"} />
              <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium leading-tight truncate text-sidebar-foreground" data-testid="text-sidebar-username">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
            </div>
            <svg
              className={`h-3.5 w-3.5 text-sidebar-foreground/40 flex-shrink-0 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {profileOpen && (
            <div className="flex items-center gap-1 px-1 pt-0.5">
              <ThemeToggle />
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 justify-start gap-2 h-8 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => logout()}
                data-testid="button-logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                Se déconnecter
              </Button>
            </div>
          )}
        </div>

        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2">
          <Avatar className="h-7 w-7 ring-1 ring-sidebar-border">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "Utilisateur"} />
            <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => logout()}
            data-testid="button-logout-icon"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
