import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  ChevronDown,
  TrendingUp,
  Clock,
  CheckCircle2,
  Warehouse,
  Package,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

interface SystemdOrder {
  id: number;
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  paymentMethod: string | null;
  repName: string | null;
  repEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  fulfillmentStatus: string;
  stockReservationStatus: string;
  stockReservedAt: string | null;
  lineItems: { name: string; zohoItemId: string; quantity: number; unitPrice: number }[];
  createdAt: string | null;
}

function SystemdStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:      { label: "Payé",       cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:   { label: "En attente",cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    cancelled: { label: "Annulé",    cls: "text-muted-foreground bg-muted border-border" },
    expired:   { label: "Expiré",    cls: "text-muted-foreground bg-muted border-border" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

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
    paid:           { label: "Payé",            class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:        { label: "En attente",      class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    refunded:       { label: "Remboursé",       class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    partially_refunded: { label: "Part. remboursé", class: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    voided:         { label: "Annulé",          class: "text-muted-foreground bg-muted border-border" },
    authorized:     { label: "Autorisé",        class: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; class: string }> = {
    fulfilled:         { label: "Traité",       class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    partial:           { label: "Partiel",      class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    restocked:         { label: "Restocké",     class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

export default function AdminOrders() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const [sdSearch, setSdSearch] = useState("");
  const [sdExpandedId, setSdExpandedId] = useState<number | null>(null);

  const { data, isLoading, isError: ordersError, refetch: refetchOrders } = useQuery<OrdersResponse>({
    queryKey: ["/api/admin/orders"],
    queryFn: async () => {
      const response = await fetch("/api/admin/orders", { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les commandes Shopify");
      return response.json();
    },
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const { data: systemdOrders, isLoading: sdLoading, isError: systemdError, refetch: refetchSystemd } = useQuery<SystemdOrder[]>({
    queryKey: ["/api/admin/systemd-orders"],
    queryFn: async () => {
      const response = await fetch("/api/admin/systemd-orders", { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les commandes Système D");
      return response.json();
    },
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!systemdOrders?.length) return;
    const match = window.location.hash.match(/^#systemd-(\d+)$/);
    if (!match) return;
    const orderId = Number(match[1]);
    if (!systemdOrders.some((order) => order.id === orderId)) return;
    setSdExpandedId(orderId);
    window.requestAnimationFrame(() => document.getElementById(`systemd-${orderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [systemdOrders]);

  const fulfillmentMutation = useMutation({
    mutationFn: async ({ id, fulfillmentStatus }: { id: number; fulfillmentStatus: "processing" | "completed" }) => {
      const response = await apiRequest("PATCH", `/api/admin/systemd-orders/${id}/fulfillment`, { fulfillmentStatus });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/systemd-orders"] }),
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
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Commandes</h1>
        <p className="text-muted-foreground mt-1">Toutes les commandes de vos boutiques Shopify connectées</p>
      </div>

      {(ordersError || systemdError) && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Les dernières commandes chargées sont conservées. Une mise à jour a échoué.</span>
          <Button variant="outline" size="sm" onClick={() => { if (ordersError) refetchOrders(); if (systemdError) refetchSystemd(); }}>Réessayer</Button>
        </div>
      )}

      {/* Stats */}
      {!isLoading && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total commandes</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Payées</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.paid}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs text-muted-foreground">Non traitées</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Revenus</span>
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
                placeholder="Rechercher commande, client…"
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
                  <SelectItem value="all">Tous les clients</SelectItem>
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
                  <SelectItem value="all">Tous les paiements</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="authorized">Autorisé</SelectItem>
                  <SelectItem value="refunded">Remboursé</SelectItem>
                  <SelectItem value="partially_refunded">Part. remboursé</SelectItem>
                  <SelectItem value="voided">Annulé</SelectItem>
                </SelectContent>
              </Select>

              <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
                <SelectTrigger className="h-9 w-36 text-xs" data-testid="select-fulfillment-filter">
                  <SelectValue placeholder="Fulfillment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="unfulfilled">Non traité</SelectItem>
                  <SelectItem value="partial">Partiel</SelectItem>
                  <SelectItem value="fulfilled">Traité</SelectItem>
                </SelectContent>
              </Select>

              {(search || paymentFilter !== "all" || fulfillmentFilter !== "all" || clientFilter !== "all") && (
                <Badge variant="secondary" className="tabular-nums">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
           <div className="responsive-table">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Commande</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Acheteur</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Traitement</TableHead>
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
                            <p className="text-sm font-medium text-muted-foreground">Aucune boutique Shopify connectée</p>
                            <p className="text-xs text-muted-foreground/60">Connectez une boutique Shopify dans les Paramètres pour voir les commandes</p>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="h-7 w-7 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Aucune commande ne correspond à vos filtres</p>
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
                      <TableRow key={`${order.storeUrl}-${order.id}`} data-testid={`row-order-${order.id}`} className="group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/admin/orders/${order.id}?store=${encodeURIComponent(order.storeUrl)}${order.contactId ? `&contactId=${order.contactId}` : ""}&returnTo=/admin/orders`)}>
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
                          {order.line_items.length} article{order.line_items.length !== 1 ? "s" : ""}
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

      {/* ══ Commandes Boutique Système D ══ */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Warehouse className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Commandes Système D</h2>
            <p className="text-sm text-muted-foreground">Achats depuis la boutique Produits Système D</p>
          </div>
          {systemdOrders && systemdOrders.length > 0 && (
            <Badge variant="secondary" className="ml-auto tabular-nums font-bold">
              {systemdOrders.length}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Rechercher client, produit…"
                  value={sdSearch}
                  onChange={(e) => setSdSearch(e.target.value)}
                  className="pl-8 h-9"
                  data-testid="input-search-systemd-orders"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
             <div className="responsive-table">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produits</TableHead>
                    <TableHead>Rep débité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Traitement / Stock</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sdLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : !systemdOrders || systemdOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Warehouse className="h-8 w-8 text-muted-foreground/20" />
                          <p className="text-sm font-medium text-muted-foreground">Aucune commande Système D</p>
                          <p className="text-xs text-muted-foreground/60">Les achats depuis la boutique Produits Système D apparaîtront ici</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const q = sdSearch.toLowerCase();
                      const sdFiltered = systemdOrders.filter((o) => {
                        if (!q) return true;
                        const clientName = (o.contactName ?? o.companyName ?? "").toLowerCase();
                        const products = Array.isArray(o.lineItems) ? o.lineItems.map((l: any) => l.name ?? "").join(" ").toLowerCase() : "";
                        const rep = `${o.repName ?? ""} ${o.repEmail ?? ""}`.toLowerCase();
                        return clientName.includes(q) || products.includes(q) || rep.includes(q);
                      });
                      return sdFiltered.map((order) => {
                        const isExpanded = sdExpandedId === order.id;
                        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
                        const totalQty = lineItems.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);
                        return (
                          <Fragment key={order.id}>
                            <TableRow
                              id={`systemd-${order.id}`}
                              className="cursor-pointer hover:bg-muted/50 transition-colors group"
                              onClick={() => setSdExpandedId(isExpanded ? null : order.id)}
                              data-testid={`row-systemd-order-${order.id}`}
                            >
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-foreground">{order.contactName ?? `Contact #${order.contactId}`}</span>
                                  {order.companyName && <span className="text-[10px] text-muted-foreground">{order.companyName}</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono text-xs border-dashed">{totalQty} article{totalQty !== 1 ? "s" : ""}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{order.repName || order.repEmail || "—"}</span>
                                  {order.repName && order.repEmail && <span className="text-[10px] text-muted-foreground">{order.repEmail}</span>}
                                </div>
                              </TableCell>
                              <TableCell><SystemdStatusBadge status={order.status} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {order.stockReservationStatus === "reserved" ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">Stock réservé</Badge>
                                  ) : order.stockReservationStatus === "stock_to_reserve" ? (
                                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300">Stock à réserver</Badge>
                                  ) : (
                                    <Badge variant="outline">Réservation en attente</Badge>
                                  )}
                                  {order.fulfillmentStatus === "to_process" && <Badge variant="secondary">À traiter</Badge>}
                                  {order.fulfillmentStatus === "processing" && <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300">En cours</Badge>}
                                  {order.fulfillmentStatus === "completed" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">Traitée</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-bold text-sm tabular-nums font-mono">
                                {(order.amount / 100).toLocaleString("fr-CA", { style: "currency", currency: order.currency.toUpperCase() })}
                              </TableCell>
                              <TableCell>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-all ${isExpanded ? "rotate-180 opacity-100" : "opacity-50 group-hover:opacity-100"}`} />
                              </TableCell>
                            </TableRow>
                            {isExpanded && lineItems.length > 0 && (
                              <TableRow key={`${order.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={8} className="py-3 px-6">
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Détail commande</p>
                                    {lineItems.map((item: any, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                                        <div className="flex items-center gap-2">
                                          <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                                          <span className="text-sm font-medium">{item.name}</span>
                                          {item.sku && <Badge variant="outline" className="font-mono text-[10px] border-dashed">{item.sku}</Badge>}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                          <span className="text-muted-foreground">×{item.quantity}</span>
                                          <span className="font-mono font-bold">{item.unitPrice?.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {order.stripeCheckoutSessionId && (
                                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-2">Réf. paiement: {order.stripeCheckoutSessionId}</p>
                                    )}
                                    {order.status === "paid" && order.fulfillmentStatus !== "completed" && (
                                      <div className="flex justify-end pt-3">
                                        <Button
                                          size="sm"
                                          disabled={fulfillmentMutation.isPending}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            fulfillmentMutation.mutate({
                                              id: order.id,
                                              fulfillmentStatus: order.fulfillmentStatus === "processing" ? "completed" : "processing",
                                            });
                                          }}
                                          data-testid={`button-process-systemd-order-${order.id}`}
                                        >
                                          {order.fulfillmentStatus === "processing" ? "Marquer comme traitée" : "Commencer le traitement"}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      });
                    })()
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
