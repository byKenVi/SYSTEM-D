import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  Package,
  MapPin,
  User,
  CreditCard,
  Truck,
  FileText,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Hash,
  ShoppingBag
} from "lucide-react";
import { SiShopify } from "react-icons/si";

function fmt(date?: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function money(amount?: string | number | null, currency?: string) {
  if (amount == null) return "—";
  return `${currency ?? "CAD"} ${Number(amount).toFixed(2)}`;
}

function FinancialBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    paid:               { label: "Payé",             cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20" },
    pending:            { label: "En attente",       cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20" },
    refunded:           { label: "Remboursé",        cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
    partially_refunded: { label: "Part. remboursé",  cls: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
    voided:             { label: "Annulé",           cls: "text-muted-foreground bg-muted border-border" },
    authorized:         { label: "Autorisé",         cls: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; cls: string }> = {
    fulfilled: { label: "Traité",   cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20" },
    partial:   { label: "Partiel",  cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20" },
    restocked: { label: "Restocké", cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentStatusIcon({ status }: { status?: string | null }) {
  if (status === "fulfilled") return <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>;
  if (status === "partial") return <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20"><Clock className="h-4 w-4 text-amber-500" /></div>;
  return <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border border-border"><XCircle className="h-4 w-4 text-muted-foreground" /></div>;
}

export default function PortalOrderDetail() {
  const [location] = useLocation();
  const pathParts = location.split("/");
  const shopifyOrderId = pathParts[pathParts.length - 1];
  const searchParams = new URLSearchParams(window.location.search);
  const storeUrl = searchParams.get("store") ?? "";
  const integrationId = searchParams.get("integrationId") ?? "";
  const viewAs = searchParams.get("viewAs");
  const requestedReturnTo = searchParams.get("returnTo") ?? "";
  const backHref = requestedReturnTo.startsWith("/portal/")
    ? requestedReturnTo
    : viewAs ? `/portal/boutique?tab=orders&viewAs=${viewAs}` : "/portal/boutique?tab=orders";

  const { data, isLoading, error } = useQuery<{ order: any; shopName: string | null; storeUrl: string; platform?: string; liveUnavailable?: boolean; warning?: string }>({
    queryKey: ["/api/portal/orders", shopifyOrderId, storeUrl, integrationId],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (storeUrl) query.set("store", storeUrl);
      if (integrationId) query.set("integrationId", integrationId);
      const response = await fetch(`/api/portal/orders/${shopifyOrderId}?${query}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Commande introuvable");
      return response.json();
    },
    enabled: !!shopifyOrderId,
    staleTime: 2 * 60 * 1000,
  });

  const order = data?.order;
  const isWooCommerce = data?.platform === "woocommerce";
  const shopifyOrderUrl = storeUrl && shopifyOrderId && !isWooCommerce
    ? `https://${storeUrl}/admin/orders/${shopifyOrderId}`
    : null;

  if (isLoading) {
    return (
      <div className="space-y-6 w-full">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="animate-in">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="mb-6 h-10 px-4 font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la boutique
          </Button>
        </Link>
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Commande introuvable</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Impossible de charger les détails depuis Shopify.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customerName = order.customer
    ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ")
    : null;
  const shippingTotal = order.total_shipping_price_set?.shop_money?.amount;

  return (
    <div className="space-y-8 animate-in w-full pb-12">
      {data?.liveUnavailable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3 flex items-center gap-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {data.warning || "Détails locaux affichés. Shopify live indisponible."}
        </div>
      )}
      
      {/* ── Action Header (Sticky) ── */}
      <div className="sticky top-0 z-40 -mx-4 px-4 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50 mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted shrink-0" data-testid="button-back-orders">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground" data-testid="text-order-name">
                {order.name}
              </h1>
              {order.test && <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-amber-500/50 text-amber-600 bg-amber-500/10">Test</Badge>}
              <FinancialBadge status={order.financial_status} />
              <FulfillmentBadge status={order.fulfillment_status} />
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {fmt(order.created_at)}
              <span className="text-border mx-2">•</span>
              <SiShopify className="h-3.5 w-3.5 text-[#95bf47]" />
              <span className="truncate max-w-[200px]">{data.shopName ?? storeUrl}</span>
            </div>
          </div>
        </div>

        {shopifyOrderUrl && (
          <Button variant="outline" asChild className="shrink-0 font-bold border-border/50 bg-card hover:bg-muted">
            <a href={shopifyOrderUrl} target="_blank" rel="noopener noreferrer" data-testid="link-shopify-order">
              Voir dans Shopify <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        )}
      </div>

      {/* WooCommerce notice */}
      {isWooCommerce && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 px-4 py-3 flex items-center gap-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Commande importée depuis WooCommerce — certains détails peuvent ne pas être disponibles.</span>
        </div>
      )}

      {/* Financial summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 shadow-sm bg-card hover:border-primary/30 transition-colors">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total</span>
            </div>
            <p className="text-3xl font-mono font-bold text-foreground" data-testid="text-order-total">{money(order.total_price, order.currency)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm bg-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sous-total</span>
            </div>
            <p className="text-3xl font-mono font-bold text-foreground">{money(order.subtotal_price, order.currency)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm bg-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Livraison</span>
            </div>
            <p className="text-3xl font-mono font-bold text-foreground">{money(shippingTotal, order.currency)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm bg-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Taxes</span>
            </div>
            <p className="text-3xl font-mono font-bold text-foreground">{money(order.total_tax, order.currency)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-sm overflow-hidden bg-card">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Articles commandés ({order.line_items?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {(order.line_items ?? []).map((item: any) => (
                  <div key={item.id} className="p-6 flex flex-col sm:flex-row gap-6 hover:bg-muted/10 transition-colors" data-testid={`row-line-item-${item.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base text-foreground mb-1">{item.title}</p>
                      {item.variant_title && <p className="text-sm font-medium text-muted-foreground mb-3">{item.variant_title}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.sku && <Badge variant="outline" className="font-mono text-[10px] bg-muted/30 border-dashed">{item.sku}</Badge>}
                        {item.vendor && <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">{item.vendor}</Badge>}
                        {item.fulfillment_status && <FulfillmentBadge status={item.fulfillment_status} />}
                      </div>
                    </div>
                    
                    <div className="flex items-center sm:items-end justify-between sm:flex-col gap-2 bg-muted/30 sm:bg-transparent p-4 sm:p-0 rounded-xl sm:rounded-none w-full sm:w-auto shrink-0">
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-mono font-medium text-muted-foreground">{money(item.price, order.currency)}</p>
                        <p className="text-xs font-bold text-foreground mt-0.5">Qté: {item.quantity}</p>
                        {Number(item.total_discount) > 0 && (
                          <Badge variant="outline" className="mt-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-1.5 py-0">
                            -{money(item.total_discount, order.currency)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-lg font-mono font-bold text-foreground">
                        {money(((parseFloat(item.price) || 0) * (item.quantity || 0) - (parseFloat(item.total_discount ?? "0") || 0)).toFixed(2), order.currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals Summary */}
              <div className="p-6 border-t border-border bg-muted/20">
                <div className="max-w-xs ml-auto space-y-3">
                  <div className="flex justify-between text-sm font-medium text-muted-foreground">
                    <span>Sous-total</span>
                    <span className="font-mono">{money(order.subtotal_price, order.currency)}</span>
                  </div>
                  {Number(order.total_discounts) > 0 && (
                    <div className="flex justify-between text-sm font-bold text-emerald-600">
                      <span>Rabais</span>
                      <span className="font-mono">-{money(order.total_discounts, order.currency)}</span>
                    </div>
                  )}
                  {shippingTotal && (
                    <div className="flex justify-between text-sm font-medium text-muted-foreground">
                      <span>Livraison</span>
                      <span className="font-mono">{money(shippingTotal, order.currency)}</span>
                    </div>
                  )}
                  {Number(order.total_tax) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-muted-foreground">
                      <span>Taxes</span>
                      <span className="font-mono">{money(order.total_tax, order.currency)}</span>
                    </div>
                  )}
                  <Separator className="my-2 border-border" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-foreground uppercase tracking-widest">Total</span>
                    <span className="text-2xl font-mono font-bold text-primary">{money(order.total_price, order.currency)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fulfillments */}
          {order.fulfillments && order.fulfillments.length > 0 && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  Expéditions ({order.fulfillments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border/50 p-0">
                {order.fulfillments.map((f: any) => (
                  <div key={f.id} className="p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-4">
                      <FulfillmentStatusIcon status={f.status} />
                      <div>
                        <p className="font-bold text-sm uppercase tracking-widest text-foreground mb-1">{f.status}</p>
                        <p className="text-xs font-medium text-muted-foreground">{fmt(f.created_at)}</p>
                      </div>
                    </div>
                    
                    <div className="bg-muted/50 rounded-xl p-4 w-full sm:w-auto text-left sm:text-right border border-border/50">
                      {f.tracking_company ? (
                        <>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{f.tracking_company}</p>
                          <p className="font-mono font-bold text-sm text-foreground">
                            {f.tracking_number || "Pas de numéro"}
                          </p>
                          {f.tracking_url && (
                            <Button variant="ghost" asChild className="h-auto p-0 mt-2 text-primary font-bold text-xs">
                              <a href={f.tracking_url} target="_blank" rel="noopener noreferrer">
                                Suivre le colis <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            </Button>
                          )}
                        </>
                      ) : (
                        <p className="text-sm font-medium text-muted-foreground italic">Aucune information de suivi</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Right Column: Customer & Details */}
        <div className="space-y-6">
          
          {/* Customer */}
          {(customerName || order.email) && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-5 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Acheteur
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    {customerName && <p className="font-bold text-base text-foreground truncate">{customerName}</p>}
                    {order.email && <p className="text-xs font-medium text-muted-foreground truncate">{order.email}</p>}
                  </div>
                </div>
                {order.phone && (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Téléphone</p>
                    <p className="font-mono font-medium text-sm text-foreground">{order.phone}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Shipping address */}
          {order.shipping_address && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-5 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Adresse de livraison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-1">
                  {order.shipping_address.name && <p className="font-bold text-foreground">{order.shipping_address.name}</p>}
                  {order.shipping_address.company && <p className="font-medium text-muted-foreground text-sm">{order.shipping_address.company}</p>}
                  
                  <div className="pt-2 mt-2 border-t border-border/50 space-y-0.5">
                    {order.shipping_address.address1 && <p className="text-sm text-foreground">{order.shipping_address.address1}</p>}
                    {order.shipping_address.address2 && <p className="text-sm text-foreground">{order.shipping_address.address2}</p>}
                    <p className="text-sm text-foreground">
                      {[order.shipping_address.city, order.shipping_address.province, order.shipping_address.zip].filter(Boolean).join(", ")}
                    </p>
                    {order.shipping_address.country && <p className="text-sm font-bold text-muted-foreground mt-1">{order.shipping_address.country}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order notes / tags */}
          {(order.note || order.tags) && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-5 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" /> Notes & Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {order.note && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Note de commande</p>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400 font-medium">
                      {order.note}
                    </div>
                  </div>
                )}
                {order.tags && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tags Shopify</p>
                    <div className="flex flex-wrap gap-2">
                      {order.tags.split(",").map((t: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-muted text-foreground hover:bg-muted/80">{t.trim()}</Badge>
                      ))}
                    </div>
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
