import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Contact, Product, FormSubmission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Package,
  ClipboardList,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  BarChart3,
  ExternalLink,
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
  draft: "Brouillon",
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Terminé",
};

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400"><TrendingUp className="h-3 w-3" />+{value}%</span>;
  if (value < 0) return <span className="flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400"><TrendingDown className="h-3 w-3" />{value}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
}

function money(amount: number, currency = "CAD") {
  return amount.toLocaleString("fr-CA", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: contacts, isLoading: loadingContacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: forms, isLoading: loadingForms } = useQuery<FormSubmission[]>({ queryKey: ["/api/forms"] });
  const { data: kpis, isLoading: loadingKpis } = useQuery<any>({
    queryKey: ["/api/admin/dashboard/kpis"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard/kpis");
      if (!res.ok) throw new Error("Failed to fetch KPIs");
      return res.json();
    },
  });

  const activeContacts = contacts?.filter((c) => c.status === "active")?.length ?? 0;
  const companiesCount = new Set(contacts?.filter((c) => c.companyName).map((c) => c.companyName)).size;
  const openForms = forms?.filter((f) => f.status !== "completed" && f.status !== "draft")?.length ?? 0;
  const recentForms = (forms ?? []).slice(0, 5);

  const formStatusCounts = forms?.reduce(
    (acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  ) ?? {};

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const perClient: any[] = kpis?.perClient ?? [];
  const topProducts: any[] = kpis?.topProducts ?? [];
  const lowStockProducts: any[] = kpis?.lowStockProducts ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          {greeting()}, {user?.firstName || "Admin"}
        </h1>
        <p className="text-muted-foreground mt-1">Voici ce qui se passe sur votre plateforme.</p>
      </div>

      {/* Row 1: Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="stat-card-contacts">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Contacts</p>
                {loadingContacts ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-contacts">{contacts?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{activeContacts} actifs</p>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Entreprises</p>
                {loadingContacts ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-companies">{companiesCount}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">clients uniques</p>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Produits</p>
                {loadingProducts ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-products">{products?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">en inventaire</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-forms">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Demandes ouvertes</p>
                {loadingForms ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-forms">{openForms}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">à traiter</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Shopify KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card data-testid="stat-card-orders-month">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Commandes ce mois</p>
                {loadingKpis ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-orders-month">{kpis?.ordersThisMonth ?? 0}</p>
                )}
                <div className="mt-1">
                  {loadingKpis ? <Skeleton className="h-3 w-16" /> : <TrendBadge value={kpis?.ordersTrend ?? null} />}
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-value-month">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Valeur ce mois</p>
                {loadingKpis ? <Skeleton className="h-8 w-20 mt-1" /> : (
                  <p className="text-2xl font-bold mt-1 truncate" data-testid="stat-value-value-month">{money(kpis?.valueThisMonth ?? 0, kpis?.currency)}</p>
                )}
                <div className="mt-1">
                  {loadingKpis ? <Skeleton className="h-3 w-16" /> : <TrendBadge value={kpis?.valueTrend ?? null} />}
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-low-stock" className="col-span-2 lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Alertes stock</p>
                {loadingKpis ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-low-stock">{lowStockProducts.length}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">produits &lt; 5 unités</p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${lowStockProducts.length > 0 ? "bg-red-500/10" : "bg-muted"}`}>
                <AlertTriangle className={`h-5 w-5 ${lowStockProducts.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Recent Forms */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Demandes récentes</CardTitle>
              <Link href="/admin/forms">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-view-all-forms">
                  Tout afficher <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loadingForms ? (
                <div className="px-6 pb-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : recentForms.length === 0 ? (
                <div className="px-6 pb-6 text-center text-muted-foreground text-sm py-8">Aucune demande de service pour l'instant</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentForms.map((form) => (
                    <Link key={form.id} href={`/admin/forms/${form.id}`}>
                      <div className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`row-recent-form-${form.id}`}>
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-medium">{form.formNumber}</p>
                            <p className="text-xs text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {form.updatedAt ? new Date(form.updatedAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : ""}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-client orders breakdown */}
          {(loadingKpis || perClient.length > 0) && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold">Commandes par client ce mois</CardTitle>
                <Link href="/admin/boutique">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    Boutique <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {loadingKpis ? (
                  <div className="px-6 pb-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...perClient].sort((a, b) => b.ordersThisMonth - a.ordersThisMonth).map((c) => (
                      <Link key={c.contactId} href={`/admin/contacts/${c.contactId}`}>
                        <div className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`row-client-kpi-${c.contactId}`}>
                          <div>
                            <p className="text-sm font-medium">{c.companyName || c.contactName}</p>
                            {c.lastOrderAt && (
                              <p className="text-xs text-muted-foreground">
                                Dernière commande : {new Date(c.lastOrderAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{c.ordersThisMonth} cmd{c.ordersThisMonth !== 1 ? "s" : ""}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{money(c.valueThisMonth, kpis?.currency)}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Forms by Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Statut des demandes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingForms ? (
                <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <>
                  {[
                    { key: "draft", label: "Brouillon", icon: FileText, color: "text-muted-foreground" },
                    { key: "submitted", label: "Soumis", icon: Clock, color: "text-blue-500" },
                    { key: "in_review", label: "En révision", icon: AlertCircle, color: "text-amber-500" },
                    { key: "approved", label: "Approuvé", icon: CheckCircle2, color: "text-emerald-500" },
                    { key: "completed", label: "Terminé", icon: TrendingUp, color: "text-purple-500" },
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

          {/* Top Products */}
          {(loadingKpis || topProducts.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Top produits ce mois
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingKpis ? (
                  <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
                ) : topProducts.slice(0, 5).map((p: any, i: number) => {
                  const maxQty = topProducts[0]?.quantity ?? 1;
                  const pct = Math.round((p.quantity / maxQty) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`row-top-product-${i}`}>
                      <span className="text-xs text-muted-foreground w-4 text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs truncate pr-2">{p.title}</p>
                          <p className="text-xs font-semibold tabular-nums flex-shrink-0">{p.quantity}</p>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Low stock alerts */}
          {!loadingKpis && lowStockProducts.length > 0 && (
            <Card className="border-red-200 dark:border-red-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Stock faible
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lowStockProducts.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between" data-testid={`row-low-stock-${p.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate font-medium">{p.name}</p>
                      {p.companyName && <p className="text-xs text-muted-foreground truncate">{p.companyName}</p>}
                    </div>
                    <Badge className="ml-2 flex-shrink-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs tabular-nums">
                      {p.inventoryQuantity}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
