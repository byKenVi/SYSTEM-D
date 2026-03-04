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
  RefreshCw,
  Settings,
  User,
  Warehouse,
  LogOut,
  Eye,
} from "lucide-react";

interface AppSidebarProps {
  role: "admin" | "client";
  viewAsContactId?: number;
}

const adminItems = [
  { title: "Contacts", url: "/admin/contacts", icon: Users },
  { title: "Products & Inventory", url: "/admin/products", icon: Package },
  { title: "Restock Requests", url: "/admin/restock-requests", icon: RefreshCw },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

const clientItems = [
  { title: "Profile", url: "/portal/profile", icon: User },
  { title: "Products & Inventory", url: "/portal/products", icon: Package },
  { title: "Restock Requests", url: "/portal/restock", icon: RefreshCw },
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
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        {/* Expanded state: logo + name + trigger */}
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
          <Link href={role === "admin" ? "/admin/contacts" : "/portal/profile"}>
            <div className="flex items-center gap-2 hover-elevate rounded-md p-1 cursor-pointer" data-testid="link-sidebar-home">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                <Warehouse className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">SYSTEM D</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{role} Panel</p>
              </div>
            </div>
          </Link>
          <SidebarTrigger data-testid="button-sidebar-toggle" />
        </div>
        {/* Collapsed state: just the trigger centered */}
        <div className="hidden group-data-[collapsible=icon]:flex justify-center">
          <SidebarTrigger data-testid="button-sidebar-toggle-collapsed" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url.split("?")[0] || location.startsWith(item.url.split("?")[0] + "/")}
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role === "admin" && viewAsContactId && contacts && contacts.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Preview Portal
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <Select
                value={viewAsContactId ? String(viewAsContactId) : "__admin__"}
                onValueChange={handleViewAsChange}
              >
                <SelectTrigger
                  className="w-full h-8 text-xs"
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
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate" data-testid="text-sidebar-username">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <div className="flex items-center group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
