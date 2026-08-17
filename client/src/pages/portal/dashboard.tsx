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
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Activity,
  Layers,
  ArrowUpRight,
  FileText
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  completed: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
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

const TYPE_ICONS: Record<string, any> = {
  entreposage: Layers,
  tri: RefreshCw,
  inspection: ClipboardList,
  copacking: Package,
  livraison: ArrowRight,
};

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"><TrendingUp className="h-3 w-3" />+{value}%</span>;
  if (value < 0) return <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-[10px] font-bold text-red-600 dark:text-red-400"><TrendingDown className="h-3 w-3" />{value}%</span>;
  return <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
}

function money(amount: number, currency = "CAD") {
  return amount.toLocaleString("fr-CA", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

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

  const { data: kpis, isLoading: loadingKpis } = useQuery<any>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "dashboard/kpis"]
      : ["/api/portal/dashboard/kpis"],
    queryFn: async () => {
      const url = viewAsContactId
        ? `/api/admin/view-as/${viewAsContactId}/dashboard/kpis`
        : `/api/portal/dashboard/kpis`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch KPIs");
      return res.json();
    },
  });

  const activeForms = forms?.filter((f) => f.status !== "completed") ?? [];
  const pendingRestock = restockRequests?.filter((r) => r.status === "Processing")?.length ?? 0;
  const recentForms = forms?.slice(0, 4) ?? [];

  const qs = viewAsContactId ? `?viewAs=${viewAsContactId}` : "";

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const hasShopifyData = (kpis?.ordersThisMonth ?? 0) > 0 || (kpis?.ordersLast30Days ?? 0) > 0 || (kpis?.topProducts?.length ?? 0) > 0;

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
              <Activity className="h-3.5 w-3.5" /> Aperçu
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              {greeting()}, {contact?.name?.split(" ")[0] || user?.firstName || "there"}
            </h1>
            {contact?.companyName && (
              <p className="text-muted-foreground mt-3 text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {contact.companyName}
              </p>
            )}
          </div>
          
          {!viewAsContactId && (
            <Button asChild size="lg" className="shadow-lg shadow-primary/20 shrink-0">
              <Link href="/portal/forms">
                <Plus className="h-5 w-5 mr-2" />
                Nouvelle Demande
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Primary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-products">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Inventaire</Badge>
            </div>
            <div>
              {loadingProducts ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-products">{products?.length ?? 0}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Produits Actifs</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-restock">
          <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                <RefreshCw className="h-6 w-6 text-amber-500" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Logistique</Badge>
            </div>
            <div>
              {loadingRestock ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-restock">{pendingRestock}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">En Attente</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group" data-testid="stat-card-forms">
          <div className="absolute right-0 top-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
                <ClipboardList className="h-6 w-6 text-purple-500" />
              </div>
              <Badge variant="outline" className="bg-background border-border text-[10px] uppercase font-bold tracking-widest">Services</Badge>
            </div>
            <div>
              {loadingForms ? <Skeleton className="h-10 w-16 mb-1" /> : (
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="stat-value-forms">{activeForms.length}</p>
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Demandes En Cours</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Activity */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* E-commerce KPIs — masqué si le client n'a pas de données Shopify */}
          {(loadingKpis || hasShopifyData) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="border-border/50 shadow-sm" data-testid="stat-card-orders-month">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" /> Ventes Mensuelles
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
                      <DollarSign className="h-3.5 w-3.5" /> Revenus Mensuels
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
          </div>}

          {/* Recent Forms Activity */}
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-widest">Services Récents</CardTitle>
              <Link href={`/portal/forms${qs}`}>
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
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight mb-2">Aucun service en cours</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm">Vos demandes de services et bons de travail apparaîtront ici.</p>
                  {!viewAsContactId && (
                    <Button asChild size="sm" className="shadow-md shadow-primary/10">
                      <Link href="/portal/forms" data-testid="button-create-first-form">
                        <Plus className="h-4 w-4 mr-2" /> Créer une demande
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentForms.map((form) => {
                    const Icon = TYPE_ICONS[form.formType] || FileText;
                    return (
                      <Link key={form.id} href={`/portal/forms/${form.id}${qs}`}>
                        <div className="px-6 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors group cursor-pointer" data-testid={`row-recent-form-${form.id}`}>
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-background border flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                              <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <div>
                              <p className="font-mono font-bold text-sm text-foreground">{form.formNumber}</p>
                              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{TYPE_LABELS[form.formType] || form.formType}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="outline" className={`font-bold border px-2.5 py-0.5 uppercase tracking-wide text-[10px] ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Secondary Info */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="border-border/50 shadow-sm bg-primary/5 border-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Accès Rapide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!viewAsContactId && (
                <Button asChild size="lg" className="w-full justify-start gap-3 h-12 shadow-sm font-bold" data-testid="link-quick-new-form">
                  <Link href="/portal/forms">
                    <Plus className="h-4 w-4" /> Nouvelle Demande
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 h-12 font-bold bg-background/50 hover:bg-background border-border/50" data-testid="link-quick-products">
                <Link href={`/portal/boutique${qs ? qs + "&tab=products" : "?tab=products"}`}>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Produits Clients
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 h-12 font-bold bg-background/50 hover:bg-background border-border/50" data-testid="link-quick-systemd">
                <Link href={`/portal/boutique${qs ? qs + "&tab=systemd" : "?tab=systemd"}`}>
                  <Package className="h-4 w-4 text-muted-foreground" /> Produits Système D
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 h-12 font-bold bg-background/50 hover:bg-background border-border/50" data-testid="link-quick-profile">
                <Link href={`/portal/profile${qs}`}>
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Paramètres Compte
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Low stock alerts */}
          {!loadingKpis && (kpis?.lowStockProducts?.length ?? 0) > 0 && (
            <Card className="border-red-200 dark:border-red-900/40 shadow-sm overflow-hidden bg-red-50/50 dark:bg-red-900/10">
              <CardHeader className="pb-3 border-b border-red-100 dark:border-red-900/20 bg-red-100/50 dark:bg-red-900/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Rupture Imminente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-red-100 dark:divide-red-900/20">
                  {(kpis?.lowStockProducts ?? []).slice(0, 5).map((p: any) => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between" data-testid={`row-low-stock-${p.id}`}>
                      <div className="min-w-0 pr-4">
                        <p className="text-sm font-bold truncate text-foreground">{p.name}</p>
                        {p.sku && <p className="text-[10px] font-mono font-medium text-muted-foreground mt-0.5">{p.sku}</p>}
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

          {/* Top Products this month */}
          {(loadingKpis || (kpis?.topProducts?.length ?? 0) > 0) && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Top Ventes (30j)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingKpis ? (
                  <div className="p-4 space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border/50 p-2">
                    {(kpis?.topProducts ?? []).map((p: any, i: number) => {
                      const maxQty = kpis.topProducts[0]?.quantity ?? 1;
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
        </div>
      </div>
    </div>
  );
}
