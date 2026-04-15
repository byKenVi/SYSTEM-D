import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Contact, Product, RestockRequest, FormSubmission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  Package,
  RefreshCw,
  ClipboardList,
  ArrowRight,
  Plus,
  ChevronRight,
  Building2,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  completed: "Completed",
};

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

export default function PortalDashboard({ viewAsContactId }: { viewAsContactId?: number }) {
  const { user } = useAuth();

  const { data: contact, isLoading: loadingContact } = useQuery<Contact>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "profile"]
      : ["/api/portal/profile"],
  });

  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products"]
      : ["/api/portal/products"],
  });

  const { data: restockRequests, isLoading: loadingRestock } = useQuery<RestockRequest[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "restock-requests"]
      : ["/api/portal/restock-requests"],
  });

  const { data: forms, isLoading: loadingForms } = useQuery<FormSubmission[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "forms"]
      : ["/api/portal/forms"],
  });

  const activeForms = forms?.filter((f) => f.status !== "completed") ?? [];
  const pendingRestock = restockRequests?.filter((r) => r.status === "Processing")?.length ?? 0;
  const recentForms = forms?.slice(0, 4) ?? [];

  const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          {greeting()}, {contact?.name?.split(" ")[0] || user?.firstName || "there"}
        </h1>
        {contact?.companyName && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {contact.companyName}
          </p>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="stat-card-products">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Products</p>
                {loadingProducts ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-products">{products?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">in storage</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-restock">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Restocks</p>
                {loadingRestock ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-restock">{pendingRestock}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">pending</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-forms">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active Requests</p>
                {loadingForms ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-forms">{activeForms.length}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">in progress</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Forms */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">My Service Requests</CardTitle>
              <Link href={`/portal/forms${qs}`}>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-view-all-forms">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loadingForms ? (
                <div className="px-6 pb-4 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : recentForms.length === 0 ? (
                <div className="px-6 py-8 text-center text-muted-foreground">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No forms yet</p>
                  {!viewAsContactId && (
                    <Link href="/portal/forms">
                      <Button size="sm" className="mt-3" data-testid="button-create-first-form">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Create your first form
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentForms.map((form) => (
                    <Link key={form.id} href={`/portal/forms/${form.id}${qs}`}>
                      <div
                        className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer"
                        data-testid={`row-recent-form-${form.id}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{form.formNumber}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>
                            {STATUS_LABELS[form.status] || form.status}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!viewAsContactId && (
                <Link href="/portal/forms">
                  <Button size="sm" className="w-full justify-start gap-2" data-testid="link-quick-new-form">
                    <Plus className="h-3.5 w-3.5" /> New Service Request
                  </Button>
                </Link>
              )}
              <Link href={`/portal/products${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-products">
                  <Package className="h-3.5 w-3.5" /> View Products
                </Button>
              </Link>
              <Link href={`/portal/restock${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-restock">
                  <RefreshCw className="h-3.5 w-3.5" /> Restock Requests
                </Button>
              </Link>
              <Link href={`/portal/profile${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-profile">
                  <Building2 className="h-3.5 w-3.5" /> My Profile
                </Button>
              </Link>
            </CardContent>
          </Card>

          {contact && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Account Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {loadingContact ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium" data-testid="text-contact-name">{contact.name}</p>
                    </div>
                    {contact.companyName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Company</p>
                        <p className="font-medium">{contact.companyName}</p>
                      </div>
                    )}
                    {contact.phone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{contact.phone}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
