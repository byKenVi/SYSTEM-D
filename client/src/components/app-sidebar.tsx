import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Users,
  Package,
  RefreshCw,
  Settings,
  User,
  Warehouse,
  LogOut,
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
  const [location] = useLocation();
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href={role === "admin" ? "/admin/contacts" : "/portal/profile"}>
          <div className="flex items-center gap-2 hover-elevate rounded-md p-1 cursor-pointer" data-testid="link-sidebar-home">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Warehouse className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none">StockVault</p>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{role} Panel</p>
            </div>
          </div>
        </Link>
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
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-sidebar-username">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
