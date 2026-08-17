import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product, Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Search,
  Upload,
  Users,
  ShoppingBag,
  ChevronDown,
  Trash2,
  LayoutGrid,
  LayoutList,
  Layers,
  ShoppingCart,
  ExternalLink,
  TrendingUp,
  Clock,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  RefreshCw,
  Link2,
  Warehouse,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  shopName: string | null;
  storeUrl: string;
  integrationId: number;
}
interface CustomersResponse { customers: ShopifyCustomer[]; totalCount: number }

/* ── Orders helpers ── */
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
  integrationId: number;
}
interface OrdersResponse {
  orders: ShopifyOrder[];
  totalCount: number;
}

function money(amount: number | string, currency = "CAD") {
  return Number(amount).toLocaleString("fr-CA", { style: "currency", currency });
}

interface SystemdOrder {
  id: number;
  contactId: number;
  contactName: string | null;
  companyName: string | null;
  repName: string | null;
  repEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  fulfillmentStatus: string;
  stockReservationStatus: string;
  createdAt: string | null;
  lineItems: { name?: string; sku?: string; quantity?: number; unitPrice?: number }[];
}

function FinancialBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const map: Record<string, { label: string; class: string }> = {
    paid:               { label: "Payé",               class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    pending:            { label: "En attente",         class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    refunded:           { label: "Remboursé",          class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    partially_refunded: { label: "Part. remboursé",    class: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
    voided:             { label: "Annulé",             class: "text-muted-foreground bg-muted border-border" },
    authorized:         { label: "Autorisé",           class: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/30 dark:border-violet-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>{cfg.label}</span>;
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; class: string }> = {
    fulfilled: { label: "Traité",   class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" },
    partial:   { label: "Partiel",  class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" },
    restocked: { label: "Restocké", class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800" },
  };
  const cfg = map[status] ?? { label: status, class: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.class}`}>{cfg.label}</span>;
}

/* ── Main component ── */
export default function AdminBoutique() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const readTabFromUrl = () => {
    const requested = new URLSearchParams(window.location.search).get("tab") ?? "products";
    return ["products", "systemd", "orders", "customers"].includes(requested) ? requested : "products";
  };
  const [activeTab, setActiveTabState] = useState(readTabFromUrl);
  useEffect(() => {
    const syncTabFromHistory = () => setActiveTabState(readTabFromUrl());
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    navigate(`/admin/boutique?tab=${tab}`);
  };

  /* Products state */
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [groupBy, setGroupBy] = useState<boolean>(() => localStorage.getItem("products_groupBy") !== "false");

  /* Orders state */
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [orderClientFilter, setOrderClientFilter] = useState("all");

  /* Customers state */
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerClientFilter, setCustomerClientFilter] = useState("all");

  /* SystemD products state */
  const [systemdSearch, setSystemdSearch] = useState("");

  /* Data */
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  interface SystemdItem { zohoItemId: string; name: string; sku: string | null; description: string | null; imageUrl: string | null; price: number; stock: number; }
  const systemdForceRef = useRef(false);
  const { data: systemdProducts, isLoading: systemdLoading, refetch: refetchSystemdBase } = useQuery<SystemdItem[]>({
    queryKey: ["/api/portal/systemd-products"],
    queryFn: async () => {
      const r = await fetch(`/api/portal/systemd-products${systemdForceRef.current ? "?force=true" : ""}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 90_000,
  });
  const refetchSystemd = async () => {
    systemdForceRef.current = true;
    try { await refetchSystemdBase(); } finally { systemdForceRef.current = false; }
  };
  const filteredSystemd = useMemo(() => {
    if (!systemdProducts) return [];
    const q = systemdSearch.toLowerCase();
    if (!q) return systemdProducts;
    return systemdProducts.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [systemdProducts, systemdSearch]);
  const { data: ordersData, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery<OrdersResponse>({
    queryKey: ["/api/admin/orders"],
    queryFn: async () => {
      const response = await fetch("/api/admin/orders", { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les commandes Shopify");
      return response.json();
    },
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const { data: customersData, isLoading: customersLoading, isError: customersError, refetch: refetchCustomers } = useQuery<CustomersResponse>({
    queryKey: ["/api/admin/customers"],
    queryFn: async () => {
      const response = await fetch("/api/admin/customers", { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les clients Shopify");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const { data: systemdOrdersData, isLoading: systemdOrdersLoading, isError: systemdOrdersError, refetch: refetchSystemdOrders } = useQuery<SystemdOrder[]>({
    queryKey: ["/api/admin/systemd-orders"],
    queryFn: async () => {
      const response = await fetch("/api/admin/systemd-orders", { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les commandes Système D");
      return response.json();
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const orders = ordersData?.orders ?? [];
  const customers = customersData?.customers ?? [];
  const systemdOrders = systemdOrdersData ?? [];
  const systemdToProcess = systemdOrders.filter((order) => order.status === "paid" && order.fulfillmentStatus !== "completed");

  const systemdFulfillmentMutation = useMutation({
    mutationFn: async ({ id, fulfillmentStatus }: { id: number; fulfillmentStatus: "processing" | "completed" }) => {
      const response = await apiRequest("PATCH", `/api/admin/systemd-orders/${id}/fulfillment`, { fulfillmentStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/systemd-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/kpis"] });
      // UI updates via query invalidation above — no intrusive toast needed
    },
    onError: (error: Error) => toast({ title: "Mise à jour impossible", description: error.message, variant: "destructive" }),
  });

  const syncMapiRepsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/mapi/reps/sync");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      toast({ title: "Synchronisation terminée", description: `${data.synced ?? 0} rep(s) Mapei synchronisé(s).` });
    },
    onError: (error: any) => toast({ title: "Erreur Shopify", description: error.message, variant: "destructive" }),
  });

  /* Products mutations */
  const pushToZohoMutation = useMutation({
    mutationFn: async (productIds: number[]) => { await apiRequest("POST", "/api/products/push-to-zoho", { productIds }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/products"] }); setSelected(new Set()); toast({ title: "Succès", description: "Produits envoyés vers Zoho Inventory." }); },
    onError: () => toast({ title: "Erreur", description: "Échec de l'envoi des produits.", variant: "destructive" }),
  });

  const [relinkProduct, setRelinkProduct] = useState<Product | null>(null);
  const [relinkZohoId, setRelinkZohoId] = useState("");

  const relinkMutation = useMutation({
    mutationFn: async ({ id, zohoItemId }: { id: number; zohoItemId: string }) => {
      const res = await apiRequest("PUT", `/api/products/${id}/zoho-link`, { zohoItemId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setRelinkProduct(null);
      setRelinkZohoId("");
      toast({ title: "Lien Zoho restauré", description: "Le produit est à nouveau lié à Zoho Inventory." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de mettre à jour le lien Zoho.", variant: "destructive" }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => { await apiRequest("DELETE", `/api/products/${productId}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/products"] }); setDeleteTarget(null); toast({ title: "Supprimé", description: "Le produit a été supprimé." }); },
    onError: () => toast({ title: "Erreur", description: "Échec de la suppression du produit.", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => { await apiRequest("DELETE", "/api/products", { ids }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/products"] }); setSelected(new Set()); setBulkDeleteConfirm(false); toast({ title: "Supprimé", description: `${selected.size} produit${selected.size !== 1 ? "s" : ""} supprimé${selected.size !== 1 ? "s" : ""}.` }); },
    onError: () => toast({ title: "Erreur", description: "Échec de la suppression des produits.", variant: "destructive" }),
  });

  /* Products helpers */
  const toggleGroupBy = () => { setGroupBy((prev) => { const next = !prev; localStorage.setItem("products_groupBy", String(next)); return next; }); };
  const toggleCollapse = (contactId: number) => { setCollapsedGroups((prev) => { const next = new Set(prev); if (next.has(contactId)) next.delete(contactId); else next.add(contactId); return next; }); };
  const handleDeleteClick = (product: Product) => { if (product.shopifyStoreUrl) setDeleteTarget(product); else deleteProductMutation.mutate(product.id); };
  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);

  const filtered = products?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.barcode || "").toLowerCase().includes(search.toLowerCase());
    const matchesClient = clientFilter === "all" || p.contactId === Number(clientFilter);
    return matchesSearch && matchesClient;
  });

  const groupedByClient = (() => {
    if (!filtered) return [];
    const groups = new Map<number, Product[]>();
    for (const p of filtered) { if (!groups.has(p.contactId)) groups.set(p.contactId, []); groups.get(p.contactId)!.push(p); }
    return Array.from(groups.entries()).map(([contactId, items]) => ({ contactId, contact: contactMap.get(contactId), products: items }));
  })();

  const toggleSelect = (id: number) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); };
  const toggleAll = () => {
    if (!filtered) return;
    const allFilteredSelected = filtered.every((p) => selected.has(p.id));
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((p) => p.id)));
  };

  /* Orders helpers */
  const orderClients = useMemo(() => {
    const seen = new Map<number, string>();
    for (const o of orders) { if (o.contactId && !seen.has(o.contactId)) seen.set(o.contactId, o.contactName ?? `Contact #${o.contactId}`); }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filteredOrders = useMemo(() => orders.filter((o) => {
    if (orderClientFilter !== "all" && String(o.contactId) !== orderClientFilter) return false;
    if (paymentFilter !== "all" && o.financial_status !== paymentFilter) return false;
    if (fulfillmentFilter !== "all") {
      if (fulfillmentFilter === "unfulfilled" && o.fulfillment_status !== null) return false;
      else if (fulfillmentFilter !== "unfulfilled" && o.fulfillment_status !== fulfillmentFilter) return false;
    }
    if (orderSearch) {
      const q = orderSearch.toLowerCase();
      const customer = o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : o.email ?? "";
      if (!o.name.toLowerCase().includes(q) && !customer.toLowerCase().includes(q) && !(o.contactName ?? "").toLowerCase().includes(q) && !(o.shopName ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [orders, orderSearch, paymentFilter, fulfillmentFilter, orderClientFilter]);

  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.financial_status === "paid").length;
    const fulfilled = orders.filter((o) => o.fulfillment_status === "fulfilled").length;
    const pending = orders.filter((o) => !o.fulfillment_status).length;
    const revenue = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
    return { total, paid, fulfilled, pending, revenue };
  }, [orders]);

  /* Customers helpers */
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    if (customerClientFilter !== "all" && String(c.contactId) !== customerClientFilter) return false;
    if (customerSearch) {
      const q = customerSearch.toLowerCase();
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      if (!name.toLowerCase().includes(q) && !(c.email ?? "").toLowerCase().includes(q) && !(c.phone ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [customers, customerSearch, customerClientFilter]);

  const customerClients = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of customers) { if (c.contactId && !seen.has(c.contactId)) seen.set(c.contactId, c.companyName ?? c.contactName ?? `Contact #${c.contactId}`); }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [customers]);

  /* ── Render ── */
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Boutique</h1>
        <p className="text-muted-foreground mt-1">Produits et commandes de vos boutiques Shopify connectées</p>
      </div>

      {(ordersError || customersError || systemdOrdersError) && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Les dernières données chargées sont conservées. Une mise à jour de la boutique a échoué.</span>
          <Button variant="outline" size="sm" onClick={() => { if (ordersError) refetchOrders(); if (customersError) refetchCustomers(); if (systemdOrdersError) refetchSystemdOrders(); }}>Réessayer</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide" data-testid="tabs-boutique">
          <TabsList className="w-max">
            <TabsTrigger value="products" className="whitespace-nowrap" data-testid="tab-products">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Produits Clients
              {products && <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{products.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="systemd" className="whitespace-nowrap" data-testid="tab-systemd">
              <Warehouse className="h-3.5 w-3.5 mr-1.5" />
              Produits Système D
              {systemdProducts && <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{systemdProducts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="orders" className="whitespace-nowrap" data-testid="tab-orders">
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              Commandes
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{orders.length + systemdOrders.length}</Badge>
              {systemdToProcess.length > 0 && <Badge className="ml-1 bg-amber-500 px-1.5 py-0 text-[10px] text-white hover:bg-amber-500">{systemdToProcess.length} à traiter</Badge>}
            </TabsTrigger>
            <TabsTrigger value="customers" className="whitespace-nowrap" data-testid="tab-customers">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Reps
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{customers.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ══ PRODUITS TAB ══ */}
        <TabsContent value="products" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 flex-wrap w-full sm:w-auto">
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher produit, SKU, code-barres..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-products" />
              </div>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-client-filter">
                  <SelectValue placeholder="Tous les clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  {contacts?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.companyName || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-md border bg-muted/30 p-0.5 gap-0.5">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("list")} data-testid="button-view-list"><LayoutList className="h-4 w-4" /></Button>
                <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("card")} data-testid="button-view-card"><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button variant={groupBy ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5 text-xs" onClick={toggleGroupBy} data-testid="button-toggle-groupby">
                <Layers className="h-3.5 w-3.5" />Grouper
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {filtered && filtered.length > 0 && (
                <Button variant="outline" size="sm" onClick={toggleAll} data-testid="button-select-all-global">
                  <div className={`h-4 w-4 mr-1.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${filtered.every((p) => selected.has(p.id)) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                    {filtered.every((p) => selected.has(p.id)) && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6 9 17l-5-5"/></svg>}
                  </div>
                  {filtered.every((p) => selected.has(p.id)) ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
              )}
              {selected.size > 0 && (
                <>
                  <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirm(true)} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete">
                    <Trash2 className="h-4 w-4 mr-1.5" />Supprimer {selected.size}
                  </Button>
                  <Button size="sm" onClick={() => pushToZohoMutation.mutate(Array.from(selected))} disabled={pushToZohoMutation.isPending} data-testid="button-bulk-push-zoho">
                    <Upload className="h-4 w-4 mr-1.5" />Envoyer {selected.size} vers Zoho
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* List view */}
          {viewMode === "list" && (
            <Card>
              <CardContent className="p-0">
                {productsLoading ? (
                  <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : !groupBy && filtered && filtered.length > 0 ? (
                  <div className="overflow-x-auto scrollbar-hide">
                    <Table className="min-w-[800px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"><Checkbox checked={filtered.every((p) => selected.has(p.id))} onCheckedChange={toggleAll} /></TableHead>
                          <TableHead>Produit</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Prix</TableHead>
                          <TableHead className="text-right">Stock Shopify</TableHead>
                          <TableHead className="text-right">Stock Zoho</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((product) => (
                          <TableRow key={product.id} data-testid={`row-product-${product.id}`} className="cursor-pointer" onClick={() => { if (product.id) navigate(`/admin/products/${product.id}`); }}>
                            <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} data-testid={`checkbox-product-${product.id}`} /></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <img src={product.imageUrl || ""} alt={product.name} className="h-9 w-9 rounded-md object-cover flex-shrink-0" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                                <div className="h-9 w-9 rounded-md bg-muted items-center justify-center flex-shrink-0" style={{ display: product.imageUrl ? "none" : "flex" }}><Package className="h-4 w-4 text-muted-foreground" /></div>
                                <span className="font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-sm">{product.sku || "—"}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {product.shopifyStoreUrl ? (
                                <a href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}/products/${product.shopifyHandle || ""}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 w-fit" data-testid={`link-shopify-store-${product.id}`}>
                                  <ShoppingBag className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  <span className="text-xs text-green-700 dark:text-green-400 hover:underline font-medium">Shopify</span>
                                </a>
                              ) : <span className="text-xs text-muted-foreground">Manuel</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{product.inventoryQuantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {product.pushedToZoho && product.zohoInventoryQuantity != null ? <span className="text-primary">{product.zohoInventoryQuantity}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {!product.pushedToZoho && <Button size="sm" variant="outline" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-push-zoho-${product.id}`}><Upload className="h-3.5 w-3.5 mr-1" />Pousser</Button>}
                                {product.pushedToZoho && product.zohoItemId && !product.zohoItemId.startsWith("pending-") && <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-primary" title="Mettre à jour le client Zoho" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-refresh-zoho-${product.id}`}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                                {product.pushedToZoho && product.zohoItemId?.startsWith("pending-") && <Button size="sm" variant="ghost" className="text-amber-500 hover:text-amber-600" title="Re-lier à Zoho Inventory" onClick={() => { setRelinkProduct(product); setRelinkZohoId(""); }} data-testid={`button-relink-zoho-${product.id}`}><Link2 className="h-3.5 w-3.5" /></Button>}
                                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteClick(product)} disabled={deleteProductMutation.isPending} data-testid={`button-delete-product-${product.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : groupedByClient.length > 0 ? (
                  <div className="divide-y">
                    {groupedByClient.map((group) => {
                      const clientName = group.contact?.companyName || group.contact?.name || group.contact?.email || "Client inconnu";
                      const isCollapsed = collapsedGroups.has(group.contactId);
                      return (
                        <div key={group.contactId} data-testid={`group-client-${group.contactId}`}>
                          <button type="button" className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-b w-full text-left hover:bg-muted/50 transition-colors" onClick={() => toggleCollapse(group.contactId)} data-testid={`button-toggle-group-${group.contactId}`}>
                            <div className="flex items-center gap-2.5">
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Users className="h-3.5 w-3.5 text-primary" /></div>
                              <span className="font-semibold text-sm" data-testid={`text-group-client-name-${group.contactId}`}>{clientName}</span>
                              <Badge variant="secondary" className="text-xs font-normal">{group.products.length} {group.products.length === 1 ? "produit" : "produits"}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{group.products.reduce((sum, p) => sum + p.inventoryQuantity, 0).toLocaleString()} en stock</span>
                            </div>
                          </button>
                          {!isCollapsed && (
                            <div className="overflow-x-auto scrollbar-hide">
                              <Table className="min-w-[800px] w-full">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-10">
                                      <Checkbox checked={group.products.every((p) => selected.has(p.id))} onCheckedChange={() => { const allSelected = group.products.every((p) => selected.has(p.id)); const next = new Set(selected); group.products.forEach((p) => { if (allSelected) next.delete(p.id); else next.add(p.id); }); setSelected(next); }} data-testid={`checkbox-select-all-${group.contactId}`} />
                                    </TableHead>
                                    <TableHead>Produit</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="text-right">Prix</TableHead>
                                    <TableHead className="text-right">Stock Shopify</TableHead>
                                    <TableHead className="text-right">Stock Zoho</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.products.map((product) => (
                                    <TableRow key={product.id} data-testid={`row-product-${product.id}`} className="cursor-pointer" onClick={() => { if (product.id) navigate(`/admin/products/${product.id}`); }}>
                                      <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} data-testid={`checkbox-product-${product.id}`} /></TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-3">
                                          <img src={product.imageUrl || ""} alt={product.name} className="h-9 w-9 rounded-md object-cover flex-shrink-0" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                                          <div className="h-9 w-9 rounded-md bg-muted items-center justify-center flex-shrink-0" style={{ display: product.imageUrl ? "none" : "flex" }}><Package className="h-4 w-4 text-muted-foreground" /></div>
                                          <span className="font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-muted-foreground font-mono text-sm">{product.sku || "—"}</TableCell>
                                      <TableCell onClick={(e) => e.stopPropagation()}>
                                        {product.shopifyStoreUrl ? (
                                          <a href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}/products/${product.shopifyHandle || ""}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 w-fit" data-testid={`link-shopify-store-${product.id}`}>
                                            <ShoppingBag className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                            <span className="text-xs text-green-700 dark:text-green-400 hover:underline font-medium">Shopify</span>
                                          </a>
                                        ) : <span className="text-xs text-muted-foreground">Manuel</span>}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{product.inventoryQuantity}</TableCell>
                                      <TableCell className="text-right font-mono text-sm" data-testid={`text-zoho-stock-${product.id}`}>
                                        {product.pushedToZoho && product.zohoInventoryQuantity != null ? <span className="text-primary">{product.zohoInventoryQuantity}</span> : <span className="text-muted-foreground">—</span>}
                                      </TableCell>
                                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1.5">
                                          {!product.pushedToZoho && <Button size="sm" variant="outline" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-push-zoho-${product.id}`}><Upload className="h-3.5 w-3.5 mr-1" />Pousser</Button>}
                                          {product.pushedToZoho && product.zohoItemId && !product.zohoItemId.startsWith("pending-") && <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-primary" title="Mettre à jour le client Zoho" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-refresh-zoho-${product.id}`}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                                          {product.pushedToZoho && product.zohoItemId?.startsWith("pending-") && <Button size="sm" variant="ghost" className="text-amber-500 hover:text-amber-600" title="Re-lier à Zoho Inventory" onClick={() => { setRelinkProduct(product); setRelinkZohoId(""); }} data-testid={`button-relink-zoho-${product.id}`}><Link2 className="h-3.5 w-3.5" /></Button>}
                                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteClick(product)} disabled={deleteProductMutation.isPending} data-testid={`button-delete-product-${product.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                    <p className="text-sm text-muted-foreground mt-1">Importez des produits depuis les boutiques Shopify des clients dans les Paramètres.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Card view */}
          {viewMode === "card" && (
            <div>
              {productsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}</div>
              ) : !groupBy && filtered && filtered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map((product) => {
                    const isSelected = selected.has(product.id);
                    return (
                      <div key={product.id} data-testid={`card-product-${product.id}`} className={`relative rounded-xl border bg-card cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}`} onClick={() => { if (product.id) navigate(`/admin/products/${product.id}`); }}>
                        <div className="absolute top-2 left-2 z-10" onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}>
                          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center bg-background transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary"}`}>
                            {isSelected && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-primary-foreground"><path d="M20 6 9 17l-5-5"/></svg>}
                          </div>
                        </div>
                        {product.pushedToZoho && <div className="absolute top-2 right-2 z-10"><span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[9px] font-semibold px-1.5 py-0.5">Zoho</span></div>}
                        <div className="aspect-square w-full overflow-hidden rounded-t-xl bg-muted flex items-center justify-center">
                          <img src={product.imageUrl || ""} alt={product.name} className="w-full h-full object-cover" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                          <div className="w-full h-full items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}><Package className="h-10 w-10 text-muted-foreground/30" /></div>
                        </div>
                        <div className="p-3 space-y-1.5">
                          <p className="text-sm font-semibold leading-tight line-clamp-2" data-testid={`text-card-product-name-${product.id}`}>{product.name}</p>
                          {product.sku && <p className="text-[11px] font-mono text-muted-foreground truncate">{product.sku}</p>}
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-xs font-medium">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</span>
                            <span className="text-xs font-semibold text-muted-foreground">{product.inventoryQuantity} unités</span>
                          </div>
                          {product.pushedToZoho && product.zohoInventoryQuantity != null && <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium">Zoho : {product.zohoInventoryQuantity} unités</p>}
                        </div>
                        <div className="px-3 pb-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {!product.pushedToZoho && <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-card-push-zoho-${product.id}`}><Upload className="h-3 w-3 mr-1" />Pousser</Button>}
                          {product.pushedToZoho && product.zohoItemId && !product.zohoItemId.startsWith("pending-") && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" title="Mettre à jour le client Zoho" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-card-refresh-zoho-${product.id}`}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                          {product.pushedToZoho && product.zohoItemId?.startsWith("pending-") && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600" title="Re-lier à Zoho Inventory" onClick={() => { setRelinkProduct(product); setRelinkZohoId(""); }} data-testid={`button-card-relink-zoho-${product.id}`}><Link2 className="h-3.5 w-3.5" /></Button>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive ml-auto" onClick={() => handleDeleteClick(product)} disabled={deleteProductMutation.isPending} data-testid={`button-card-delete-${product.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : groupedByClient.length > 0 ? (
                <div className="space-y-6">
                  {groupedByClient.map((group) => {
                    const clientName = group.contact?.companyName || group.contact?.name || group.contact?.email || "Client inconnu";
                    const isCollapsed = collapsedGroups.has(group.contactId);
                    return (
                      <div key={group.contactId} data-testid={`group-client-card-${group.contactId}`}>
                        <button type="button" className="flex items-center gap-2.5 mb-3 w-full text-left" onClick={() => toggleCollapse(group.contactId)} data-testid={`button-toggle-group-card-${group.contactId}`}>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Users className="h-3 w-3 text-primary" /></div>
                          <span className="font-semibold text-sm">{clientName}</span>
                          <Badge variant="secondary" className="text-xs font-normal">{group.products.length}</Badge>
                        </button>
                        {!isCollapsed && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {group.products.map((product) => {
                              const isSelected = selected.has(product.id);
                              return (
                                <div key={product.id} data-testid={`card-product-${product.id}`} className={`relative rounded-xl border bg-card cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}`} onClick={() => { if (product.id) navigate(`/admin/products/${product.id}`); }}>
                                  <div className="absolute top-2 left-2 z-10" onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}>
                                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center bg-background transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary"}`}>
                                      {isSelected && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-primary-foreground"><path d="M20 6 9 17l-5-5"/></svg>}
                                    </div>
                                  </div>
                                  {product.pushedToZoho && <div className="absolute top-2 right-2 z-10"><span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[9px] font-semibold px-1.5 py-0.5">Zoho</span></div>}
                                  <div className="aspect-square w-full overflow-hidden rounded-t-xl bg-muted flex items-center justify-center">
                                    <img src={product.imageUrl || ""} alt={product.name} className="w-full h-full object-cover" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                                    <div className="w-full h-full items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}><Package className="h-10 w-10 text-muted-foreground/30" /></div>
                                  </div>
                                  <div className="p-3 space-y-1.5">
                                    <p className="text-sm font-semibold leading-tight line-clamp-2" data-testid={`text-card-product-name-${product.id}`}>{product.name}</p>
                                    {product.sku && <p className="text-[11px] font-mono text-muted-foreground truncate">{product.sku}</p>}
                                    <div className="flex items-center justify-between pt-0.5">
                                      <span className="text-xs font-medium">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</span>
                                      <span className="text-xs font-semibold text-muted-foreground">{product.inventoryQuantity} unités</span>
                                    </div>
                                    {product.pushedToZoho && product.zohoInventoryQuantity != null && <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium">Zoho : {product.zohoInventoryQuantity} unités</p>}
                                  </div>
                                  <div className="px-3 pb-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    {!product.pushedToZoho && <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-card-push-zoho-${product.id}`}><Upload className="h-3 w-3 mr-1" />Pousser</Button>}
                                    {product.pushedToZoho && product.zohoItemId && !product.zohoItemId.startsWith("pending-") && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" title="Mettre à jour le client Zoho" onClick={() => pushToZohoMutation.mutate([product.id])} disabled={pushToZohoMutation.isPending} data-testid={`button-card-refresh-zoho-${product.id}`}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                                    {product.pushedToZoho && product.zohoItemId?.startsWith("pending-") && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600" title="Re-lier à Zoho Inventory" onClick={() => { setRelinkProduct(product); setRelinkZohoId(""); }} data-testid={`button-card-relink-zoho-${product.id}`}><Link2 className="h-3.5 w-3.5" /></Button>}
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive ml-auto" onClick={() => handleDeleteClick(product)} disabled={deleteProductMutation.isPending} data-testid={`button-card-delete-${product.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border rounded-xl bg-card">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                  <p className="text-sm text-muted-foreground mt-1">Importez des produits depuis les boutiques Shopify des clients dans les Paramètres.</p>
                </div>
              )}
            </div>
          )}

          {/* Products dialogs */}
          <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer {selected.size} produit{selected.size !== 1 ? "s" : ""} ?</DialogTitle>
                <DialogDescription>Cela supprimera définitivement {selected.size} produit{selected.size !== 1 ? "s" : ""} sélectionné{selected.size !== 1 ? "s" : ""} de votre inventaire. Les produits importés depuis Shopify pourront être réimportés lors de la prochaine synchronisation.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)} data-testid="button-cancel-bulk-delete">Annuler</Button>
                <Button variant="destructive" onClick={() => bulkDeleteMutation.mutate(Array.from(selected))} disabled={bulkDeleteMutation.isPending} data-testid="button-confirm-bulk-delete">Supprimer {selected.size} produit{selected.size !== 1 ? "s" : ""}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!relinkProduct} onOpenChange={(open) => { if (!open) { setRelinkProduct(null); setRelinkZohoId(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restaurer le lien Zoho</DialogTitle>
                <DialogDescription>Entrez l'identifiant Zoho Inventory (item_id) pour re-lier « {relinkProduct?.name} ».</DialogDescription>
              </DialogHeader>
              <Input placeholder="ex: 7272576000000419002" value={relinkZohoId} onChange={(e) => setRelinkZohoId(e.target.value)} data-testid="input-relink-zoho-id" />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRelinkProduct(null); setRelinkZohoId(""); }}>Annuler</Button>
                <Button onClick={() => relinkProduct && relinkZohoId.trim() && relinkMutation.mutate({ id: relinkProduct.id, zohoItemId: relinkZohoId.trim() })} disabled={relinkMutation.isPending || !relinkZohoId.trim()} data-testid="button-confirm-relink">Restaurer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer le produit Shopify ?</DialogTitle>
                <DialogDescription>« {deleteTarget?.name} » a été importé depuis Shopify ({deleteTarget?.shopifyStoreUrl?.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "")}). Le supprimer ici ne le supprimera pas de Shopify, mais il n'apparaîtra plus dans votre inventaire.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">Annuler</Button>
                <Button variant="destructive" onClick={() => deleteTarget && deleteProductMutation.mutate(deleteTarget.id)} disabled={deleteProductMutation.isPending} data-testid="button-confirm-delete-product">Supprimer le produit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══ PRODUITS SYSTEMD TAB ══ */}
        <TabsContent value="systemd" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, SKU..."
                value={systemdSearch}
                onChange={(e) => setSystemdSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-systemd"
              />
            </div>
            {systemdProducts && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {filteredSystemd.length} produit{filteredSystemd.length !== 1 ? "s" : ""}
              </span>
            )}
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => refetchSystemd()} disabled={systemdLoading} data-testid="button-refresh-systemd" title="Actualiser les produits">
              <RefreshCw className={`mr-2 h-4 w-4 ${systemdLoading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>

          {systemdLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : filteredSystemd.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                  <Warehouse className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-2">Catalogue vide</h3>
                <p className="text-muted-foreground max-w-sm">
                  {systemdSearch
                    ? "Aucun produit ne correspond à votre recherche."
                    : "Aucun produit Système D disponible. Vérifiez que Zoho Inventory est connecté et que les articles destinés au catalogue sont bien synchronisés."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSystemd.map((product) => {
                const inStock = product.stock > 0;
                return (
                  <Card
                    key={product.zohoItemId}
                    className="border-border/50 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    data-testid={`card-systemd-product-${product.zohoItemId}`}
                    onClick={() => navigate(`/admin/boutique/systemd/${product.zohoItemId}?returnTo=${encodeURIComponent("/admin/boutique?tab=systemd")}`)}
                  >
                    <div className="aspect-video bg-muted/30 border-b flex items-center justify-center overflow-hidden">
                      <img
                        src={product.imageUrl || ""}
                        alt={product.name}
                        className="w-full h-full object-contain p-3"
                        style={{ display: product.imageUrl ? undefined : "none" }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                        }}
                      />
                      <span className="w-full h-full items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}>
                        <Package className="h-16 w-16 text-muted-foreground/30" />
                      </span>
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-bold text-sm text-foreground line-clamp-2 leading-tight">{product.name}</h3>
                      {product.sku && (
                        <Badge variant="outline" className="font-mono text-[10px] border-dashed">{product.sku}</Badge>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono font-bold text-base">{product.price.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-bold tabular-nums ${
                            inStock
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                          }`}
                        >
                          {inStock ? `${product.stock} en stock` : "Épuisé"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

        </TabsContent>

        {/* ══ COMMANDES TAB ══ */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><h2 className="font-bold">Commandes Système D à traiter</h2><Badge className="bg-amber-500 text-white hover:bg-amber-500">{systemdToProcess.length}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">Commandes payées dans le portail, avec crédit rep et réservation de stock. Aucun projet Zoho n’est créé pour ces achats.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/orders#systemd")} data-testid="button-open-systemd-orders">Vue complète</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {systemdOrdersLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
              ) : systemdToProcess.length === 0 ? (
                <div className="px-5 pb-5 text-sm text-muted-foreground">Aucune commande Système D en attente. Les nouveaux achats payés apparaîtront directement ici.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Produits</TableHead><TableHead>Rep débité</TableHead><TableHead>Paiement / stock</TableHead><TableHead className="text-right">Montant</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {systemdToProcess.map((order) => {
                        const items = Array.isArray(order.lineItems) ? order.lineItems : [];
                        const nextStatus = order.fulfillmentStatus === "processing" ? "completed" : "processing";
                        return (
                          <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/admin/orders#systemd-${order.id}`)} data-testid={`row-boutique-systemd-order-${order.id}`}>
                            <TableCell className="whitespace-nowrap text-sm">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("fr-CA") : "—"}</TableCell>
                            <TableCell><p className="font-semibold">{order.contactName || `Contact #${order.contactId}`}</p><p className="text-xs text-muted-foreground">{order.companyName}</p></TableCell>
                            <TableCell><p className="max-w-[240px] truncate text-sm">{items.map((item) => `${item.name || "Produit"} ×${item.quantity || 1}`).join(", ") || "—"}</p></TableCell>
                            <TableCell><p className="text-sm font-medium">{order.repName || order.repEmail || "—"}</p>{order.repName && order.repEmail && <p className="text-xs text-muted-foreground">{order.repEmail}</p>}</TableCell>
                            <TableCell><div className="flex flex-wrap gap-1"><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Payé</Badge><Badge variant="outline">{order.stockReservationStatus === "reserved" ? "Stock réservé" : "Stock à vérifier"}</Badge><Badge variant="secondary">{order.fulfillmentStatus === "processing" ? "En traitement" : "À traiter"}</Badge></div></TableCell>
                            <TableCell className="text-right font-mono font-bold">{money(order.amount / 100, order.currency.toUpperCase())}</TableCell>
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}><Button size="sm" disabled={systemdFulfillmentMutation.isPending} onClick={() => systemdFulfillmentMutation.mutate({ id: order.id, fulfillmentStatus: nextStatus })}>{nextStatus === "processing" ? "Marquer en traitement" : "Marquer traitée"}</Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Commandes Shopify importées</h2>
            <p className="mt-1 text-xs text-muted-foreground">Historique en lecture seule synchronisé depuis les boutiques connectées.</p>
          </div>
          {!ordersLoading && orders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total commandes</span></div><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-muted-foreground">Payées</span></div><p className="text-2xl font-bold tabular-nums">{stats.paid}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs text-muted-foreground">Non traitées</span></div><p className="text-2xl font-bold tabular-nums">{stats.pending}</p></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Revenus</span></div><p className="text-2xl font-bold tabular-nums">${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p></CardContent></Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Rechercher commande, client…" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search-orders" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={orderClientFilter} onValueChange={setOrderClientFilter}>
                    <SelectTrigger className="h-9 w-40 text-xs" data-testid="select-order-client-filter"><SelectValue placeholder="Tous les clients" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les clients</SelectItem>
                      {orderClients.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                  {(orderSearch || paymentFilter !== "all" || fulfillmentFilter !== "all" || orderClientFilter !== "all") && (
                    <Badge variant="secondary" className="tabular-nums">{filteredOrders.length} résultat{filteredOrders.length !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {ordersLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-40 text-center">
                          <div className="flex flex-col items-center gap-2">
                            {orders.length === 0 ? (
                              <>
                                <SiShopify className="h-8 w-8 text-muted-foreground/20" />
                                <p className="text-sm font-medium text-muted-foreground">Aucune commande Shopify synchronisée</p>
                                <p className="text-xs text-muted-foreground/60">Les commandes apparaîtront ici après une synchronisation. Vérifiez les intégrations dans Paramètres si nécessaire.</p>
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
                        const customer = order.customer ? `${order.customer.first_name} ${order.customer.last_name}`.trim() : order.email ?? null;
                        const shopifyOrderUrl = order.storeUrl ? `https://${order.storeUrl}/admin/orders/${order.id}` : null;
                        const detailParams = new URLSearchParams({
                          store: order.storeUrl,
                          integrationId: String(order.integrationId),
                          returnTo: `${location.split("?")[0]}?tab=orders`,
                        });
                        const detailUrl = order.id ? `/admin/orders/${order.id}?${detailParams}` : null;
                        return (
                          <TableRow key={`${order.storeUrl}-${order.id}`} data-testid={`row-order-${order.id}`} className="group cursor-pointer" onClick={() => { if (detailUrl) navigate(detailUrl); }}>
                            <TableCell className="font-medium font-mono text-sm">{order.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(order.created_at).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                            <TableCell>
                              {order.contactId ? (
                                <Link href={`/admin/contacts/${order.contactId}`} onClick={(e) => e.stopPropagation()}>
                                  <span className="text-sm hover:underline text-foreground cursor-pointer">{order.contactName ?? `#${order.contactId}`}</span>
                                </Link>
                              ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <SiShopify className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{order.shopName ?? order.storeUrl}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm max-w-[140px] truncate">{customer ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                            <TableCell className="text-sm text-muted-foreground tabular-nums">{order.line_items.length} article{order.line_items.length !== 1 ? "s" : ""}</TableCell>
                            <TableCell><FinancialBadge status={order.financial_status} /></TableCell>
                            <TableCell><FulfillmentBadge status={order.fulfillment_status} /></TableCell>
                            <TableCell className="text-right font-medium text-sm tabular-nums">{order.currency} {Number(order.total_price).toFixed(2)}</TableCell>
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
              <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Revenus totaux</span></div><p className="text-2xl font-bold tabular-nums">${customers.reduce((s, c) => s + Number(c.total_spent), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p></CardContent></Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Rechercher client, email, téléphone…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search-customers" />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => syncMapiRepsMutation.mutate()}
                    disabled={syncMapiRepsMutation.isPending}
                    data-testid="button-sync-mapi-reps"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncMapiRepsMutation.isPending ? "animate-spin" : ""}`} />
                    {syncMapiRepsMutation.isPending ? "Synchronisation..." : "Synchroniser les reps Mapei"}
                  </Button>
                  <Select value={customerClientFilter} onValueChange={setCustomerClientFilter}>
                    <SelectTrigger className="h-9 w-44 text-xs" data-testid="select-customer-client-filter"><SelectValue placeholder="Tous les clients" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les clients</SelectItem>
                      {customerClients.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(customerSearch || customerClientFilter !== "all") && (
                    <Badge variant="secondary" className="tabular-nums">{filteredCustomers.length} résultat{filteredCustomers.length !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Client</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Boutique</TableHead>
                      <TableHead>Localisation</TableHead>
                      <TableHead className="text-right">Commandes</TableHead>
                      <TableHead className="text-right">Dépensé en commandes</TableHead>
                      <TableHead>Inscrit le</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customersLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filteredCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="h-8 w-8 text-muted-foreground/20" />
                            <p className="text-sm font-medium text-muted-foreground">{customers.length === 0 ? "Aucun client Shopify trouvé" : "Aucun client ne correspond à vos filtres"}</p>
                            {customers.length === 0 && <p className="text-xs text-muted-foreground/60">Les clients des boutiques Shopify connectées apparaîtront ici</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredCustomers.map((c) => {
                      const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                      const location = [c.default_address?.city, c.default_address?.province, c.default_address?.country].filter(Boolean).join(", ");
                      const shopifyCustomerUrl = `https://${c.storeUrl}/admin/customers/${c.id}`;
                      const dateStr = new Date(c.created_at).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" });
                      return (
                        <TableRow key={`${c.storeUrl}-${c.id}`} data-testid={`row-customer-${c.id}`} className="group cursor-pointer" onClick={() => {
                          const detailParams = new URLSearchParams({ store: c.storeUrl, integrationId: String(c.integrationId), returnTo: "/admin/boutique?tab=customers" });
                          navigate(`/admin/customers/${c.id}?${detailParams}`);
                        }}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                                {(c.first_name?.[0] ?? c.email?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-sm" data-testid={`text-customer-name-${c.id}`}>{fullName}</p>
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
                            {c.contactId ? (
                              <Link href={`/admin/contacts/${c.contactId}`}>
                                <div className="flex items-center gap-1.5 text-xs cursor-pointer hover:underline">
                                  <SiShopify className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  <span className="truncate max-w-[120px]">{c.companyName ?? c.contactName ?? c.shopName}</span>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <SiShopify className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{c.shopName}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {location ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{location}</span>
                              </div>
                            ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{c.orders_count}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(Number(c.total_spent || 0))}</TableCell>
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
