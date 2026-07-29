import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
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
} from "lucide-react";
import { useState, useMemo, createContext, useContext, useCallback, useEffect, useRef } from "react";
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

function money(amount: number | string | null | undefined, currency = "CAD") {
  if (amount === null || amount === undefined) return "—";
  return Number(amount).toLocaleString("fr-CA", { style: "currency", currency });
}

/* ── Types ── */
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
}
interface OrdersResponse { orders: ShopifyOrder[] }

interface SystemdProduct {
  zohoItemId: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: number;
}

interface CartItem {
  product: SystemdProduct;
  quantity: number;
}

/* ── Cart Context ── */
interface CartContextValue {
  items: CartItem[];
  addItem: (product: SystemdProduct, qty: number) => void;
  updateQty: (zohoItemId: string, qty: number) => void;
  removeItem: (zohoItemId: string) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  addItem: () => {},
  updateQty: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalItems: 0,
  subtotal: 0,
});

function useCart() {
  return useContext(CartContext);
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: SystemdProduct, qty: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.zohoItemId === product.zohoItemId);
      if (existing) {
        return prev.map((i) =>
          i.product.zohoItemId === product.zohoItemId
            ? { ...i, quantity: Math.min(i.quantity + qty, product.stock) }
            : i
        );
      }
      return [...prev, { product, quantity: Math.min(qty, product.stock) }];
    });
  }, []);

  const updateQty = useCallback((zohoItemId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((i) => i.product.zohoItemId !== zohoItemId);
      return prev.map((i) =>
        i.product.zohoItemId === zohoItemId ? { ...i, quantity: qty } : i
      );
    });
  }, []);

  const removeItem = useCallback((zohoItemId: string) => {
    setItems((prev) => prev.filter((i) => i.product.zohoItemId !== zohoItemId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
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

/* ── SystemD Product Detail Sheet ── */
function ProductDetailSheet({
  product,
  open,
  onClose,
}: {
  product: SystemdProduct | null;
  open: boolean;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);

  if (!product) return null;

  const inStock = product.stock > 0;

  const handleAdd = () => {
    if (!inStock) return;
    addItem(product, qty);
    toast({ title: "Ajouté au panier", description: `${qty}× ${product.name}` });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold">{product.name}</SheetTitle>
          {product.sku && (
            <SheetDescription>
              <Badge variant="outline" className="font-mono text-xs">{product.sku}</Badge>
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-6">
          <div className="w-full aspect-square rounded-xl overflow-hidden border bg-muted/30 flex items-center justify-center">
            <img
              src={product.imageUrl || ""}
              alt={product.name}
              className="w-full h-full object-cover"
              style={{ display: product.imageUrl ? undefined : "none" }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
              }}
            />
            <span className="w-full h-full items-center justify-center" style={{ display: product.imageUrl ? "none" : "flex" }}>
              <Package className="h-20 w-20 text-muted-foreground/30" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-card">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Prix</p>
              <p className="text-2xl font-mono font-bold text-foreground">{money(product.price)}</p>
            </div>
            <div className={`p-4 rounded-xl border ${inStock ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Stock</p>
              <p className={`text-2xl font-mono font-bold ${inStock ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {product.stock} un.
              </p>
            </div>
          </div>

          {product.description && (
            <div className="p-4 rounded-xl border bg-muted/20">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Description</p>
              <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
            </div>
          )}

          {inStock && (
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantité</Label>
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  data-testid="button-qty-decrease"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={product.stock}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(product.stock, Number(e.target.value))))}
                  className="h-10 text-center font-mono font-bold text-base"
                  data-testid="input-product-qty"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setQty(Math.min(product.stock, qty + 1))}
                  data-testid="button-qty-increase"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Sous-total : <span className="font-mono font-bold text-foreground">{money(product.price * qty)}</span></p>
            </div>
          )}

          <Button
            className="w-full h-12 font-bold text-base shadow-lg shadow-primary/20"
            disabled={!inStock}
            onClick={handleAdd}
            data-testid="button-add-to-cart"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            {inStock ? "Ajouter au panier" : "Rupture de stock"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Cart Drawer ── */
function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, updateQty, removeItem, clearCart, subtotal } = useCart();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    if (items.length === 0) return;
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
              <p className="text-xs text-muted-foreground/60 mt-1">Ajoutez des produits SystemD pour commencer</p>
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
            <Button
              className="w-full h-12 font-bold text-base shadow-lg shadow-primary/20"
              onClick={handleCheckout}
              disabled={isCheckingOut}
              data-testid="button-checkout"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              {isCheckingOut ? "Redirection..." : "Procéder au paiement"}
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
  const { toast } = useToast();
  const cart = useCart();
  const [selectedProduct, setSelectedProduct] = useState<SystemdProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");

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
    setSelectedProduct(product);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header with cart button */}
      <div className="flex items-center justify-between gap-3">
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

        <Button variant="ghost" size="sm" className="h-12 w-12 p-0 flex-shrink-0" onClick={() => refetchProducts()} disabled={isLoading} data-testid="button-refresh-systemd-products" title="Rafraîchir">
          <RefreshCw className={`h-5 w-5 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
        </Button>

        <Button
          variant="outline"
          className="h-12 px-4 relative border-primary/30 text-primary hover:bg-primary/5 hover:border-primary font-bold"
          onClick={() => setCartOpen(true)}
          data-testid="button-open-cart"
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          Panier
          {cart.totalItems > 0 && (
            <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {cart.totalItems}
            </span>
          )}
        </Button>
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
                : "Impossible de charger les produits SystemD pour le moment. Réessayez dans quelques instants."}
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
                : "Aucun produit SystemD disponible pour le moment."}
            </p>
          </CardContent>
        </Card>
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

      <ProductDetailSheet
        product={selectedProduct}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); }}
      />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

/* ── Main Component ── */
export default function PortalBoutique({ viewAsContactId }: { viewAsContactId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get("tab") ?? "products";

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

  /* Payment success/cancelled toast — runs once on mount, keyed on payment param */
  const paymentStatus = params.get("payment");
  const paymentToastFired = useRef(false);
  useEffect(() => {
    if (paymentToastFired.current) return;
    if (paymentStatus === "success") {
      paymentToastFired.current = true;
      toast({ title: "Paiement réussi !", description: "Votre commande SystemD a été enregistrée." });
    } else if (paymentStatus === "cancelled") {
      paymentToastFired.current = true;
      toast({ title: "Paiement annulé", description: "Votre panier a été conservé.", variant: "destructive" });
    }
  }, [paymentStatus]);

  /* Data fetching */
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
      toast({ title: "Bon de travail soumis", description: "Votre bon de travail a été créé avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la soumission du bon de travail.", variant: "destructive" });
    },
  });

  return (
    <CartProvider>
      <div className="space-y-6 animate-in w-full max-w-full">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
          <div className="absolute -top-24 -right-24">
            <div className="h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
                <SiShopify className="h-3.5 w-3.5" /> Synchronisation E-commerce
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
                Boutique & Inventaire
              </h1>
              <p className="text-muted-foreground mt-3 text-lg">
                Visualisation en temps réel de votre catalogue, de vos commandes Shopify et de votre base clients.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="w-full justify-start h-14 bg-card border border-border/50 shadow-sm p-1 rounded-xl mb-6 overflow-x-auto overflow-y-hidden" data-testid="tabs-boutique">
            <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-products">
              <Package className="h-4 w-4 mr-2" />
              Mes Produits
              {products && <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{products.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="systemd" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-systemd">
              <Warehouse className="h-4 w-4 mr-2" />
              Produits SystemD
            </TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-orders">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Commandes
              {orders.length > 0 && <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{orders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="customers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 font-bold tracking-wide" data-testid="tab-customers">
              <Users className="h-4 w-4 mr-2" />
              Reps
              {customers.length > 0 && <Badge variant="secondary" className="ml-2 bg-background/20 text-current border-0 text-[10px] px-1.5 py-0">{customers.length}</Badge>}
            </TabsTrigger>
          </TabsList>

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
                  <div className="overflow-x-auto scrollbar-hide">
                    <Table className="min-w-[800px]">
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                          <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Produit</TableHead>
                          <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">SKU</TableHead>
                          <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Prix</TableHead>
                          <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Inventaire</TableHead>
                          {!isViewAs && <TableHead className="w-48 py-4" />}
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
                                {product.inventoryQuantity} un.
                              </Badge>
                            </TableCell>
                            {!isViewAs && (
                              <TableCell className="text-right py-4" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="font-bold opacity-0 group-hover:opacity-100 transition-opacity border-primary/20 text-primary hover:bg-primary/10 hover:text-primary"
                                  onClick={() => { setRestockProduct(product); setRestockQty(""); }}
                                  data-testid={`button-request-restock-${product.id}`}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
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
                      Demandez une intervention ou un réapprovisionnement pour ce produit spécifique.
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

          {/* ══ COMMANDES TAB ══ */}
          <TabsContent value="orders" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <div className="relative flex-1 group min-w-[200px]">
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
                  <div className="flex gap-2 px-2 pb-2 sm:pb-0 flex-wrap">
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="h-10 w-[150px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-payment-filter"><SelectValue placeholder="Paiement" /></SelectTrigger>
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
                      <SelectTrigger className="h-10 w-[150px] shrink-0 bg-muted/50 border-transparent hover:bg-muted font-medium text-sm" data-testid="select-fulfillment-filter"><SelectValue placeholder="Traitement" /></SelectTrigger>
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
                <div className="overflow-x-auto scrollbar-hide">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commande</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Acheteur</TableHead>
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
                          <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j} className="py-4"><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                        ))
                      ) : filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-[400px] text-center">
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
                                const store = encodeURIComponent(order.storeUrl);
                                const path = viewAsContactId
                                  ? `/portal/orders/${order.shopifyOrderId}?viewAs=${viewAsContactId}&store=${store}`
                                  : `/portal/orders/${order.shopifyOrderId}?store=${store}`;
                                navigate(path);
                              }}
                            >
                              <TableCell className="py-4">
                                <div className="flex flex-col">
                                  <span className="font-mono font-bold text-base text-foreground">{order.name}</span>
                                  {order.shopifyCreatedAt && (
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                                      {new Date(order.shopifyCreatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
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

          {/* ══ CLIENTS TAB ══ */}
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
                <div className="overflow-x-auto scrollbar-hide">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Client</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Localisation</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-center">Commandes</TableHead>
                        <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Total Dépensé</TableHead>
                        <TableHead className="w-12 py-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customersLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j} className="py-4"><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                        ))
                      ) : filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-[400px] text-center">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <Users className="h-10 w-10 text-muted-foreground/50" />
                              </div>
                              <h3 className="text-xl font-bold tracking-tight">Aucun client trouvé</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Votre base de données clients Shopify.
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
                                    <span className="font-bold text-sm text-foreground">{name || "Client Anonyme"}</span>
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 mt-0.5">
                                      {customer.email || "Pas d'email"}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-sm font-medium text-foreground">{location || "—"}</span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Badge variant="outline" className="font-mono text-xs border-dashed bg-muted/30">{customer.orders_count}</Badge>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <span className="font-mono font-bold text-foreground">
                                  ${Number(customer.total_spent).toFixed(2)}
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
    </CartProvider>
  );
}
