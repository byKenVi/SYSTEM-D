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
    paid:               { label: "Payé",             cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:            { label: "En attente",       cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    refunded:           { label: "Remboursé",        cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    partially_refunded: { label: "Part. remboursé",  cls: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    voided:             { label: "Annulé",           cls: "text-muted-foreground bg-muted border-border" },
    authorized:         { label: "Autorisé",         cls: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; cls: string }> = {
    fulfilled: { label: "Traité",   cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    partial:   { label: "Partiel",  cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    restocked: { label: "Restocké", cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentStatusIcon({ status }: { status?: string | null }) {
  if (status === "fulfilled") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "partial") return <Clock className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

export default function PortalOrderDetail() {
  const [location] = useLocation();
  const pathParts = location.split("/");
  const shopifyOrderId = pathParts[pathParts.length - 1];
  const searchParams = new URLSearchParams(window.location.search);
  const storeUrl = searchParams.get("store") ?? "";

  const { data, isLoading, error } = useQuery<{ order: any; shopName: string | null; storeUrl: string }>({
    queryKey: ["/api/portal/orders", shopifyOrderId, storeUrl],
    queryFn: () =>
      fetch(`/api/portal/orders/${shopifyOrderId}?store=${encodeURIComponent(storeUrl)}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!shopifyOrderId && !!storeUrl,
    staleTime: 2 * 60 * 1000,
  });

  const order = data?.order;
  const shopifyOrderUrl = storeUrl && shopifyOrderId
    ? `https://${storeUrl}/admin/orders/${shopifyOrderId}`
    : null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link href="/portal/boutique">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
          </Button>
        </Link>
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive/50 mb-3" />
            <p className="text-muted-foreground font-medium">Commande introuvable</p>
            <p className="text-sm text-muted-foreground mt-1">Impossible de charger les détails depuis Shopify.</p>
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
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/portal/boutique">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" data-testid="button-back-orders">
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour aux commandes
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-order-name">{order.name}</h1>
            {order.test && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Test</Badge>}
            <FinancialBadge status={order.financial_status} />
            <FulfillmentBadge status={order.fulfillment_status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span>Passée le {fmt(order.created_at)}</span>
            <div className="flex items-center gap-1">
              <SiShopify className="h-3 w-3 text-green-600 dark:text-green-400" />
              <span>{data.shopName ?? storeUrl}</span>
            </div>
          </div>
        </div>
        {shopifyOrderUrl && (
          <a href={shopifyOrderUrl} target="_blank" rel="noopener noreferrer" data-testid="link-shopify-order">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Voir dans Shopify
            </Button>
          </a>
        )}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-xl font-bold tabular-nums" data-testid="text-order-total">{money(order.total_price, order.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sous-total</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{money(order.subtotal_price, order.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Livraison</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{money(shippingTotal, order.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Taxes</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{money(order.total_tax, order.currency)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Articles ({order.line_items?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(order.line_items ?? []).map((item: any) => (
              <div key={item.id} className="px-6 py-3 flex items-start justify-between gap-4" data-testid={`row-line-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.title}</p>
                  {item.variant_title && <p className="text-xs text-muted-foreground mt-0.5">{item.variant_title}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.sku && <span className="text-xs font-mono text-muted-foreground">SKU: {item.sku}</span>}
                    {item.vendor && <span className="text-xs text-muted-foreground">Fournisseur: {item.vendor}</span>}
                    {item.fulfillment_status && <FulfillmentBadge status={item.fulfillment_status} />}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium tabular-nums">{money(item.price, order.currency)}</p>
                  <p className="text-xs text-muted-foreground">× {item.quantity}</p>
                  {Number(item.total_discount) > 0 && (
                    <p className="text-xs text-emerald-600">-{money(item.total_discount, order.currency)}</p>
                  )}
                  <p className="text-sm font-bold tabular-nums mt-1">
                    {money((Number(item.price) * item.quantity - Number(item.total_discount ?? 0)).toFixed(2), order.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-6 py-4 border-t bg-muted/20 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{money(order.subtotal_price, order.currency)}</span>
            </div>
            {Number(order.total_discounts) > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Rabais</span>
                <span>-{money(order.total_discounts, order.currency)}</span>
              </div>
            )}
            {shippingTotal && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Livraison</span>
                <span>{money(shippingTotal, order.currency)}</span>
              </div>
            )}
            {Number(order.total_tax) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxes</span>
                <span>{money(order.total_tax, order.currency)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{money(order.total_price, order.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer */}
        {(customerName || order.email) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {customerName && <p className="font-medium">{customerName}</p>}
              {order.email && <p className="text-sm text-muted-foreground">{order.email}</p>}
              {order.phone && <p className="text-sm text-muted-foreground">{order.phone}</p>}
            </CardContent>
          </Card>
        )}

        {/* Shipping address */}
        {order.shipping_address && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />Adresse de livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-0.5">
              {order.shipping_address.name && <p className="font-medium">{order.shipping_address.name}</p>}
              {order.shipping_address.company && <p className="text-muted-foreground">{order.shipping_address.company}</p>}
              {order.shipping_address.address1 && <p className="text-muted-foreground">{order.shipping_address.address1}</p>}
              {order.shipping_address.address2 && <p className="text-muted-foreground">{order.shipping_address.address2}</p>}
              <p className="text-muted-foreground">
                {[order.shipping_address.city, order.shipping_address.province, order.shipping_address.zip].filter(Boolean).join(", ")}
              </p>
              {order.shipping_address.country && <p className="text-muted-foreground">{order.shipping_address.country}</p>}
            </CardContent>
          </Card>
        )}

        {/* Fulfillments */}
        {order.fulfillments && order.fulfillments.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" />Expéditions ({order.fulfillments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {order.fulfillments.map((f: any) => (
                <div key={f.id} className="px-6 py-4">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <FulfillmentStatusIcon status={f.status} />
                    <span className="font-medium text-sm capitalize">{f.status}</span>
                    <span className="text-xs text-muted-foreground">{fmt(f.created_at)}</span>
                  </div>
                  {f.tracking_company && (
                    <p className="text-sm text-muted-foreground">
                      {f.tracking_company}
                      {f.tracking_number && ` — ${f.tracking_number}`}
                    </p>
                  )}
                  {f.tracking_url && (
                    <a href={f.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
                      <ExternalLink className="h-3 w-3" />Suivre le colis
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Order notes / tags */}
        {(order.note || order.tags) && (
          <Card className={order.fulfillments?.length > 0 ? "" : "md:col-span-2"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hash className="h-4 w-4" />Notes & Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.note && <p className="text-muted-foreground">{order.note}</p>}
              {order.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {order.tags.split(",").map((t: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
