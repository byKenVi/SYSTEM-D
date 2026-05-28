import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Search,
  RefreshCw,
  ShoppingCart,
  CheckCircle2,
  Clock,
  TrendingUp,
  ExternalLink,
  Users,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SiShopify } from "react-icons/si";

/* ── Customer type ── */
interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  state: string;
  verified_email: boolean;
  tags: string;
  created_at: string;
  default_address?: { city: string | null; province: string | null; country: string | null };
  shopName: string | null;
  storeUrl: string;
}
interface CustomersResponse { customers: ShopifyCustomer[]; totalCount: number }

/* ── Order badge helpers (same as admin) ── */
interface ShopifyOrder {
  id: number;
  name: string;
  shopifyCreatedAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  totalPrice: string;
  currency: string;
  email: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  lineItems: { id?: number; title: string; quantity: number }[];
  shopName: string | null;
  storeUrl: string;
}
interface OrdersResponse { orders: ShopifyOrder[] }

function FinancialBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    paid:               { label: "Payé",             cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:            { label: "En attente",       cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    refunded:           { label: "Remboursé",        cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    partially_refunded: { label: "Part. remboursé",  cls: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    voided:             { label: "Annulé",           cls: "text-muted-foreground bg-muted border-border" },
    authorized:         { label: "Autorisé",         cls: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; cls: string }> = {
    fulfilled: { label: "Traité",  cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    partial:   { label: "Partiel", cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    restocked: { label: "Restocké",cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

export default function PortalBoutique({ viewAsContactId }: { viewAsContactId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  /* Products state */
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const isViewAs = !!viewAsContactId;

  /* Orders state */
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");

  /* Customers state */
  const [customerSearch, setCustomerSearch] = useState("");

  /* Data */
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products"]
      : ["/api/portal/products"],
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "orders"]
      : ["/api/portal/orders"],
    queryFn: () => {
      const url = viewAsContactId
        ? `/api/admin/view-as/${viewAsContactId}/orders`
        : "/api/portal/orders";
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
    staleTime: 60 * 1000,
  });
  const customersUrl = isViewAs
    ? `/api/admin/customers?contactId=${viewAsContactId}`
    : "/api/portal/customers";
  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: isViewAs ? ["/api/admin/customers", viewAsContactId] : ["/api/portal/customers"],
    queryFn: () => fetch(customersUrl, { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const orders: ShopifyOrder[] = ordersData?.orders ?? [];
  const customers: ShopifyCustomer[] = customersData?.customers ?? [];

  /* Products helpers */
  const filteredProducts = products
    ?.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "stock-asc") return a.inventoryQuantity - b.inventoryQuantity;
      if (sortBy === "stock-desc") return b.inventoryQuantity - a.inventoryQuantity;
      return a.name.localeCompare(b.name);
    });

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!restockProduct) return;
      await apiRequest("POST", "/api/portal/restock-requests", {
        productId: restockProduct.id,
        requestedQuantity: Number(restockQty),
        contactId: restockProduct.contactId,
        status: "Processing",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/restock-requests"] });
      setRestockProduct(null);
      setRestockQty("");
      toast({ title: "Bon de travail soumis", description: "Votre bon de travail a été créé." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la soumission du bon de travail.", variant: "destructive" });
    },
  });

  /* Orders helpers */
  const filteredOrders = useMemo(() => orders.filter((o) => {
    if (paymentFilter !== "all" && o.financialStatus !== paymentFilter) return false;
    if (fulfillmentFilter !== "all") {
      if (fulfillmentFilter === "unfulfilled" && o.fulfillmentStatus !== null) return false;
      else if (fulfillmentFilter !== "unfulfilled" && o.fulfillmentStatus !== fulfillmentFilter) return false;
    }
    if (orderSearch) {
      const q = orderSearch.toLowerCase();
      const customer = `${o.customerFirstName ?? ""} ${o.customerLastName ?? ""}`.trim();
      if (
        !o.name.toLowerCase().includes(q) &&
        !customer.toLowerCase().includes(q) &&
        !(o.email ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [orders, orderSearch, paymentFilter, fulfillmentFilter]);

  /* Customers helpers */
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    return name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  }), [customers, customerSearch]);

  const stats = useMemo(() => ({
    total: orders.length,
    paid: orders.filter((o) => o.financialStatus === "paid").length,
    pending: orders.filter((o) => !o.fulfillmentStatus).length,
    revenue: orders.reduce((sum, o) => sum + Number(o.totalPrice ?? 0), 0),
  }), [orders]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Boutique</h1>
        <p className="text-muted-foreground mt-1">Vos produits et commandes Shopify</p>
      </div>

      <Tabs defaultValue="products">
        <TabsList data-testid="tabs-boutique">
          <TabsTrigger value="products" data-testid="tab-products">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Produits
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
            Commandes
          </TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-customers">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Clients
          </TabsTrigger>
        </TabsList>

        {/* ══ PRODUITS TAB ══ */}
        <TabsContent value="products" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher des produits..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-portal-products"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px]" data-testid="select-sort-products">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nom A-Z</SelectItem>
                  <SelectItem value="stock-asc">Stock : Croissant</SelectItem>
                  <SelectItem value="stock-desc">Stock : Décroissant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {productsLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : filteredProducts && filteredProducts.length > 0 ? (
                <div className="overflow-x-auto scrollbar-hide">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Prix</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        {!isViewAs && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((product) => (
                        <TableRow
                          key={product.id}
                          data-testid={`row-portal-product-${product.id}`}
                          className="cursor-pointer"
                          onClick={() => {
                            const path = viewAsContactId
                              ? `/portal/products/${product.id}?viewAs=${viewAsContactId}`
                              : `/portal/products/${product.id}`;
                            navigate(path);
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} className="h-9 w-9 rounded-md object-cover flex-shrink-0" />
                              ) : (
                                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <span className="font-medium">{product.name}</span>
                                {product.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">{product.sku || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{product.inventoryQuantity}</TableCell>
                          {!isViewAs && (
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setRestockProduct(product); setRestockQty(""); }}
                                data-testid={`button-request-restock-${product.id}`}
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                Bon de travail
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                  <p className="text-sm text-muted-foreground mt-1">Votre administrateur importera les produits depuis votre boutique Shopify.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!restockProduct} onOpenChange={() => setRestockProduct(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Soumettre un bon de travail</DialogTitle>
              </DialogHeader>
              {restockProduct && (
                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{restockProduct.name}</p>
                      <p className="text-xs text-muted-foreground">Stock actuel : {restockProduct.inventoryQuantity}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantité</Label>
                    <Input
                      type="number"
                      min="1"
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      placeholder="Entrer la quantité"
                      data-testid="input-restock-quantity"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => restockMutation.mutate()}
                    disabled={!restockQty || Number(restockQty) < 1 || restockMutation.isPending}
                    data-testid="button-submit-restock"
                  >
                    {restockMutation.isPending ? "Envoi…" : "Soumettre le bon de travail"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══ COMMANDES TAB ══ */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          {!ordersLoading && orders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total commandes</span></div><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-muted-foreground">Payées</span></div><p className="text-2xl font-bold tabular-nums">{stats.paid}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs text-muted-foreground">Non traitées</span></div><p className="text-2xl font-bold tabular-nums">{stats.pending}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Revenus</span></div><p className="text-2xl font-bold tabular-nums">${stats.revenue.toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p></CardContent></Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Rechercher commande, acheteur…"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-8 h-9"
                    data-testid="input-search-orders"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="h-9 w-36 text-xs" data-testid="select-payment-filter"><SelectValue placeholder="Paiement" /></SelectTrigger>
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
                    <SelectTrigger className="h-9 w-36 text-xs" data-testid="select-fulfillment-filter"><SelectValue placeholder="Traitement" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="unfulfilled">Non traité</SelectItem>
                      <SelectItem value="partial">Partiel</SelectItem>
                      <SelectItem value="fulfilled">Traité</SelectItem>
                    </SelectContent>
                  </Select>
                  {(orderSearch || paymentFilter !== "all" || fulfillmentFilter !== "all") && (
                    <Badge variant="secondary" className="tabular-nums">{filteredOrders.length} résultat{filteredOrders.length !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-hide">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Commande</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Acheteur</TableHead>
                      <TableHead>Articles</TableHead>
                      <TableHead>Paiement</TableHead>
                      <TableHead>Traitement</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center">
                          <div className="flex flex-col items-center gap-2">
                            {orders.length === 0 ? (
                              <>
                                <SiShopify className="h-8 w-8 text-muted-foreground/20" />
                                <p className="text-sm font-medium text-muted-foreground">Aucune commande disponible</p>
                                <p className="text-xs text-muted-foreground/60">Les commandes de votre boutique Shopify apparaîtront ici après synchronisation</p>
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
                      filteredOrders.map((order) => {
                        const storeUrl = order.storeUrl ?? "";
                        const shopifyOrderUrl = storeUrl ? `https://${storeUrl}/admin/orders/${order.id}` : null;
                        const dateStr = order.shopifyCreatedAt
                          ? new Date(order.shopifyCreatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" })
                          : "—";
                        const customer = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.email;
                        const lineCount = Array.isArray(order.lineItems) ? order.lineItems.length : 0;
                        return (
                          <TableRow key={order.id} data-testid={`row-order-${order.id}`} className="group">
                            <TableCell className="font-medium font-mono text-sm">{order.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{dateStr}</TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate">{customer ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                            <TableCell className="text-sm text-muted-foreground tabular-nums">{lineCount} article{lineCount !== 1 ? "s" : ""}</TableCell>
                            <TableCell><FinancialBadge status={order.financialStatus} /></TableCell>
                            <TableCell><FulfillmentBadge status={order.fulfillmentStatus} /></TableCell>
                            <TableCell className="text-right font-medium text-sm tabular-nums">{order.currency} {Number(order.totalPrice ?? 0).toFixed(2)}</TableCell>
                            <TableCell>
                              {shopifyOrderUrl && (
                                <a href={shopifyOrderUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`link-order-shopify-${order.id}`}>
                                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </a>
                              )}
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
        </TabsContent>

        {/* ══ CLIENTS TAB ══ */}
        <TabsContent value="customers" className="mt-4 space-y-4">
            {!customersLoading && customers.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Users className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total clients</span></div><p className="text-2xl font-bold tabular-nums">{customers.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-muted-foreground">Email vérifié</span></div><p className="text-2xl font-bold tabular-nums">{customers.filter((c) => c.verified_email).length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Commandes totales</span></div><p className="text-2xl font-bold tabular-nums">{customers.reduce((s, c) => s + c.orders_count, 0).toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Revenus totaux</span></div><p className="text-2xl font-bold tabular-nums">${customers.reduce((s, c) => s + Number(c.total_spent), 0).toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p></CardContent></Card>
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Rechercher client, email, téléphone…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search-customers" />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-hide">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Client</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Localisation</TableHead>
                        <TableHead className="text-right">Commandes</TableHead>
                        <TableHead className="text-right">Dépensé</TableHead>
                        <TableHead>Inscrit le</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customersLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                        ))
                      ) : filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-40 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Users className="h-8 w-8 text-muted-foreground/20" />
                              <p className="text-sm font-medium text-muted-foreground">{customers.length === 0 ? "Aucun client trouvé" : "Aucun client ne correspond à votre recherche"}</p>
                              {customers.length === 0 && <p className="text-xs text-muted-foreground/60">Les clients de votre boutique Shopify apparaîtront ici</p>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredCustomers.map((c) => {
                        const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                        const location = [c.default_address?.city, c.default_address?.province, c.default_address?.country].filter(Boolean).join(", ");
                        const shopifyCustomerUrl = `https://${c.storeUrl}/admin/customers/${c.id}`;
                        const dateStr = new Date(c.created_at).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" });
                        return (
                          <TableRow key={c.id} data-testid={`row-customer-${c.id}`} className="group">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                                  {(c.first_name?.[0] ?? c.email?.[0] ?? "?").toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{fullName}</p>
                                  {c.tags && <p className="text-xs text-muted-foreground truncate max-w-[140px]">{c.tags}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5">
                                {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate max-w-[160px]">{c.email}</span></div>}
                                {c.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3 flex-shrink-0" /><span>{c.phone}</span></div>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {location ? (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate max-w-[120px]">{location}</span></div>
                              ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{c.orders_count}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{Number(c.total_spent) > 0 ? `$${Number(c.total_spent).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-muted-foreground/40">—</span>}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{dateStr}</TableCell>
                            <TableCell>
                              <a href={shopifyCustomerUrl} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`link-customer-shopify-${c.id}`}>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
}
