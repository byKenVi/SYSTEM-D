import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import AdminContacts from "@/pages/admin/contacts";
import AdminProducts from "@/pages/admin/products";
import AdminRestockRequests from "@/pages/admin/restock-requests";
import AdminSettingsPage from "@/pages/admin/settings";
import PortalProfile from "@/pages/portal/profile";
import PortalProducts from "@/pages/portal/products";
import PortalRestock from "@/pages/portal/restock";
import { useQuery } from "@tanstack/react-query";

interface UserRole {
  role: "admin" | "client";
  contactId?: number;
}

function AdminLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role="admin" />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/admin/contacts" component={AdminContacts} />
              <Route path="/admin/products" component={AdminProducts} />
              <Route path="/admin/restock-requests" component={AdminRestockRequests} />
              <Route path="/admin/settings" component={AdminSettingsPage} />
              <Route path="/admin">
                <Redirect to="/admin/contacts" />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ClientLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role="client" />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/portal/profile" component={PortalProfile} />
              <Route path="/portal/products" component={PortalProducts} />
              <Route path="/portal/restock" component={PortalRestock} />
              <Route path="/portal">
                <Redirect to="/portal/profile" />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedApp() {
  const { data: userRole, isLoading: roleLoading } = useQuery<UserRole>({
    queryKey: ["/api/auth/role"],
  });
  const [location] = useLocation();

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  const role = userRole?.role || "client";

  if (location === "/" || location === "") {
    return <Redirect to={role === "admin" ? "/admin/contacts" : "/portal/profile"} />;
  }

  if (location.startsWith("/admin")) {
    if (role !== "admin") return <Redirect to="/portal/profile" />;
    return <AdminLayout />;
  }

  if (location.startsWith("/portal")) {
    return <ClientLayout />;
  }

  return <Redirect to={role === "admin" ? "/admin/contacts" : "/portal/profile"} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
