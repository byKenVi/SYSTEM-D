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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  Package,
  RefreshCw,
  Settings,
  User,
  Warehouse,
  LogOut,
  Eye,
  ClipboardList,
  Moon,
  Sun,
} from "lucide-react";

interface AppSidebarProps {
  role: "admin" | "client";
  viewAsContactId?: number;
}

const adminItems = [
  { title: "Contacts", url: "/admin/contacts", icon: Users },
  { title: "Products & Inventory", url: "/admin/products", icon: Package },
  { title: "Restock Requests", url: "/admin/restock-requests", icon: RefreshCw },
  { title: "Forms", url: "/admin/forms", icon: ClipboardList },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

const clientItems = [
  { title: "Profile", url: "/portal/profile", icon: User },
  { title: "Products & Inventory", url: "/portal/products", icon: Package },
  { title: "Restock Requests", url: "/portal/restock", icon: RefreshCw },
  { title: "Forms", url: "/portal/forms", icon: ClipboardList },
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
      {/* ── Brand Header ── */}
      <SidebarHeader className="p-0 border-b border-sidebar-border">
        {/* Expanded */}
        <div className="group-data-[collapsible=icon]:hidden">
          <Link href={role === "admin" ? "/admin/contacts" : "/portal/profile"}>
            <div
              className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-sidebar-accent/60 transition-colors"
              data-testid="link-sidebar-home"
            >
              <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                <Warehouse className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm tracking-wide leading-none text-sidebar-foreground">
                  SYSTEM D
                </p>
                <p className="text-[11px] text-sidebar-primary mt-1 font-medium capitalize tracking-wider uppercase">
                  {role === "admin" ? "Admin Panel" : "Client Portal"}
                </p>
              </div>
            </div>
          </Link>
          <div className="flex justify-end px-3 pb-2">
            <SidebarTrigger
              className="h-6 w-6 text-muted-foreground hover:text-sidebar-foreground"
              data-testid="button-sidebar-toggle"
            />
          </div>
        </div>
        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2 py-3">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-sm">
            <Warehouse className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <SidebarTrigger
            className="h-6 w-6 text-muted-foreground hover:text-sidebar-foreground"
            data-testid="button-sidebar-toggle-collapsed"
          />
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-semibold tracking-widest uppercase text-muted-foreground px-2 mb-1">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => {
                const isActive =
                  location === item.url.split("?")[0] ||
                  location.startsWith(item.url.split("?")[0] + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="relative h-9 rounded-md group/item"
                    >
                      <Link
                        href={item.url}
                        data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        className="flex items-center gap-3 px-3"
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sidebar-primary rounded-r-full" />
                        )}
                        <item.icon
                          className={`h-4 w-4 flex-shrink-0 transition-colors ${
                            isActive
                              ? "text-sidebar-primary"
                              : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium transition-colors ${
                            isActive
                              ? "text-sidebar-foreground"
                              : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                          }`}
                        >
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* View As selector */}
        {role === "admin" && viewAsContactId && contacts && contacts.length > 0 && (
          <SidebarGroup className="mt-2">
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-semibold tracking-widest uppercase text-muted-foreground px-2 mb-1 flex items-center gap-1.5">
              <Eye className="h-3 w-3" />
              Preview Portal
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-1">
              <Select
                value={viewAsContactId ? String(viewAsContactId) : "__admin__"}
                onValueChange={handleViewAsChange}
              >
                <SelectTrigger
                  className="w-full h-8 text-xs group-data-[collapsible=icon]:hidden"
                  data-testid="select-view-as-contact"
                >
                  <SelectValue placeholder="View as client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__admin__" data-testid="option-view-as-admin">
                    — Admin view
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

      {/* ── Footer / User ── */}
      <SidebarFooter className="p-0 border-t border-sidebar-border">
        {/* Expanded */}
        <div className="group-data-[collapsible=icon]:hidden px-3 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0 ring-1 ring-sidebar-border">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
              <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-tight truncate text-sidebar-foreground" data-testid="text-sidebar-username">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>

        {/* Collapsed */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-7 w-7 ring-1 ring-sidebar-border cursor-pointer">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                <AvatarFallback className="text-[10px] bg-sidebar-accent text-sidebar-accent-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
