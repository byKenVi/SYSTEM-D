import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Contact, Product, FormSubmission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2, ClipboardList, Clock, DollarSign, ExternalLink, FileText, Minus, Package, ShoppingCart, TrendingDown, TrendingUp, Users } from "lucide-react";
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
    <div className="space-y-6 animate-in w-full max-w-full">
      {/* Header section with gradient background */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
          <div className="h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              <Building2 className="h-3.5 w-3.5" /> Aperçu
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              {greeting()}, {user?.firstName || "Admin"}
            </h1>
            <p className="text-muted-foreground mt-3 text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Voici ce qui se passe sur votre plateforme
            </p>
          </div>
        </div>
      </div>

      {/* Row 1: Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-contacts">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Contacts</Badge>
            </div>
            <div>
              {loadingContacts ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-contacts">{contacts?.length ?? 0}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{activeContacts} Actifs</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-companies">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-6 w-6 text-emerald-500" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Entreprises</Badge>
            </div>
            <div>
              {loadingContacts ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-companies">{companiesCount}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Clients Uniques</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-products">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Produits</Badge>
            </div>
            <div>
              {loadingProducts ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-products">{products?.length ?? 0}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">En Inventaire</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-forms">
          <div className="absolute right-0 top-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-6 w-6 text-purple-500" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Demandes</Badge>
            </div>
            <div>
              {loadingForms ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-forms">{openForms}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">À Traiter</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Row 2: Shopify KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="border-border/50 shadow-sm" data-testid="stat-card-orders-month">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" /> Commandes ce mois
                    </p>
                    {loadingKpis ? <Skeleton className="h-8 w-24" /> : (
                      <div className="flex items-baseline gap-3">
                        <p className="text-3xl font-mono font-bold text-foreground" data-testid="stat-value-orders-month">{kpis?.ordersThisMonth ?? 0}</p>
                        <TrendBadge value={kpis?.ordersTrend ?? null} />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm" data-testid="stat-card-value-month">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" /> Valeur ce mois
                    </p>
                    {loadingKpis ? <Skeleton className="h-8 w-32" /> : (
                      <div className="flex items-baseline gap-3">
                        <p className="text-3xl font-mono font-bold text-foreground truncate" data-testid="stat-value-value-month">{money(kpis?.valueThisMonth ?? 0, kpis?.currency)}</p>
                        <TrendBadge value={kpis?.valueTrend ?? null} />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-widest">Demandes Récentes</CardTitle>
              <Link href="/admin/forms">
                <Button variant="ghost" size="sm" className="h-8 text-xs font-bold hover:bg-muted" data-testid="link-view-all-forms">
                  Voir tout <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loadingForms ? (
                <div className="divide-y divide-border/50">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 flex gap-4"><Skeleton className="h-10 w-10 rounded-lg" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div></div>
                  ))}
                </div>
              ) : recentForms.length === 0 ? (
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">Aucune demande de service pour l'instant</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentForms.map((form) => (
                    <Link key={form.id} href={`/admin/forms/${form.id}`}>
                      <div className="px-6 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors group cursor-pointer" data-testid={`row-recent-form-${form.id}`}>
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-background border flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                            <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div>
                            <p className="font-mono font-bold text-sm text-foreground">{form.formNumber}</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{TYPE_LABELS[form.formType] || form.formType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className={`font-bold border px-2.5 py-0.5 uppercase tracking-wide text-[10px] ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                          <span className="text-xs text-muted-foreground hidden sm:block">
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
            <Card className="border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest">Commandes par client (30j)</CardTitle>
                <Link href="/admin/boutique">
                  <Button variant="ghost" size="sm" className="h-8 text-xs font-bold hover:bg-muted">
                    Boutique <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {loadingKpis ? (
                  <div className="px-6 pb-4 space-y-2 pt-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {[...perClient].sort((a, b) => b.ordersThisMonth - a.ordersThisMonth).map((c) => (
                      <Link key={c.contactId} href={`/admin/contacts/${c.contactId}`}>
                        <div className="px-6 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`row-client-kpi-${c.contactId}`}>
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.companyName || c.contactName}</p>
                            {c.lastOrderAt && (
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                Dernière commande: {new Date(c.lastOrderAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-foreground">{c.ordersThisMonth} cmd{c.ordersThisMonth !== 1 ? "s" : ""}</p>
                            <p className="text-xs font-mono font-medium text-muted-foreground mt-0.5">{money(c.valueThisMonth, kpis?.currency)}</p>
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
        <div className="space-y-6">
          {/* Forms by Status */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Statut des Demandes</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {loadingForms ? (
                <div className="space-y-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <div className="space-y-3">
                  {[
                    { key: "draft", label: "Brouillon", icon: FileText, color: "text-muted-foreground" },
                    { key: "submitted", label: "Soumis", icon: Clock, color: "text-blue-500" },
                    { key: "in_review", label: "En révision", icon: AlertCircle, color: "text-amber-500" },
                    { key: "approved", label: "Approuvé", icon: CheckCircle2, color: "text-emerald-500" },
                    { key: "completed", label: "Terminé", icon: TrendingUp, color: "text-purple-500" },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between" data-testid={`status-count-${key}`}>
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <span className="text-sm font-mono font-bold">{formStatusCounts[key] ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Products */}
          {(loadingKpis || topProducts.length > 0) && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Top produits (30j)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingKpis ? (
                  <div className="p-4 space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border/50 p-2">
                    {topProducts.slice(0, 5).map((p: any, i: number) => {
                      const maxQty = topProducts[0]?.quantity ?? 1;
                      const pct = Math.round((p.quantity / maxQty) * 100);
                      return (
                        <div key={i} className="px-3 py-3 flex items-center gap-3" data-testid={`row-top-product-${i}`}>
                          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate mb-1">{p.title}</p>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold shrink-0">{p.quantity}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Low stock alerts */}
          {!loadingKpis && lowStockProducts.length > 0 && (
            <Card className="border-red-200 dark:border-red-900/40 shadow-sm overflow-hidden bg-red-50/50 dark:bg-red-900/10">
              <CardHeader className="pb-3 border-b border-red-100 dark:border-red-900/20 bg-red-100/50 dark:bg-red-900/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Rupture Imminente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-red-100 dark:divide-red-900/20">
                  {lowStockProducts.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between" data-testid={`row-low-stock-${p.id}`}>
                      <div className="min-w-0 pr-4">
                        <p className="text-sm font-bold truncate text-foreground">{p.name}</p>
                        {p.companyName && <p className="text-[10px] font-mono font-medium text-muted-foreground mt-0.5 truncate">{p.companyName}</p>}
                      </div>
                      <Badge variant="outline" className="shrink-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold tabular-nums">
                        {p.inventoryQuantity} un.
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
