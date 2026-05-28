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
  Tag,
  FileText,
  ShoppingCart,
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Hash,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
  name?: string;
}

interface ShopifyLineItem {
  id: number;
  title: string;
  variant_title?: string;
  quantity: number;
  price: string;
  sku?: string;
  grams?: number;
  vendor?: string;
  product_id?: number;
  variant_id?: number;
  fulfillable_quantity?: number;
  fulfillment_status?: string | null;
  requires_shipping?: boolean;
  taxable?: boolean;
  gift_card?: boolean;
  total_discount?: string;
  tax_lines?: Array<{ title: string; price: string; rate: number }>;
  discount_allocations?: Array<{ amount: string; discount_application_index: number }>;
  properties?: Array<{ name: string; value: string }>;
}

interface ShopifyFulfillment {
  id: number;
  status: string;
  created_at: string;
  updated_at: string;
  tracking_company?: string;
  tracking_number?: string;
  tracking_url?: string;
  tracking_numbers?: string[];
  tracking_urls?: string[];
  shipment_status?: string;
  line_items?: ShopifyLineItem[];
  destination?: ShopifyAddress;
}

interface ShopifyRefund {
  id: number;
  created_at: string;
  note?: string;
  refund_line_items?: Array<{
    id: number;
    quantity: number;
    line_item_id: number;
    subtotal: string;
    total_tax: string;
  }>;
  transactions?: Array<{
    id: number;
    amount: string;
    currency: string;
    kind: string;
    status: string;
    gateway: string;
  }>;
}

interface ShopifyOrderFull {
  id: number;
  name: string;
  order_number?: number;
  email?: string;
  contact_email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  closed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  payment_gateway?: string;
  gateway?: string;
  total_price: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_shipping_price_set?: { shop_money: { amount: string; currency_code: string } };
  total_tip_received?: string;
  currency: string;
  presentment_currency?: string;
  total_weight?: number;
  source_name?: string;
  referring_site?: string;
  landing_site?: string;
  browser_ip?: string;
  note?: string;
  note_attributes?: Array<{ name: string; value: string }>;
  tags?: string;
  test?: boolean;
  checkout_token?: string;
  customer?: {
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    orders_count?: number;
    total_spent?: string;
    tags?: string;
    verified_email?: boolean;
    state?: string;
    created_at?: string;
    note?: string;
  };
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
  shipping_lines?: Array<{
    id: number;
    title: string;
    code?: string;
    price: string;
    discounted_price?: string;
    source?: string;
    carrier_identifier?: string;
    tax_lines?: Array<{ title: string; price: string; rate: number }>;
  }>;
  tax_lines?: Array<{ title: string; price: string; rate: number }>;
  discount_codes?: Array<{ code: string; amount: string; type: string }>;
  fulfillments?: ShopifyFulfillment[];
  refunds?: ShopifyRefund[];
  payment_details?: { credit_card_company?: string; credit_card_number?: string };
  client_details?: { browser_ip?: string; user_agent?: string; session_hash?: string };
}

interface OrderDetailResponse {
  order: ShopifyOrderFull;
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  shopName: string | null;
  storeUrl: string;
}

function FinancialBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">—</Badge>;
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Payé", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    pending: { label: "En attente", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    authorized: { label: "Autorisé", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    partially_refunded: { label: "Part. remboursé", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    refunded: { label: "Remboursé", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
    voided: { label: "Annulé", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const config = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs border-0 ${config.className}`}>{config.label}</Badge>;
}

function FulfillmentBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">Non traité</Badge>;
  const map: Record<string, { label: string; className: string }> = {
    fulfilled: { label: "Traité", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    partial: { label: "Partiel", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    unfulfilled: { label: "Non traité", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
    restocked: { label: "Restoqué", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  };
  const config = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs border-0 ${config.className}`}>{config.label}</Badge>;
}

function AddressBlock({ address, title }: { address?: ShopifyAddress; title: string }) {
  if (!address) return null;
  const lines = [
    address.name || [address.first_name, address.last_name].filter(Boolean).join(" "),
    address.company,
    address.address1,
    address.address2,
    [address.city, address.province, address.zip].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm">{line}</p>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "" || value === "0" || value === "0.00") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
}

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
  const n = Number(amount);
  return `${currency ?? "CAD"} ${n.toFixed(2)}`;
}

export default function AdminOrderDetail() {
  const [location] = useLocation();
  const pathParts = location.split("/");
  const shopifyOrderId = pathParts[pathParts.length - 1];
  const searchParams = new URLSearchParams(window.location.search);
  const storeUrl = searchParams.get("store") ?? "";

  const { data, isLoading, error } = useQuery<OrderDetailResponse>({
    queryKey: ["/api/admin/orders", shopifyOrderId, storeUrl],
    queryFn: () =>
      fetch(`/api/admin/orders/${shopifyOrderId}?store=${encodeURIComponent(storeUrl)}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!shopifyOrderId && !!storeUrl,
    staleTime: 2 * 60 * 1000,
  });

  const order = data?.order;
  const shopifyOrderUrl = storeUrl ? `https://${storeUrl}/admin/orders/${shopifyOrderId}` : null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || data?.order === undefined) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/boutique">
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
          <Link href="/admin/boutique">
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
            {data.companyName && (
              <Link href={`/admin/contacts/${data.contactId}`}>
                <span className="hover:underline cursor-pointer font-medium text-foreground">{data.companyName}</span>
              </Link>
            )}
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

      {/* Financial summary cards */}
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
            Articles ({order.line_items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {order.line_items.map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-start justify-between gap-4" data-testid={`row-line-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.title}</p>
                  {item.variant_title && <p className="text-xs text-muted-foreground mt-0.5">{item.variant_title}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.sku && <span className="text-xs font-mono text-muted-foreground">SKU: {item.sku}</span>}
                    {item.vendor && <span className="text-xs text-muted-foreground">Fournisseur: {item.vendor}</span>}
                    {item.grams != null && item.grams > 0 && <span className="text-xs text-muted-foreground">{item.grams}g</span>}
                    {item.requires_shipping === false && <Badge variant="outline" className="text-[10px]">Pas de livraison</Badge>}
                    {item.gift_card && <Badge variant="outline" className="text-[10px]">Carte cadeau</Badge>}
                    {item.fulfillment_status && <FulfillmentBadge status={item.fulfillment_status} />}
                  </div>
                  {item.properties && item.properties.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {item.properties.map((p, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{p.name}: {p.value}</p>
                      ))}
                    </div>
                  )}
                  {item.tax_lines && item.tax_lines.length > 0 && (
                    <div className="mt-1 flex gap-2 flex-wrap">
                      {item.tax_lines.map((t, i) => (
                        <span key={i} className="text-xs text-muted-foreground">{t.title} ({(t.rate * 100).toFixed(0)}%): {money(t.price, order.currency)}</span>
                      ))}
                    </div>
                  )}
                  {item.discount_allocations && item.discount_allocations.length > 0 && (
                    <p className="text-xs text-emerald-600 mt-0.5">Rabais: -{money(item.discount_allocations.reduce((s, d) => s + Number(d.amount), 0).toFixed(2), order.currency)}</p>
                  )}
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

          {/* Order totals breakdown */}
          <div className="px-6 py-4 border-t bg-muted/20 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{money(order.subtotal_price, order.currency)}</span>
            </div>
            {Number(order.total_discounts) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rabais</span>
                <span className="text-emerald-600">-{money(order.total_discounts, order.currency)}</span>
              </div>
            )}
            {order.shipping_lines?.map((sl, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">Livraison – {sl.title}</span>
                <span>{money(sl.price, order.currency)}</span>
              </div>
            ))}
            {order.tax_lines?.map((tl, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tl.title} ({(tl.rate * 100).toFixed(0)}%)</span>
                <span>{money(tl.price, order.currency)}</span>
              </div>
            ))}
            {Number(order.total_tip_received) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pourboire</span>
                <span>{money(order.total_tip_received, order.currency)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>{money(order.total_price, order.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer & Addresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />Acheteur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.customer ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {(order.customer.first_name?.[0] ?? order.customer.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{customerName || "—"}</p>
                    {order.customer.email && <p className="text-sm text-muted-foreground">{order.customer.email}</p>}
                    {order.customer.phone && <p className="text-sm text-muted-foreground">{order.customer.phone}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {order.customer.orders_count != null && (
                    <div className="bg-muted/40 rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground">Commandes</p>
                      <p className="text-lg font-bold tabular-nums">{order.customer.orders_count}</p>
                    </div>
                  )}
                  {order.customer.total_spent != null && (
                    <div className="bg-muted/40 rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground">Dépensé total</p>
                      <p className="text-lg font-bold tabular-nums">${Number(order.customer.total_spent).toFixed(2)}</p>
                    </div>
                  )}
                </div>
                {order.customer.tags && <p className="text-xs text-muted-foreground"><span className="font-medium">Tags:</span> {order.customer.tags}</p>}
                {order.customer.note && <p className="text-xs text-muted-foreground italic border-l-2 pl-2">{order.customer.note}</p>}
                {order.customer.verified_email != null && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {order.customer.verified_email ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">Email vérifié</span></>
                    ) : (
                      <><AlertCircle className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-600">Email non vérifié</span></>
                    )}
                  </div>
                )}
                {order.customer.id && (
                  <a href={`https://${storeUrl}/admin/customers/${order.customer.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3 w-3" />Voir dans Shopify
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {order.email || order.contact_email || "Client invité"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />Adresses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AddressBlock address={order.shipping_address} title="Livraison" />
            {order.billing_address && (
              <>
                <Separator />
                <AddressBlock address={order.billing_address} title="Facturation" />
              </>
            )}
            {!order.shipping_address && !order.billing_address && (
              <p className="text-sm text-muted-foreground">Aucune adresse enregistrée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment & Shipping details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />Paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Passerelle" value={order.payment_gateway || order.gateway} />
            {order.payment_details?.credit_card_company && (
              <InfoRow label="Carte" value={`${order.payment_details.credit_card_company} ${order.payment_details.credit_card_number ?? ""}`} />
            )}
            <InfoRow label="Statut" value={order.financial_status} />
            <InfoRow label="Devise" value={order.currency} />
            {order.presentment_currency && order.presentment_currency !== order.currency && (
              <InfoRow label="Devise présentée" value={order.presentment_currency} />
            )}
            {order.discount_codes && order.discount_codes.length > 0 && (
              <div className="py-1.5 border-b">
                <span className="text-sm text-muted-foreground">Codes de rabais</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {order.discount_codes.map((dc, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1">
                      <Tag className="h-3 w-3" />{dc.code} ({dc.type === "percentage" ? `${dc.amount}%` : money(dc.amount, order.currency)})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" />Expédition
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.shipping_lines && order.shipping_lines.length > 0 ? (
              order.shipping_lines.map((sl, i) => (
                <div key={i}>
                  <InfoRow label="Méthode" value={sl.title} />
                  <InfoRow label="Code" value={sl.code} />
                  <InfoRow label="Prix" value={money(sl.price, order.currency)} />
                  {sl.discounted_price && sl.discounted_price !== sl.price && (
                    <InfoRow label="Prix réduit" value={money(sl.discounted_price, order.currency)} />
                  )}
                  <InfoRow label="Source" value={sl.source} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucune livraison</p>
            )}
            {order.total_weight != null && order.total_weight > 0 && (
              <InfoRow label="Poids total" value={`${order.total_weight}g`} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fulfillments */}
      {order.fulfillments && order.fulfillments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" />Expéditions ({order.fulfillments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.fulfillments.map((f) => (
              <div key={f.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FulfillmentBadge status={f.status} />
                    {f.shipment_status && <Badge variant="outline" className="text-xs">{f.shipment_status}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{fmt(f.created_at)}</span>
                </div>
                {f.tracking_company && <p className="text-sm"><span className="text-muted-foreground">Transporteur:</span> {f.tracking_company}</p>}
                {f.tracking_numbers && f.tracking_numbers.length > 0 && (
                  <div className="space-y-1">
                    {f.tracking_numbers.map((n, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-mono">{n}</span>
                        {f.tracking_urls?.[i] && (
                          <a href={f.tracking_urls[i]} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" />Suivre
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {f.line_items && f.line_items.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Articles expédiés</p>
                    {f.line_items.map((li) => (
                      <div key={li.id} className="flex justify-between text-sm">
                        <span>{li.title}{li.variant_title ? ` — ${li.variant_title}` : ""}</span>
                        <span className="text-muted-foreground">× {li.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
                {f.destination && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Destination</p>
                    <AddressBlock address={f.destination} title="" />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Refunds */}
      {order.refunds && order.refunds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />Remboursements ({order.refunds.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.refunds.map((r) => (
              <div key={r.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
                </div>
                {r.note && <p className="text-sm italic text-muted-foreground border-l-2 pl-2">{r.note}</p>}
                {r.refund_line_items && r.refund_line_items.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Articles remboursés</p>
                    {r.refund_line_items.map((rli) => {
                      const li = order.line_items.find((l) => l.id === rli.line_item_id);
                      return (
                        <div key={rli.id} className="flex justify-between text-sm">
                          <span>{li?.title ?? `Article #${rli.line_item_id}`} × {rli.quantity}</span>
                          <span>{money(rli.subtotal, order.currency)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {r.transactions && r.transactions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transactions</p>
                    {r.transactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{t.kind}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{t.gateway}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{money(t.amount, t.currency)}</span>
                          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Order metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />Informations complémentaires
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="N° de commande Shopify" value={order.order_number} />
          <InfoRow label="ID Shopify" value={String(order.id)} />
          <InfoRow label="Source" value={order.source_name} />
          <InfoRow label="Passerelle de paiement" value={order.payment_gateway || order.gateway} />
          <InfoRow label="Email contact" value={order.contact_email ?? order.email} />
          <InfoRow label="Téléphone" value={order.phone} />
          <InfoRow label="Traitée le" value={fmt(order.processed_at)} />
          <InfoRow label="Mise à jour le" value={fmt(order.updated_at)} />
          {order.closed_at && <InfoRow label="Fermée le" value={fmt(order.closed_at)} />}
          {order.cancelled_at && <InfoRow label="Annulée le" value={fmt(order.cancelled_at)} />}
          {order.cancel_reason && <InfoRow label="Raison annulation" value={order.cancel_reason} />}
          <InfoRow label="Site référent" value={order.referring_site} />
          <InfoRow label="Page d'arrivée" value={order.landing_site} />
          <InfoRow label="IP navigateur" value={order.client_details?.browser_ip ?? order.browser_ip} />
          {order.client_details?.user_agent && <InfoRow label="User-agent" value={order.client_details.user_agent} />}
          {order.tags && <InfoRow label="Tags" value={order.tags} />}
          {order.note && (
            <div className="py-1.5 border-b">
              <p className="text-sm text-muted-foreground mb-1">Note</p>
              <p className="text-sm italic">{order.note}</p>
            </div>
          )}
          {order.note_attributes && order.note_attributes.length > 0 && (
            <div className="py-1.5">
              <p className="text-sm text-muted-foreground mb-1">Attributs</p>
              <div className="space-y-0.5">
                {order.note_attributes.map((a, i) => (
                  <p key={i} className="text-sm"><span className="font-medium">{a.name}:</span> {a.value}</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
