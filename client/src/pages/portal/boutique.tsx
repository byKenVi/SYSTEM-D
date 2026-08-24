import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import { dedupeCatalogProducts } from "@shared/catalog-product-deduplication";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  Users,
  Box,
  Filter,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Tag,
  Warehouse,
  AlertCircle,
  Eye,
  LayoutGrid,
  LayoutList,
  ClipboardList,
} from "lucide-react";
import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { CartProvider, useCart, type SystemdProduct, type CartItem } from "@/contexts/cart-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SiShopify } from "react-icons/si";

function money(amount: number | string | null | undefined, currency = "CAD") {
  if (amount === null || amount === undefined) return "—";
  return Number(amount).toLocaleString("fr-CA", { style: "currency", currency });
}

/* ── Types ── */
interface ShopifyCustomer {
  id: number | string;
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
  creditBalance?: string;
  creditCurrency?: string;
  isCurrentContact?: boolean;
  integrationId?: number;
}
interface CustomersResponse { customers: ShopifyCustomer[]; totalCount: number }
interface CheckoutRep {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  balance: string;
  currency: string;
  status: string;
  isCurrentContact: boolean;
  numberOfOrders?: number;
  amountSpent?: string;
  createdAt?: string;
  integrationId?: number;
  storeUrl?: string;
}

interface ShopifyOrder {
  shopifyOrderId: string;
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
  integrationId?: number;
}
interface OrdersResponse { orders: ShopifyOrder[] }

type ProductCreditStatus = "loading" | "available" | "insufficient" | "unavailable";

function ProductListActions({
  product,
  creditStatus,
  creditBalance,
  isViewAs,
  onOrder,
  onWorkOrder,
  layout = "row",
}: {
  product: Product;
  creditStatus: ProductCreditStatus;
  creditBalance?: string | number;
  isViewAs: boolean;
  onOrder: () => void;
  onWorkOrder: () => void;
  layout?: "row" | "stack";
}) {
  if (isViewAs) return null;

  const inStock = product.inventoryQuantity > 0;
  const productPrice = Number(product.price);
  const availableCredit = Number(creditBalance);
  const resolvedCreditStatus: ProductCreditStatus =
    creditStatus === "available"
      && Number.isFinite(productPrice)
      && Number.isFinite(availableCredit)
      && availableCredit < productPrice
      ? "insufficient"
      : creditStatus;
  const actionClass = layout === "stack"
    ? "flex flex-col items-stretch gap-2"
    : "flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:flex-wrap sm:items-center";
  const secondaryClass = layout === "stack" ? "w-full" : "w-full shrink-0 sm:w-auto";

  return (
    <div className={actionClass} data-testid={`product-actions-${product.id}`}>
      {!inStock ? (
        <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          Produit en rupture
        </span>
      ) : resolvedCreditStatus === "loading" ? (
        <span className="text-[11px] font-medium text-muted-foreground">Vérification du crédit…</span>
      ) : resolvedCreditStatus === "insufficient" ? (
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          Crédit insuffisant
        </span>
      ) : resolvedCreditStatus === "unavailable" ? (
        <span className="inline-flex items-center rounded-md border border-muted bg-muted/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
          Commande indisponible
        </span>
      ) : (
        <Button
          size="sm"
          className="shrink-0 font-bold"
          onClick={(event) => { event.stopPropagation(); onOrder(); }}
          data-testid={`button-order-product-${product.id}`}
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
          Commander
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className={`${secondaryClass} font-bold border-primary/20 text-primary hover:bg-primary/10 hover:text-primary`}
        onClick={(event) => { event.stopPropagation(); onWorkOrder(); }}
        data-testid={`button-request-restock-${product.id}`}
      >
        <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
        Bon de travail
      </Button>
    </div>
  );
}

/* ── Badges ── */
function FinancialBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground/40 text-xs font-mono">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    paid:               { label: "Payé",             cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20" },
    pending:            { label: "En attente",       cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20" },
    refunded:           { label: "Remboursé",        cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
    partially_refunded: { label: "Part. remboursé",  cls: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
    voided:             { label: "Annulé",           cls: "text-muted-foreground bg-muted border-border" },
    authorized:         { label: "Autorisé",         cls: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>{cfg.label}</span>;
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted border-border">Non traité</span>;
  const map: Record<string, { label: string; cls: string }> = {
    fulfilled: { label: "Traité",  cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20" },
    partial:   { label: "Partiel", cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20" },
    restocked: { label: "Restocké",cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20" },
  };
  const cfg = map[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>{cfg.label}</span>;
}

/* ── Cart Drawer ── */
function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, updateQty, removeItem, clearCart, subtotal } = useCart();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { data: repsData, isLoading: repsLoading, isError: repsError } = useQuery<{ reps: CheckoutRep[] }>({
    queryKey: ["/api/portal/mapi/reps"],
    queryFn: async () => {
      const response = await fetch("/api/portal/mapi/reps", { credentials: "include" });
      if (!response.ok) throw new Error("Connexion Shopify requise.");
      return response.json();
    },
    enabled: open,
    staleTime: 60_000,
  });
  const reps = repsData?.reps ?? [];
  const currentRep = reps.find((rep) => rep.isCurrentContact);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!currentRep) {
      toast({
        title: "Compte crédit introuvable",
        description: "Aucun compte crédit Shopify n’est associé à votre utilisateur. Veuillez contacter l’administration.",
        variant: "destructive",
      });
      return;
    }
    setIsCheckingOut(true);
    try {
      // Only send zohoItemId + quantity — server resolves authoritative prices from Zoho
      const payload = items.map((i) => ({
        zohoItemId: i.product.zohoItemId,
        quantity: i.quantity,
      }));
      const resp = await fetch("/api/portal/systemd-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || "Erreur lors du paiement");
      }
      const data = await resp.json();
      if (data.url) {
        clearCart();
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Panier
          </SheetTitle>
          <SheetDescription>
            {items.length === 0 ? "Votre panier est vide" : `${items.length} produit(s) — ${money(subtotal)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Aucun article dans le panier</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Ajoutez des produits Système D pour commencer</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.product.zohoItemId} className="flex items-center gap-3 p-3 rounded-xl border bg-card" data-testid={`cart-item-${item.product.zohoItemId}`}>
                <div className="h-12 w-12 rounded-lg bg-muted/50 border flex items-center justify-center shrink-0">
                  <img
                    src={item.product.imageUrl || ""}
                    alt={item.product.name}
                    className="h-full w-full object-cover rounded-lg"
                    style={{ display: item.product.imageUrl ? undefined : "none" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                    }}
                  />
                  <span className="items-center justify-center" style={{ display: item.product.imageUrl ? "none" : "flex" }}>
                    <Package className="h-5 w-5 text-muted-foreground/50" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{item.product.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{money(item.product.price)} × {item.quantity}</p>
                  <p className="text-xs font-mono font-bold text-primary">{money(item.product.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(item.product.zohoItemId, item.quantity - 1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center font-mono text-sm font-bold">{item.quantity}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(item.product.zohoItemId, Math.min(item.product.stock, item.quantity + 1))}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(item.product.zohoItemId)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t pt-4 space-y-3 mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-muted-foreground">Sous-total</span>
              <span className="font-mono font-bold text-lg text-foreground">{money(subtotal)}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-rep" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Rep à débiter
              </Label>
              {repsLoading ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : currentRep ? (
                <div id="checkout-rep" className="rounded-lg border border-primary/20 bg-primary/5 p-3" data-testid="checkout-current-rep">
                  <p className="text-sm font-bold">
                    {[currentRep.firstName, currentRep.lastName].filter(Boolean).join(" ") || "Compte Shopify"}
                  </p>
                  <p className="text-xs text-muted-foreground">{currentRep.email}</p>
                  <p className="mt-1 text-sm font-mono font-bold text-primary">
                    Crédit disponible : {money(currentRep.balance, currentRep.currency)}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" role="alert">
                  {repsError
                    ? "Le service de crédit Shopify est temporairement indisponible. Veuillez réessayer."
                    : "Aucun compte crédit Shopify n’est associé à votre utilisateur. Veuillez contacter l’administration."}
                </div>
              )}
            </div>
            <Button
              className="w-full h-12 font-bold text-base shadow-lg shadow-primary/20"
              onClick={handleCheckout}
              disabled={isCheckingOut || repsLoading || !currentRep}
              data-testid="button-checkout"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              {isCheckingOut ? "Débit en cours..." : "Payer avec le crédit Shopify"}
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={clearCart}>
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Vider le panier
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── SystemD Products Tab ── */
function SystemdProductsTab({ viewAsContactId }: { viewAsContactId?: number }) {
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const initialParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(() => initialParams.get("systemdSearch") ?? "");
  const [viewModeSystemD, setViewModeSystemDRaw] = useState<"grid" | "list">(
    () => (initialParams.get("systemdView") as "grid" | "list") || (localStorage.getItem("boutique_systemd_viewMode") as "grid" | "list") || "grid"
  );
  const setViewModeSystemD = (v: "grid" | "list") => {
    localStorage.setItem("boutique_systemd_viewMode", v);
    setViewModeSystemDRaw(v);
  };
  const [, navigate] = useLocation();

  const forceRefRef = useRef(false);
  const { data: products, isLoading, isError, error, refetch: refetchProductsBase } = useQuery<SystemdProduct[]>({
    queryKey: ["/api/portal/systemd-products"],
    queryFn: async () => {
      const r = await fetch(`/api/portal/systemd-products${forceRefRef.current ? "?force=true" : ""}`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${r.status}`);
      }
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 90_000,
    retry: false,
  });
  const refetchProducts = async () => {
    forceRefRef.current = true;
    try { await refetchProductsBase(); } finally { forceRefRef.current = false; }
  };

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const openDetail = (product: SystemdProduct) => {
    const returnParams = new URLSearchParams({ tab: "systemd", systemdSearch: search, systemdView: viewModeSystemD });
    if (viewAsContactId) returnParams.set("viewAs", String(viewAsContactId));
    const detailParams = new URLSearchParams({ returnTo: `/portal/boutique?${returnParams}` });
    if (viewAsContactId) detailParams.set("viewAs", String(viewAsContactId));
    navigate(`/portal/systemd/${product.zohoItemId}?${detailParams}`);
  };

  return (
    <div className="space-y-4">
      {/* Header with cart button */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Card className="border-border/50 shadow-sm flex-1">
          <CardContent className="p-2">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Rechercher par nom, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-12 text-base bg-transparent border-transparent hover:border-border focus:border-border transition-all shadow-none"
                data-testid="input-search-systemd-products"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1 border border-border/50 rounded-lg p-1 bg-muted/30">
            <Button variant={viewModeSystemD === "grid" ? "secondary" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setViewModeSystemD("grid")} title="Vue grille" data-testid="button-view-systemd-grid"><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewModeSystemD === "list" ? "secondary" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setViewModeSystemD("list")} title="Vue liste" data-testid="button-view-systemd-list"><LayoutList className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" className="h-12 shrink-0" onClick={() => refetchProducts()} disabled={isLoading} data-testid="button-refresh-systemd-products" title="Actualiser les produits">
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button variant="outline" className="h-12 px-4 relative border-primary/30 text-primary hover:bg-primary/5 hover:border-primary font-bold" onClick={() => setCartOpen(true)} data-testid="button-open-cart">
            <ShoppingCart className="h-5 w-5 sm:mr-2" /><span className="hidden sm:inline">Panier</span>
            {cart.totalItems > 0 && <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{cart.totalItems}</span>}
          </Button>
        </div>
      </div>

      {/* Products grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <Warehouse className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Catalogue temporairement indisponible</h3>
            <p className="text-muted-foreground max-w-sm text-sm">
              {(error as Error)?.message?.includes("429") || (error as Error)?.message?.toLowerCase().includes("limite")
                ? "La limite d'appels Zoho a été atteinte pour aujourd'hui. Les produits seront de nouveau disponibles demain."
                : "Impossible de charger les produits Système D pour le moment. Réessayez dans quelques instants."}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchProducts()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <Warehouse className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Catalogue vide</h3>
            <p className="text-muted-foreground max-w-sm">
              {search
                ? "Aucun produit ne correspond à votre recherche."
                : "Aucun produit Système D disponible pour le moment."}
            </p>
          </CardContent>
        </Card>
      ) : viewModeSystemD === "list" ? (
        <div className="space-y-2">
          {filtered.map((product) => {
            const inStock = product.stock > 0;
            return (
              <div
                key={product.zohoItemId}
                className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-xl cursor-pointer hover:bg-muted/50 transition-colors group"
                onClick={() => openDetail(product)}
                data-testid={`list-systemd-product-${product.zohoItemId}`}
              >
                <div className="h-12 w-12 bg-muted/30 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center border border-border/30">
                  <img
                    src={product.imageUrl || ""}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    style={{ display: product.imageUrl ? undefined : "none" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <Package className="h-6 w-6 text-muted-foreground/30" style={{ display: product.imageUrl ? "none" : undefined }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{product.name}</p>
                  {product.sku && (
                    <Badge variant="outline" className="font-mono text-[10px] border-dashed mt-0.5">{product.sku}</Badge>
                  )}
                </div>
                <span className="font-mono font-bold text-sm whitespace-nowrap">{money(product.price)}</span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${inStock ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}
                >
                  {inStock ? `${product.stock} en stock` : "Épuisé"}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => {
            const inStock = product.stock > 0;
            const cartItem = cart.items.find((i) => i.product.zohoItemId === product.zohoItemId);
            return (
              <Card
                key={product.zohoItemId}
                className="border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden"
                onClick={() => openDetail(product)}
                data-testid={`card-systemd-product-${product.zohoItemId}`}
              >
                <div className="aspect-square bg-muted/30 border-b flex items-center justify-center overflow-hidden relative">
                  <img
                    src={product.imageUrl || ""}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    style={{ display: product.imageUrl ? undefined : "none" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                    }}
                  />
                  <span className="w-full h-full items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}>
                    <Package className="h-16 w-16 text-muted-foreground/30" />
                  </span>
                  {cartItem && (
                    <div className="absolute top-2 right-2 h-6 min-w-6 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {cartItem.quantity}
                    </div>
                  )}
                  {!inStock && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                      <Badge variant="destructive" className="font-bold">Rupture</Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-bold text-sm text-foreground line-clamp-2 leading-tight">{product.name}</h3>
                  {product.sku && (
                    <Badge variant="outline" className="font-mono text-[10px] border-dashed">{product.sku}</Badge>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono font-bold text-base text-foreground">{money(product.price)}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-bold tabular-nums ${
                        inStock ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
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

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

/* ── Main Component ── */
export default function PortalBoutique({ viewAsContactId }: { viewAsContactId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
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
    const next = new URLSearchParams(window.location.search);
    next.set("tab", tab);
    navigate(`/portal/boutique?${next}`);
  };

  /* Products state */
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [viewModeProducts, setViewModeProductsRaw] = useState<"list" | "grid">(
    () => (localStorage.getItem("boutique_products_viewMode") as "list" | "grid") || "grid"
  );
  const setViewModeProducts = (v: "list" | "grid") => {
    localStorage.setItem("boutique_products_viewMode", v);
    setViewModeProductsRaw(v);
  };
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const isViewAs = !!viewAsContactId;

  const { data: systemdCatalog } = useQuery<SystemdProduct[]>({
    queryKey: ["/api/portal/systemd-products"],
    staleTime: 90_000,
  });
  const systemdProductCount = systemdCatalog?.length ?? 0;

  /* SystemD orders */
  const { data: systemdOrdersData, isLoading: systemdOrdersLoading, isFetching: systemdOrdersFetching, isError: systemdOrdersError, refetch: refetchSystemdOrders } = useQuery<any[]>({
    queryKey: ["/api/portal/systemd-orders"],
    queryFn: () =>
      fetch("/api/portal/systemd-orders", { credentials: "include" }).then(async (r) => {
        if (!r.ok) throw new Error("Impossible de charger les commandes Système D");
        return r.json();
      }),
    enabled: !isViewAs,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
  const systemdOrdersList = systemdOrdersData ?? [];

  const [expandedSystemdOrderId, setExpandedSystemdOrderId] = useState<number | null>(null);

  /* Orders state */
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");

  /* Customers state */
  const [customerSearch, setCustomerSearch] = useState("");

  /* Payment success/cancelled toast — validé contre l'état réel des commandes */
  const paymentStatus = params.get("payment");
  const confirmedOrderId = Number(params.get("orderId")) || null;
  const paymentToastFired = useRef(false);

  // Effet 1 : invalide le cache dès détection de "payment=success" (déclenche refetch).
  // Gère aussi "payment=cancelled" immédiatement (aucune commande à vérifier).
  useEffect(() => {
    if (paymentStatus === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/systemd-orders"] });
    } else if (paymentStatus === "cancelled" && !paymentToastFired.current) {
      paymentToastFired.current = true;
      toast({ title: "Paiement annulé", description: "Votre panier a été conservé.", variant: "destructive" });
    }
  }, [paymentStatus]);

  // Effet 2 : toast de succès — attend la fin du refetch déclenché par l'invalidation
  // ci-dessus (isFetching=false), puis inspecte les commandes fraîches pour adapter
  // le message au statut réel (paid / pending / introuvable).
  useEffect(() => {
    if (paymentStatus !== "success" || paymentToastFired.current) return;

    // En mode view-as, le fetch systemd-orders est désactivé : on affiche un message
    // générique immédiatement sans attendre.
    if (isViewAs) {
      paymentToastFired.current = true;
      toast({ title: "Paiement reçu", description: "La commande a été enregistrée." });
      return;
    }

    // Attendre la fin du refetch pour inspecter des données fraîches.
    if (systemdOrdersFetching) return;

    // Paiement traité — l'UI se met à jour directement via les queries.
    // Aucun toast intrusive : l'utilisateur voit sa commande dans l'onglet "Mes commandes".
    paymentToastFired.current = true;
  }, [paymentStatus, confirmedOrderId, systemdOrdersFetching, systemdOrdersList, isViewAs]);

  /* Data fetching */
  const { data: rawProducts, isLoading: productsLoading, isError: productsError, refetch: refetchPortalProducts } = useQuery<Product[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products?catalog=v3"]
      : ["/api/portal/products?catalog=v3"],
  });
  const products = useMemo(
    () => rawProducts ? dedupeCatalogProducts(rawProducts, viewAsContactId) : undefined,
    [rawProducts, viewAsContactId],
  );

  const { data: ordersData, isLoading: ordersLoading, isError: ordersError, refetch: refetchPortalOrders } = useQuery<OrdersResponse>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "orders"]
      : ["/api/portal/orders"],
    queryFn: async () => {
      const url = viewAsContactId
        ? `/api/admin/view-as/${viewAsContactId}/orders`
        : "/api/portal/orders";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les commandes.");
      return response.json();
    },
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const customersUrl = isViewAs
    ? `/api/admin/customers?contactId=${viewAsContactId}`
    : "/api/portal/mapi/reps";
  const { data: customersData, isLoading: customersLoading, isError: customersError, refetch: refetchPortalCustomers } = useQuery<CustomersResponse>({
    queryKey: isViewAs ? ["/api/admin/customers", viewAsContactId] : ["/api/portal/mapi/reps", "directory"],
    queryFn: async () => {
      const response = await fetch(customersUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les reps Mapei.");
      const payload = await response.json();
      if (isViewAs) return payload;
      const reps = (payload.reps ?? []) as CheckoutRep[];
      return {
        customers: reps.map((rep) => ({
          id: rep.id,
          email: rep.email,
          first_name: rep.firstName,
          last_name: rep.lastName,
          phone: null,
          orders_count: rep.numberOfOrders ?? 0,
          total_spent: rep.amountSpent ?? "0",
          state: rep.status,
          verified_email: true,
          tags: "mapi-rep",
          created_at: rep.createdAt ?? "",
          shopName: "Mapei",
          storeUrl: rep.storeUrl || "tnt5ar-ki.myshopify.com",
          creditBalance: rep.balance,
          creditCurrency: rep.currency,
          isCurrentContact: rep.isCurrentContact,
          integrationId: rep.integrationId,
        })),
        totalCount: reps.length,
      };
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const orders: ShopifyOrder[] = ordersData?.orders ?? [];
  const customers: ShopifyCustomer[] = customersData?.customers ?? [];
  const currentCreditRep = customers.find((customer) => customer.isCurrentContact);
  const creditStatus: ProductCreditStatus = customersLoading
    ? "loading"
    : customersError || !currentCreditRep || currentCreditRep.creditBalance === undefined
      ? "unavailable"
      : "available";

  /* Filtering & Sorting */
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

  const filteredCustomers = useMemo(() => customers.filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    return name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  }), [customers, customerSearch]);

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!restockProduct) return;
      const response = await apiRequest("POST", "/api/portal/product-work-orders", {
        productId: restockProduct.id,
        requestedQuantity: Number(restockQty),
      });
      return response.json();
    },
    onSuccess: (submission: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
      setRestockProduct(null);
      setRestockQty("");
      toast({ title: "Bon de Travail soumis", description: "Cette demande n’est pas une commande payée. L’équipe Système D doit l’analyser avant traitement." });
      if (submission?.id) navigate(`/portal/forms/${submission.id}`);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la soumission du bon de travail.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-in w-full max-w-full">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-5 shadow-sm sm:p-8">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
          <div className="absolute -top-24 -right-24">
            <div className="h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
                <SiShopify className="h-3.5 w-3.5" /> Synchronisation E-commerce
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl" data-testid="text-page-title">
                Boutique & Inventaire
              </h1>
              <p className="text-muted-foreground mt-3 text-base sm:text-lg">
                Visualisation en temps réel de votre catalogue, de vos commandes Shopify et de votre base clients.
              </p>
            </div>
          </div>
        </div>

        {(productsError || ordersError || customersError || systemdOrdersError) && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
            <span>Une mise à jour a échoué. Les dernières données disponibles restent affichées.</span>
            <Button variant="outline" size="sm" onClick={() => { if (productsError) refetchPortalProducts(); if (ordersError) refetchPortalOrders(); if (customersError) refetchPortalCustomers(); if (systemdOrdersError) refetchSystemdOrders(); }}>Réessayer</Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="relative mb-6">
          <TabsList className="w-full justify-start h-14 bg-card border border-border/50 shadow-sm p-1 rounded-xl overflow-x-auto overflow-y-hidden scrollbar-hide" data-testid="tabs-boutique">
            <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-products">
              <Package className="h-4 w-4 mr-2" />
              Mes Produits
              {products && <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{products.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="systemd" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-systemd">
              <Warehouse className="h-4 w-4 mr-2" />
              Produits Système D
              <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{systemdProductCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-orders">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Mes commandes
              <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{orders.length + (!isViewAs ? systemdOrdersList.length : 0)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="customers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-customers">
              <Users className="h-4 w-4 mr-2" />
              Mes reps
              {customers.length > 0 && <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{customers.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-16 rounded-r-xl bg-gradient-to-l from-card to-transparent" aria-hidden="true" />
          </div>

          {/* ══ PRODUITS CLIENTS TAB ══ */}
          <TabsContent value="products" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input
                      placeholder="Rechercher par nom, SKU..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-12 h-12 text-base bg-transparent border-transparent hover:border-border focus:border-border transition-all shadow-none"
                      data-testid="input-search-portal-products"
                    />
                  </div>
                  <div className="h-px sm:h-8 w-full sm:w-px bg-border my-1 sm:my-0" />
                  <div className="px-2 pb-2 sm:pb-0">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-10 w-full sm:w-[180px] bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-sort-products">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Nom A-Z</SelectItem>
                        <SelectItem value="stock-asc">Stock : Croissant</SelectItem>
                        <SelectItem value="stock-desc">Stock : Décroissant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="px-2 pb-2 sm:pb-0 flex items-center gap-1 border border-border/50 rounded-lg p-1 bg-muted/30">
                    <Button
                      variant={viewModeProducts === "list" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setViewModeProducts("list")}
                      title="Vue liste"
                      data-testid="button-view-products-list"
                    >
                      <LayoutList className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewModeProducts === "grid" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setViewModeProducts("grid")}
                      title="Vue grille"
                      data-testid="button-view-products-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {productsLoading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : filteredProducts && filteredProducts.length > 0 ? (
                  viewModeProducts === "grid" ? (
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex flex-col bg-card border border-border/50 rounded-xl overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors group"
                          onClick={() => { if (!product.id) return; const path = viewAsContactId ? `/portal/products/${product.id}?viewAs=${viewAsContactId}` : `/portal/products/${product.id}`; navigate(path); }}
                          data-testid={`card-portal-product-${product.id}`}
                        >
                          <div className="aspect-video bg-muted/50 flex items-center justify-center overflow-hidden">
                            <img src={product.imageUrl || ""} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            <Package className="h-12 w-12 text-muted-foreground/30" style={{ display: product.imageUrl ? "none" : undefined }} />
                          </div>
                          <div className="p-4 space-y-2">
                            <p className="font-bold text-sm leading-tight">{product.name}</p>
                            {product.sku && <Badge variant="outline" className="font-mono text-[10px] border-dashed">{product.sku}</Badge>}
                            <div className="flex items-center justify-between pt-1">
                              <span className="font-mono font-bold text-sm">{product.price ? `$${Number(product.price).toFixed(2)}` : "—"}</span>
                              <Badge variant="secondary" className={`font-mono text-xs px-2 py-0.5 rounded-md border-0 ${product.inventoryQuantity <= 5 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-foreground"}`}>
                                {product.inventoryQuantity === 0 ? "Rupture" : `${product.inventoryQuantity} un.`}
                              </Badge>
                            </div>
                            <ProductListActions
                              product={product}
                              creditStatus={creditStatus}
                              creditBalance={currentCreditRep?.creditBalance}
                              isViewAs={isViewAs}
                              layout="stack"
                              onOrder={() => navigate(`/portal/products/${product.id}`)}
                              onWorkOrder={() => { setRestockProduct(product); setRestockQty(""); }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <div className="responsive-table">
                      <Table className="w-full min-w-[860px] table-fixed">
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                           <TableHead className="w-[40%] py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Produit</TableHead>
                           <TableHead className="w-[11%] py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">SKU</TableHead>
                           <TableHead className="w-[10%] py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Prix</TableHead>
                           <TableHead className="w-[14%] py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Inventaire</TableHead>
                            <TableHead className="w-[25%] min-w-[15rem] py-4 text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map((product) => (
                          <TableRow
                            key={product.id}
                            data-testid={`row-portal-product-${product.id}`}
                            className="cursor-pointer group hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              if (!product.id) { console.warn("Product has no ID, skipping navigation"); return; }
                              const path = viewAsContactId
                                ? `/portal/products/${product.id}?viewAs=${viewAsContactId}`
                                : `/portal/products/${product.id}`;
                              navigate(path);
                            }}
                          >
                            <TableCell className="py-4">
                              <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-lg bg-background border flex items-center justify-center shrink-0 overflow-hidden bg-white shadow-sm">
                                  <img src={product.imageUrl || ""} alt={product.name} className="h-full w-full object-cover" style={{ display: product.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                                  <span className="items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}><Package className="h-5 w-5 text-muted-foreground/50" /></span>
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-base text-foreground block truncate">{product.name}</span>
                                  {product.description && (
                                    <p className="text-xs font-medium text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              {product.sku ? (
                                <Badge variant="outline" className="font-mono text-xs border-dashed bg-muted/30">{product.sku}</Badge>
                              ) : (
                                <span className="text-muted-foreground/40 font-mono">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right py-4 font-mono font-bold">
                              {product.price ? `$${Number(product.price).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right py-4">
                              <Badge variant="secondary" className={`font-mono text-sm px-2.5 py-1 rounded-md border-0 ${product.inventoryQuantity <= 5 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-foreground"}`}>
                                {product.inventoryQuantity === 0 ? "Rupture" : `${product.inventoryQuantity} un.`}
                              </Badge>
                            </TableCell>
                             <TableCell className="w-[25%] min-w-[15rem] py-4" onClick={(e) => e.stopPropagation()}>
                               <ProductListActions
                                 product={product}
                                 creditStatus={creditStatus}
                                 creditBalance={currentCreditRep?.creditBalance}
                                 isViewAs={isViewAs}
                                 onOrder={() => navigate(`/portal/products/${product.id}`)}
                                 onWorkOrder={() => { setRestockProduct(product); setRestockQty(""); }}
                               />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center p-16 text-center">
                    <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                      <Package className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight mb-2">Catalogue vide</h3>
                    <p className="text-muted-foreground max-w-sm">
                      Les produits apparaîtront ici une fois synchronisés avec votre boutique Shopify par l'administration.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Restock Dialog */}
            <Dialog open={!!restockProduct} onOpenChange={() => setRestockProduct(null)}>
              <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/50 shadow-2xl">
                <div className="bg-primary/5 p-6 border-b border-border/50 flex gap-4 items-start">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <RefreshCw className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight mb-2">Créer un bon de travail</DialogTitle>
                    <DialogDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
                      Demandez une intervention ou un réapprovisionnement. Ce n’est pas une commande payée et aucun crédit Shopify n’est débité.
                    </DialogDescription>
                  </div>
                </div>
                
                {restockProduct && (
                  <div className="p-6 space-y-6 bg-background">
                    <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card shadow-sm">
                      <div className="h-12 w-12 rounded-lg bg-background border flex items-center justify-center shrink-0 overflow-hidden bg-white">
                        <img src={restockProduct.imageUrl || ""} alt={restockProduct.name} className="h-full w-full object-cover" style={{ display: restockProduct.imageUrl ? undefined : "none" }} onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                        <span className="items-center justify-center" style={{ display: restockProduct.imageUrl ? "none" : "flex" }}><Package className="h-5 w-5 text-muted-foreground/50" /></span>
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground line-clamp-1">{restockProduct.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="font-mono text-[10px]">{restockProduct.sku || "Sans SKU"}</Badge>
                          <span className="text-xs font-medium text-muted-foreground">Stock: <span className="font-mono font-bold text-foreground">{restockProduct.inventoryQuantity}</span></span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Quantité à traiter
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                        placeholder="Entrez le nombre d'unités..."
                        className="h-12 text-base font-medium font-mono shadow-none focus-visible:ring-1"
                        data-testid="input-restock-quantity"
                      />
                    </div>
                    
                    <DialogFooter className="pt-2 gap-2 sm:gap-0">
                      <Button variant="ghost" className="font-bold" onClick={() => setRestockProduct(null)}>
                        Annuler
                      </Button>
                      <Button
                        className="font-bold shadow-md shadow-primary/20"
                        disabled={!restockQty || Number(restockQty) <= 0 || restockMutation.isPending}
                        onClick={() => restockMutation.mutate()}
                        data-testid="button-submit-restock"
                      >
                        {restockMutation.isPending ? "Envoi..." : "Créer le bon"}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══ PRODUITS SYSTEMD TAB ══ */}
          <TabsContent value="systemd" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <SystemdProductsTab viewAsContactId={viewAsContactId} />
          </TabsContent>

          {/* Commandes Système D — regroupées dans Mes commandes */}
          <TabsContent value="orders" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            {paymentStatus === "success" && confirmedOrderId && (
              <Card className="border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-900 dark:text-emerald-200">Paiement accepté. Votre commande est confirmée.</p>
                      <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">Commande Système D #{confirmedOrderId}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setExpandedSystemdOrderId(confirmedOrderId);
                      document.getElementById(`systemd-order-${confirmedOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    Voir ma commande
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="flex items-center gap-2 pt-1">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Commandes Système D</h2>
              <Badge variant="outline">Système D</Badge>
            </div>
            {systemdOrdersError && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
                <span>{systemdOrdersList.length > 0 ? "Dernières commandes chargées conservées. La mise à jour a échoué." : "Impossible de charger vos commandes pour le moment."}</span>
                <Button variant="outline" size="sm" onClick={() => refetchSystemdOrders()}>Réessayer</Button>
              </div>
            )}
            {isViewAs ? (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-10 text-center">
                  <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-4" />
                  <p className="text-sm text-muted-foreground">Les commandes Système D du client sont consultables depuis la vue Admin → Commandes Système D.</p>
                </CardContent>
              </Card>
            ) : systemdOrdersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : systemdOrdersError && systemdOrdersList.length === 0 ? null : systemdOrdersList.length === 0 ? (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                  <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                    <CreditCard className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight mb-2">Aucune commande Système D</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">
                    Vos commandes passées via la boutique Système D apparaîtront ici une fois validées.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="responsive-table">
                    <Table className="min-w-[920px]">
                      <TableHeader><TableRow><TableHead>Commande</TableHead><TableHead>Date</TableHead><TableHead>Rep</TableHead><TableHead>Source</TableHead><TableHead>Articles</TableHead><TableHead>Paiement</TableHead><TableHead>Traitement</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {systemdOrdersList.map((order: any) => {
                          const items = Array.isArray(order.lineItems) ? order.lineItems : [];
                          const itemCount = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
                          return (
                            <Fragment key={order.id}>
                              <TableRow id={`systemd-order-${order.id}`} className="scroll-mt-24 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/portal/orders/systemd/${order.id}`)}>
                                <TableCell className="font-mono font-bold">#{order.id}</TableCell>
                                <TableCell className="whitespace-nowrap text-xs">{new Date(order.createdAt).toLocaleDateString("fr-CA")}</TableCell>
                                <TableCell><p className="text-sm font-medium">{order.repName || order.repEmail || "—"}</p>{order.repName && order.repEmail && <p className="text-[10px] text-muted-foreground">{order.repEmail}</p>}</TableCell>
                                <TableCell><Badge variant="outline">{items[0]?.source === "client_product" ? "Produit client" : "Système D"}</Badge></TableCell>
                                <TableCell>{itemCount}</TableCell>
                                <TableCell><Badge className={order.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{order.status === "paid" ? "Payé" : "En attente"}</Badge></TableCell>
                                <TableCell><Badge variant="secondary">{order.fulfillmentStatus === "completed" ? "Terminé" : order.fulfillmentStatus === "processing" ? "En traitement" : "À traiter"}</Badge></TableCell>
                                <TableCell className="text-right font-mono font-bold">{money(order.amount / 100, (order.currency || "CAD").toUpperCase())}</TableCell>
                              </TableRow>
                              {expandedSystemdOrderId === order.id && (
                                <TableRow><TableCell colSpan={8} className="bg-muted/30"><div className="grid gap-2 sm:grid-cols-2">{items.map((item: any, index: number) => <div key={index} className="flex justify-between text-xs"><span>{item.name} × {item.quantity}</span><span className="font-mono">{money(Number(item.unitPrice || 0) * Number(item.quantity || 0))}</span></div>)}</div><p className="mt-3 text-xs text-muted-foreground">{order.stockReservationStatus === "reserved" ? "Stock réservé localement." : "Stock à vérifier par l’équipe Système D."}</p></TableCell></TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Commandes Shopify — regroupées dans Mes commandes */}
          <TabsContent value="orders" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <div className="flex items-center gap-2 pt-1">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Commandes Shopify</h2>
              <Badge variant="outline">Shopify</Badge>
            </div>
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <div className="relative flex-1 group min-w-0 w-full sm:min-w-[200px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input
                      placeholder="Rechercher commande, client..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-12 h-12 text-base bg-transparent border-transparent hover:border-border focus:border-border transition-all shadow-none"
                      data-testid="input-search-orders"
                    />
                  </div>
                  <div className="h-px sm:h-8 w-full sm:w-px bg-border my-1 sm:my-0" />
                  <div className="flex w-full sm:w-auto gap-2 px-2 pb-2 sm:pb-0 flex-wrap">
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="h-11 w-full sm:w-[150px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-payment-filter"><SelectValue placeholder="Paiement" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous paiements</SelectItem>
                        <SelectItem value="paid">Payé</SelectItem>
                        <SelectItem value="pending">En attente</SelectItem>
                        <SelectItem value="authorized">Autorisé</SelectItem>
                        <SelectItem value="refunded">Remboursé</SelectItem>
                        <SelectItem value="voided">Annulé</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
                      <SelectTrigger className="h-11 w-full sm:w-[150px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-fulfillment-filter"><SelectValue placeholder="Traitement" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous statuts</SelectItem>
                        <SelectItem value="unfulfilled">Non traité</SelectItem>
                        <SelectItem value="partial">Partiel</SelectItem>
                        <SelectItem value="fulfilled">Traité</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="responsive-table">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commande</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Date</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Rep</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Source</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Articles</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Paiement</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Traitement</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Total</TableHead>
                        <TableHead className="w-12 py-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j} className="py-4"><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                        ))
                      ) : filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-[400px] text-center">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
                              </div>
                              <h3 className="text-xl font-bold tracking-tight">Aucune commande</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Les commandes de votre boutique Shopify apparaîtront ici.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.map((order) => {
                          const customerName = `${order.customerFirstName || ""} ${order.customerLastName || ""}`.trim();
                          const itemsCount = order.lineItems?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0;
                          return (
                            <TableRow 
                              key={order.shopifyOrderId}
                              className="cursor-pointer group hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                if (!order.storeUrl) { console.warn("Order has no storeUrl, skipping navigation"); return; }
                                if (!order.shopifyOrderId) { console.warn("Order has no ID, skipping navigation"); return; }
                                const detailParams = new URLSearchParams({
                                  store: order.storeUrl,
                                  returnTo: `/portal/boutique?tab=orders${viewAsContactId ? `&viewAs=${viewAsContactId}` : ""}`,
                                });
                                if (viewAsContactId) detailParams.set("viewAs", String(viewAsContactId));
                                if (order.integrationId) detailParams.set("integrationId", String(order.integrationId));
                                const path = `/portal/orders/${order.shopifyOrderId}?${detailParams}`;
                                navigate(path);
                              }}
                            >
                              <TableCell className="py-4">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-base text-foreground">{order.name}</span>
                                    <Badge variant="outline" className="text-[10px]">Shopify</Badge>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 whitespace-nowrap text-xs text-muted-foreground">{order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt).toLocaleDateString("fr-CA") : "—"}</TableCell>
                              <TableCell className="py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm text-foreground truncate max-w-[150px]">{customerName || "—"}</span>
                                  {order.email && <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[150px] mt-0.5">{order.email}</span>}
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded-md">{itemsCount}</span>
                              </TableCell>
                              <TableCell className="py-4"><FinancialBadge status={order.financialStatus} /></TableCell>
                              <TableCell className="py-4"><FulfillmentBadge status={order.fulfillmentStatus} /></TableCell>
                              <TableCell className="py-4 text-right">
                                <span className="font-mono font-bold text-foreground">
                                  {money(Number(order.totalPrice), order.currency)}
                                </span>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

          {/* Reps Shopify */}
          <TabsContent value="customers" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-2">
                <div className="relative w-full group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    placeholder="Rechercher par nom, email, téléphone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-12 h-12 text-base bg-transparent border-transparent hover:border-border focus:border-border transition-all shadow-none"
                    data-testid="input-search-customers"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="responsive-table">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Rep</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Association</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-center">Commandes</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Dépensé</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Crédit disponible</TableHead>
                        <TableHead className="w-12 py-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customersLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j} className="py-4"><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                        ))
                      ) : filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-[400px] text-center">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <Users className="h-10 w-10 text-muted-foreground/50" />
                              </div>
                              <h3 className="text-xl font-bold tracking-tight">Aucun rep trouvé</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Aucun rep Mapei n'est disponible. Une synchronisation Shopify peut être nécessaire.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCustomers.map((customer) => {
                          const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
                          const initials = name ? name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() : "C";
                          const location = [customer.default_address?.city, customer.default_address?.province].filter(Boolean).join(", ");
                          
                          return (
                            <TableRow 
                              key={customer.id}
                              className="cursor-pointer group hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                const p = new URLSearchParams();
                                if (viewAsContactId) p.set("viewAs", String(viewAsContactId));
                                if (customer.storeUrl) p.set("store", customer.storeUrl);
                                if (customer.integrationId) p.set("integrationId", String(customer.integrationId));
                                p.set("returnTo", `/portal/boutique?tab=customers${viewAsContactId ? `&viewAs=${viewAsContactId}` : ""}`);
                                const qs = p.toString();
                                navigate(`/portal/customers/${customer.id}${qs ? `?${qs}` : ""}`);
                              }}
                            >
                              <TableCell className="py-4">
                                <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                    <span className="text-sm font-bold text-primary">{initials}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-bold text-sm text-foreground">{name || "Rep sans nom"}</span>
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 mt-0.5">
                                      {customer.email || "Pas d'email"}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {customer.isCurrentContact ? (
                                  <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">Votre compte</Badge>
                                ) : (
                                  <span className="text-sm font-medium text-foreground">{location || "Mapei"}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge variant="outline" className="font-mono text-xs border-dashed bg-muted/30">{customer.orders_count}</Badge>
                              </TableCell>
                              <TableCell className="py-4 text-right font-mono text-sm font-medium">{money(customer.total_spent || "0")}</TableCell>
                              <TableCell className="py-4 text-right">
                                <span className="font-mono font-bold text-foreground">
                                  {customer.creditBalance !== undefined
                                    ? money(customer.creditBalance, customer.creditCurrency || "CAD")
                                    : "—"}
                                </span>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
        </Tabs>
      </div>
  );
}
