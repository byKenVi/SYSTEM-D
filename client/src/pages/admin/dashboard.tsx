import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Contact, Product, RestockRequest, FormSubmission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Package,
  RefreshCw,
  ClipboardList,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

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

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: contacts, isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: restockRequests, isLoading: loadingRestock } = useQuery<RestockRequest[]>({
    queryKey: ["/api/restock-requests"],
  });

  const { data: forms, isLoading: loadingForms } = useQuery<FormSubmission[]>({
    queryKey: ["/api/forms"],
  });

  const activeContacts = contacts?.filter((c) => c.status === "active")?.length ?? 0;
  const companiesCount = new Set(contacts?.filter((c) => c.companyName).map((c) => c.companyName)).size;
  const pendingRestocks = restockRequests?.filter((r) => r.status === "Processing")?.length ?? 0;
  const openForms = forms?.filter((f) => f.status !== "completed" && f.status !== "draft")?.length ?? 0;
  const recentForms = (forms ?? []).slice(0, 5);

  const formStatusCounts = forms?.reduce(
    (acc, f) => {
      acc[f.status] = (acc[f.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) ?? {};

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          {greeting()}, {user?.firstName || "Admin"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening across your platform.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card data-testid="stat-card-contacts">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Clients</p>
                {loadingContacts ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-contacts">{contacts?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{activeContacts} active</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-companies">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Companies</p>
                {loadingContacts ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-companies">{companiesCount}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">unique clients</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-products">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Products</p>
                {loadingProducts ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-products">{products?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">in inventory</p>
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
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-restock">{pendingRestocks}</p>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Open Requests</p>
                {loadingForms ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-forms">{openForms}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">need attention</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">
        {/* Recent Forms */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Service Requests</CardTitle>
              <Link href="/admin/forms">
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
                <div className="px-6 pb-6 text-center text-muted-foreground text-sm py-8">
                  No service requests yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentForms.map((form) => (
                    <Link key={form.id} href={`/admin/forms/${form.id}`}>
                      <div
                        className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer"
                        data-testid={`row-recent-form-${form.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-medium">{form.formNumber}</p>
                            <p className="text-xs text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>
                            {STATUS_LABELS[form.status] || form.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString("en-CA") : ""}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Forms by Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Request Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingForms ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  {[
                    { key: "draft", label: "Draft", icon: FileText, color: "text-muted-foreground" },
                    { key: "submitted", label: "Submitted", icon: Clock, color: "text-blue-500" },
                    { key: "in_review", label: "In Review", icon: AlertCircle, color: "text-amber-500" },
                    { key: "approved", label: "Approved", icon: CheckCircle2, color: "text-emerald-500" },
                    { key: "completed", label: "Completed", icon: TrendingUp, color: "text-purple-500" },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between" data-testid={`status-count-${key}`}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className="text-sm">{label}</span>
                      </div>
                      <span className="text-sm font-semibold">{formStatusCounts[key] ?? 0}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
