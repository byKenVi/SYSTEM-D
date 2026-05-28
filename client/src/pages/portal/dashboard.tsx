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
} from "lucide-react";

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

      {/* Stat Cards — row 1: warehousing */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card data-testid="stat-card-products">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Produits</p>
                {loadingProducts ? <Skeleton className="h-8 w-10 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-products">{products?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">en entrepôt</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-restock">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Réapprovisionnements</p>
                {loadingRestock ? <Skeleton className="h-8 w-10 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-restock">{pendingRestock}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">en attente</p>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Demandes actives</p>
                {loadingForms ? <Skeleton className="h-8 w-10 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-forms">{activeForms.length}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">en cours</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stat Cards — row 2: Shopify / boutique KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card data-testid="stat-card-orders-month">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Commandes ce mois</p>
                {loadingKpis ? <Skeleton className="h-8 w-10 mt-1" /> : (
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

        <Card data-testid="stat-card-low-stock">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Stock faible</p>
                {loadingKpis || loadingProducts ? <Skeleton className="h-8 w-10 mt-1" /> : (
                  <p className="text-3xl font-bold mt-1" data-testid="stat-value-low-stock">{kpis?.lowStockProducts?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">produits &lt; 5 unités</p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${(kpis?.lowStockProducts?.length ?? 0) > 0 ? "bg-red-500/10" : "bg-muted"}`}>
                <AlertTriangle className={`h-5 w-5 ${(kpis?.lowStockProducts?.length ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Forms */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Mes demandes</CardTitle>
              <Link href={`/portal/forms${qs}`}>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-view-all-forms">
                  Tout afficher <ArrowRight className="h-3 w-3" />
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
                  <p className="text-sm">Aucun formulaire pour l'instant</p>
                  {!viewAsContactId && (
                    <Link href="/portal/forms">
                      <Button size="sm" className="mt-3" data-testid="button-create-first-form">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Créer votre premier formulaire
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentForms.map((form) => (
                    <Link key={form.id} href={`/portal/forms/${form.id}${qs}`}>
                      <div className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`row-recent-form-${form.id}`}>
                        <div>
                          <p className="text-sm font-medium">{form.formNumber}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABELS[form.formType] || form.formType}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`text-xs ${STATUS_COLORS[form.status]}`}>{STATUS_LABELS[form.status] || form.status}</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Products this month */}
          {(loadingKpis || (kpis?.topProducts?.length ?? 0) > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Produits les plus commandés ce mois
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingKpis ? (
                  <div className="px-6 pb-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {(kpis?.topProducts ?? []).map((p: any, i: number) => {
                      const maxQty = kpis.topProducts[0]?.quantity ?? 1;
                      const pct = Math.round((p.quantity / maxQty) * 100);
                      return (
                        <div key={i} className="px-6 py-2.5 flex items-center gap-3" data-testid={`row-top-product-${i}`}>
                          <span className="text-xs font-mono text-muted-foreground w-4 text-right flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.title}</p>
                            {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                            <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums flex-shrink-0">{p.quantity}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Low stock alerts */}
          {!loadingKpis && (kpis?.lowStockProducts?.length ?? 0) > 0 && (
            <Card className="border-red-200 dark:border-red-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Alertes stock faible
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(kpis?.lowStockProducts ?? []).map((p: any) => (
                    <div key={p.id} className="px-6 py-2.5 flex items-center justify-between" data-testid={`row-low-stock-${p.id}`}>
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                      </div>
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs tabular-nums">
                        {p.inventoryQuantity} unité{p.inventoryQuantity !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!viewAsContactId && (
                <Link href="/portal/forms">
                  <Button size="sm" className="w-full justify-start gap-2" data-testid="link-quick-new-form">
                    <Plus className="h-3.5 w-3.5" /> Nouvelle demande
                  </Button>
                </Link>
              )}
              <Link href={`/portal/boutique${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-products">
                  <Package className="h-3.5 w-3.5" /> Voir les produits
                </Button>
              </Link>
              <Link href={`/portal/restock${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-restock">
                  <RefreshCw className="h-3.5 w-3.5" /> Bons de travail
                </Button>
              </Link>
              <Link href={`/portal/profile${qs}`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="link-quick-profile">
                  <Building2 className="h-3.5 w-3.5" /> Mon profil
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* 30-day comparison */}
          {!loadingKpis && ((kpis?.ordersLast30Days ?? 0) > 0 || (kpis?.valueLast30Days ?? 0) > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">30 derniers jours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Commandes</span>
                  <span className="font-semibold tabular-nums">{kpis?.ordersLast30Days ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valeur</span>
                  <span className="font-semibold tabular-nums">{money(kpis?.valueLast30Days ?? 0, kpis?.currency)}</span>
                </div>
                {kpis?.lastOrderAt && (
                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Dernière commande</span>
                    <span className="text-xs text-right">{new Date(kpis.lastOrderAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {contact && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Informations du compte</CardTitle>
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
                      <p className="text-xs text-muted-foreground">Nom</p>
                      <p className="font-medium" data-testid="text-contact-name">{contact.name}</p>
                    </div>
                    {contact.companyName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Entreprise</p>
                        <p className="font-medium">{contact.companyName}</p>
                      </div>
                    )}
                    {contact.phone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Téléphone</p>
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
