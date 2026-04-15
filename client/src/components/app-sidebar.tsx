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
  Package,
  Settings,
  User,
  Warehouse,
  LogOut,
  Eye,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  BoxIcon,
  PackageCheck,
  Truck,
} from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

interface AppSidebarProps {
  role: "admin" | "client";
  viewAsContactId?: number;
}

const adminItems = [
  { title: "Tableau de bord", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Clients", url: "/admin/contacts", icon: Users },
  { title: "Boutique", url: "/admin/boutique", icon: ShoppingCart },
  { title: "Inventaire", url: "/admin/inventaire", icon: BoxIcon },
  { title: "Soumissions", url: "/admin/forms", icon: ClipboardList },
  { title: "Commandes", url: "/admin/commandes", icon: PackageCheck },
  { title: "Livraisons", url: "/admin/livraisons", icon: Truck },
  { title: "Paramètres", url: "/admin/settings", icon: Settings },
];

const clientItems = [
  { title: "Tableau de bord", url: "/portal/dashboard", icon: LayoutDashboard },
  { title: "Profil", url: "/portal/profile", icon: User },
  { title: "Boutique", url: "/portal/boutique", icon: ShoppingCart },
  { title: "Soumissions", url: "/portal/forms", icon: ClipboardList },
  { title: "Commandes", url: "/portal/commandes", icon: PackageCheck },
  { title: "Livraisons", url: "/portal/livraisons", icon: Truck },
];

export function AppSidebar({ role, viewAsContactId }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const baseItems = role === "admin" ? adminItems : clientItems;
  const items = viewAsContactId
    ? baseItems.map((item) => ({
        ...item,
        url: `${item.url}?viewAs=${viewAsContactId}`,
      }))
    : baseItems;
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: role === "admin",
  });

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
                const isActive =
                  location === item.url.split("?")[0] ||
                  location.startsWith(item.url.split("?")[0] + "/");
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
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
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
        <div className="group-data-[collapsible=icon]:hidden space-y-2">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar className="h-7 w-7 flex-shrink-0 ring-1 ring-sidebar-border">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "Utilisateur"} />
              <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight truncate text-sidebar-foreground" data-testid="text-sidebar-username">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 px-1">
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
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
