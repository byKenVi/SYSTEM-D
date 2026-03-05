import { Switch, Route, useLocation, Redirect, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Eye, ArrowLeft, ShieldAlert } from "lucide-react";
import type { Contact } from "@shared/schema";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import AdminContacts from "@/pages/admin/contacts";
import AdminProducts from "@/pages/admin/products";
import AdminRestockRequests from "@/pages/admin/restock-requests";
import AdminSettingsPage from "@/pages/admin/settings";
import PortalProfile from "@/pages/portal/profile";
import PortalProducts from "@/pages/portal/products";
import PortalRestock from "@/pages/portal/restock";

interface UserRole {
  role: "admin" | "client";
  contactId?: number;
}

function AdminLayout() {
  const style = {
    "--sidebar-width": "13rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role="admin" />
        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-6">
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

function ClientLayout({ viewAsContactId }: { viewAsContactId?: number }) {
  const style = {
    "--sidebar-width": "13rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role="client" viewAsContactId={viewAsContactId} />
        <div className="flex flex-col flex-1 min-w-0">
          {viewAsContactId && <ViewAsBanner contactId={viewAsContactId} />}
          <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-6">
            <Switch>
              <Route path="/portal/profile">
                <PortalProfile viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/products">
                <PortalProducts viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/restock">
                <PortalRestock viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal">
                <Redirect to={`/portal/profile${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`} />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ViewAsBanner({ contactId }: { contactId: number }) {
  const { data: contact } = useQuery<Contact>({
    queryKey: ["/api/admin/view-as", contactId, "profile"],
  });

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap" data-testid="banner-view-as">
      <div className="flex items-center gap-2 text-sm">
        <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-amber-800 dark:text-amber-200">
          Viewing as <span className="font-semibold">{contact?.name || `Contact #${contactId}`}</span>
          {contact?.companyName && <span className="text-amber-700 dark:text-amber-300"> ({contact.companyName})</span>}
        </span>
      </div>
      <Link href="/admin/contacts">
        <Button size="sm" variant="outline" data-testid="button-exit-view-as">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Admin
        </Button>
      </Link>
    </div>
  );
}

function AccessDenied() {
  const { logout } = useAuth();

  return (
    <div className="flex items-center justify-center h-screen" data-testid="access-denied-screen">
      <div className="max-w-md text-center space-y-4 px-6">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold" data-testid="text-access-denied-title">Access Denied</h1>
        <p className="text-muted-foreground">
          Your email address is not associated with an invited account. Only users who have received an invitation can access this platform.
        </p>
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, please contact your account administrator.
        </p>
        <Button variant="outline" onClick={() => logout()} data-testid="button-sign-out-denied">
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { data: userRole, isLoading: roleLoading, isError, error } = useQuery<UserRole>({
    queryKey: ["/api/auth/role"],
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message.startsWith("401:")) return false;
      return failureCount < 2;
    },
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

  if (isError) {
    const is401 = error instanceof Error && error.message.startsWith("401:");
    if (is401) {
      return <AccessDenied />;
    }
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-md text-center space-y-4 px-6">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">Unable to load your account. Please try again.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!userRole) {
    return <AccessDenied />;
  }

  const role = userRole.role;

  if (location === "/" || location === "") {
    return <Redirect to={role === "admin" ? "/admin/contacts" : "/portal/profile"} />;
  }

  if (location.startsWith("/admin")) {
    if (role !== "admin") return <Redirect to="/portal/profile" />;
    return <AdminLayout />;
  }

  if (location.startsWith("/portal")) {
    const params = new URLSearchParams(window.location.search);
    const viewAs = params.get("viewAs");
    const viewAsContactId = role === "admin" && viewAs ? Number(viewAs) : undefined;
    return <ClientLayout viewAsContactId={viewAsContactId} />;
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
