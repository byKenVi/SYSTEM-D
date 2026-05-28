import { Switch, Route, useLocation, Redirect, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Eye, ArrowLeft, ShieldAlert } from "lucide-react";
import type { Contact } from "@shared/schema";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import AdminContacts from "@/pages/admin/contacts";
import AdminContactDetail from "@/pages/admin/contact-detail";
import AdminProductDetail from "@/pages/admin/product-detail";
import AdminRestockRequests from "@/pages/admin/restock-requests";
import AdminCommandes from "@/pages/admin/commandes";
import AdminSettingsPage from "@/pages/admin/settings";
import PortalProfile from "@/pages/portal/profile";
import PortalProductDetail from "@/pages/portal/product-detail";
import PortalRestock from "@/pages/portal/restock";
import PortalCommandes from "@/pages/portal/commandes";
import PortalLivraisons from "@/pages/portal/livraisons";
import AdminForms, { AdminFormDetail } from "@/pages/admin/forms";
import AdminBoutique from "@/pages/admin/boutique";
import AdminOrderDetail from "@/pages/admin/order-detail";
import AdminCustomerDetail from "@/pages/admin/customer-detail";
import AdminInventaire from "@/pages/admin/inventaire";
import FormEditor from "@/pages/form-editor";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminLivraisons from "@/pages/admin/livraisons";
import AdminNotifications from "@/pages/admin/notifications";
import MapiRepsPage from "@/pages/admin/mapi-reps";
import PortalOrderDetail from "@/pages/portal/order-detail";
import PortalCustomerDetail from "@/pages/portal/customer-detail";
import PortalForms from "@/pages/portal/forms";
import PortalBoutique from "@/pages/portal/boutique";
import PortalDashboard from "@/pages/portal/dashboard";
import PortalNotifications from "@/pages/portal/notifications";
import FormPrintPage from "@/pages/form-print";

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
      <AppSidebar role="admin" />
      <SidebarInset className="overflow-y-auto scrollbar-hide bg-background">
        <div className="p-6 lg:p-8 min-h-full">
          <Switch>
            <Route path="/admin/dashboard" component={AdminDashboard} />
            <Route path="/admin/contacts/:id" component={AdminContactDetail} />
            <Route path="/admin/contacts" component={AdminContacts} />
            <Route path="/admin/products/:id" component={AdminProductDetail} />
            <Route path="/admin/boutique" component={AdminBoutique} />
            <Route path="/admin/orders/:id" component={AdminOrderDetail} />
            <Route path="/admin/customers/:id" component={AdminCustomerDetail} />
            <Route path="/admin/inventaire" component={AdminInventaire} />
            <Route path="/admin/commandes" component={AdminCommandes} />
            <Route path="/admin/livraisons" component={AdminLivraisons} />
            <Route path="/admin/notifications" component={AdminNotifications} />
            <Route path="/admin/products"><Redirect to="/admin/boutique" /></Route>
            <Route path="/admin/orders"><Redirect to="/admin/boutique" /></Route>
            <Route path="/admin/restock-requests"><Redirect to="/admin/commandes" /></Route>
            <Route path="/admin/forms/:id/edit">
              {(params) => <FormEditor formId={Number(params?.id)} role="admin" backUrl={`/admin/forms/${params?.id}`} />}
            </Route>
            <Route path="/admin/forms/:id">
              {(params) => <AdminFormDetail id={Number(params?.id)} />}
            </Route>
            <Route path="/admin/forms" component={AdminForms} />
            <Route path="/admin/mapi-reps" component={MapiRepsPage} />
            <Route path="/admin/settings" component={AdminSettingsPage} />
            <Route path="/admin">
              <Redirect to="/admin/dashboard" />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ClientLayout({ viewAsContactId }: { viewAsContactId?: number }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <AppSidebar role="client" viewAsContactId={viewAsContactId} />
      <SidebarInset className="overflow-hidden bg-background">
        {viewAsContactId && <ViewAsBanner contactId={viewAsContactId} />}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-6 lg:p-8 min-h-full">
            <Switch>
              <Route path="/portal/dashboard">
                <PortalDashboard viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/profile">
                <PortalProfile viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/products/:id">
                <PortalProductDetail viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/orders/:id">
                <PortalOrderDetail />
              </Route>
              <Route path="/portal/customers/:id">
                <PortalCustomerDetail />
              </Route>
              <Route path="/portal/boutique">
                <PortalBoutique viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/products">
                <Redirect to={`/portal/boutique${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`} />
              </Route>
              <Route path="/portal/restock">
                <Redirect to={`/portal/commandes${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`} />
              </Route>
              <Route path="/portal/commandes">
                <PortalCommandes viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/livraisons">
                <PortalLivraisons viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal/notifications">
                <PortalNotifications />
              </Route>
              <Route path="/portal/forms/:id?">
                <PortalForms viewAsContactId={viewAsContactId} />
              </Route>
              <Route path="/portal">
                <Redirect to={`/portal/dashboard${viewAsContactId ? `?viewAs=${viewAsContactId}` : ""}`} />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ViewAsBanner({ contactId }: { contactId: number }) {
  const { data: contact } = useQuery<Contact>({
    queryKey: ["/api/admin/view-as", contactId, "profile"],
  });

  return (
    <div className="bg-primary border-b border-primary/20 px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap" data-testid="banner-view-as">
      <div className="flex items-center gap-2 text-sm">
        <Eye className="h-4 w-4 text-primary-foreground flex-shrink-0" />
        <span className="text-primary-foreground font-medium">
          Aperçu en tant que <span className="font-bold">{contact?.name || `Contact #${contactId}`}</span>
          {contact?.companyName && <span className="opacity-80 font-normal"> ({contact.companyName})</span>}
        </span>
      </div>
      <Link href="/admin/contacts">
        <Button size="sm" variant="secondary" className="h-8 text-xs font-semibold" data-testid="button-exit-view-as">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Quitter l'aperçu
        </Button>
      </Link>
    </div>
  );
}

function AccessDenied() {
  const { logout } = useAuth();

  return (
    <div className="flex items-center justify-center h-screen bg-background" data-testid="access-denied-screen">
      <div className="max-w-md text-center space-y-6 px-6">
        <div className="h-16 w-16 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto ring-1 ring-destructive/20">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-access-denied-title">Accès refusé</h1>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Votre adresse e-mail n'est pas associée à un compte invité. Seuls les utilisateurs ayant reçu une invitation peuvent accéder à cette plateforme.
          </p>
        </div>
        <p className="text-sm font-medium text-muted-foreground bg-muted/50 p-4 rounded-lg">
          Si vous pensez qu'il s'agit d'une erreur, veuillez contacter votre administrateur Système D.
        </p>
        <Button variant="outline" className="w-full" onClick={() => logout()} data-testid="button-sign-out-denied">
          Se déconnecter
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
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-xl mx-auto animate-pulse bg-primary/20" />
          <Skeleton className="h-3 w-32 mx-auto bg-muted" />
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
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="max-w-md text-center space-y-6 px-6">
          <div className="h-16 w-16 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Erreur système</h1>
            <p className="text-muted-foreground mt-2">Impossible de charger votre session. Veuillez réessayer.</p>
          </div>
          <Button variant="default" className="w-full" onClick={() => window.location.reload()}>
            Actualiser
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
    return <Redirect to={role === "admin" ? "/admin/dashboard" : "/portal/dashboard"} />;
  }

  const printMatch = location.match(/^\/(admin|portal)\/forms\/(\d+)\/print$/);
  if (printMatch) {
    return <FormPrintPage id={Number(printMatch[2])} />;
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

  return <Redirect to={role === "admin" ? "/admin/dashboard" : "/portal/dashboard"} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-xl mx-auto animate-pulse bg-primary/20" />
          <Skeleton className="h-3 w-32 mx-auto bg-muted" />
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
