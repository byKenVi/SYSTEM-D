import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShoppingCart,
  Search,
  ExternalLink,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  email: string | null;
  customer?: { first_name: string; last_name: string } | null;
  line_items: { id: number; title: string; quantity: number }[];
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  shopName: string | null;
  storeUrl: string;
}

interface OrdersResponse {
  orders: ShopifyOrder[];
  totalCount: number;
}

function FinancialBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const map: Record<string, { label: string; class: string }> = {
    paid:           { label: "Paid",           class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:        { label: "Pending",        class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    refunded:       { label: "Refunded",       class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    partially_refunded: { label: "Part. Refunded", class: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    voided:         { label: "Voided",         class: "text-muted-foreground bg-muted border-border" },
    authorized:     { label: "Authorized",     class: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border-border">Unfulfilled</span>;
  const map: Record<string, { label: string; class: string }> = {
    fulfilled:         { label: "Fulfilled",    class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    partial:           { label: "Partial",      class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    restocked:         { label: "Restocked",    class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

export default function AdminOrders() {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ["/api/admin/orders"],
    queryFn: () => fetch("/api/admin/orders", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60 * 1000,
  });

  const orders = data?.orders ?? [];

  const clients = useMemo(() => {
    const seen = new Map<number, string>();
    for (const o of orders) {
      if (o.contactId && !seen.has(o.contactId)) {
        seen.set(o.contactId, o.contactName ?? `Contact #${o.contactId}`);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (clientFilter !== "all" && String(o.contactId) !== clientFilter) return false;
      if (paymentFilter !== "all" && o.financial_status !== paymentFilter) return false;
      if (fulfillmentFilter !== "all") {
        if (fulfillmentFilter === "unfulfilled" && o.fulfillment_status !== null) return false;
        else if (fulfillmentFilter !== "unfulfilled" && o.fulfillment_status !== fulfillmentFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const customer = o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : o.email ?? "";
        if (
          !o.name.toLowerCase().includes(q) &&
          !customer.toLowerCase().includes(q) &&
          !(o.contactName ?? "").toLowerCase().includes(q) &&
          !(o.shopName ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [orders, search, paymentFilter, fulfillmentFilter, clientFilter]);

  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.financial_status === "paid").length;
    const fulfilled = orders.filter((o) => o.fulfillment_status === "fulfilled").length;
    const pending = orders.filter((o) => !o.fulfillment_status).length;
    const revenue = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
    return { total, paid, fulfilled, pending, revenue };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Orders</h1>
        <p className="text-muted-foreground mt-1">All orders across connected Shopify stores</p>
      </div>

      {/* Stats */}
      {!isLoading && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Orders</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Paid</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.paid}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs text-muted-foreground">Unfulfilled</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Revenue</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search order, customer, client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-search-orders"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-9 w-40 text-xs" data-testid="select-client-filter">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-9 w-36 text-xs" data-testid="select-payment-filter">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="authorized">Authorized</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="partially_refunded">Part. Refunded</SelectItem>
                  <SelectItem value="voided">Voided</SelectItem>
                </SelectContent>
              </Select>

              <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
                <SelectTrigger className="h-9 w-36 text-xs" data-testid="select-fulfillment-filter">
                  <SelectValue placeholder="Fulfillment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                </SelectContent>
              </Select>

              {(search || paymentFilter !== "all" || fulfillmentFilter !== "all" || clientFilter !== "all") && (
                <Badge variant="secondary" className="tabular-nums">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {orders.length === 0 ? (
                          <>
                            <SiShopify className="h-8 w-8 text-muted-foreground/20" />
                            <p className="text-sm font-medium text-muted-foreground">No Shopify stores connected</p>
                            <p className="text-xs text-muted-foreground/60">Connect a Shopify store in Settings to see orders here</p>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="h-7 w-7 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No orders match your filters</p>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((order) => {
                    const customer = order.customer
                      ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
                      : order.email ?? null;
                    const shopifyOrderUrl = `https://${order.storeUrl}/admin/orders/${order.id}`;
                    return (
                      <TableRow key={`${order.storeUrl}-${order.id}`} data-testid={`row-order-${order.id}`} className="group">
                        <TableCell className="font-medium font-mono text-sm">{order.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          {order.contactId ? (
                            <Link href={`/admin/contacts/${order.contactId}`} onClick={(e) => e.stopPropagation()}>
                              <span className="text-sm hover:underline text-foreground cursor-pointer">
                                {order.contactName ?? `#${order.contactId}`}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/40 text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <SiShopify className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{order.shopName ?? order.storeUrl}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">
                          {customer ?? <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {order.line_items.length} item{order.line_items.length !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell><FinancialBadge status={order.financial_status} /></TableCell>
                        <TableCell><FulfillmentBadge status={order.fulfillment_status} /></TableCell>
                        <TableCell className="text-right font-medium text-sm tabular-nums">
                          {order.currency} {Number(order.total_price).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={shopifyOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`link-order-shopify-${order.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
