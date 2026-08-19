import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart, type SystemdProduct } from "@/contexts/cart-context";
import {
  Package,
  ArrowLeft,
  ShoppingCart,
  Plus,
  Minus,
  AlertCircle,
  ShieldAlert,
  Clock,
  Tag,
  Ruler,
} from "lucide-react";

function money(amount: number | string | null | undefined, currency = "CAD") {
  if (amount === null || amount === undefined) return "—";
  return Number(amount).toLocaleString("fr-CA", { style: "currency", currency });
}

export default function PortalSystemdProductDetail({
  viewAsContactId,
}: {
  viewAsContactId?: number;
}) {
  const params = useParams<{ zohoItemId: string }>();
  const zohoItemId = params.zohoItemId;
  const [, navigate] = useLocation();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [cartFeedback, setCartFeedback] = useState("");

  const requestedReturnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  const defaultBackUrl = viewAsContactId
    ? `/portal/boutique?tab=systemd&viewAs=${viewAsContactId}`
    : "/portal/boutique?tab=systemd";
  const backUrl = requestedReturnTo.startsWith("/portal/boutique") ? requestedReturnTo : defaultBackUrl;

  const {
    data: product,
    isLoading,
    error,
    isError,
  } = useQuery<SystemdProduct>({
    queryKey: ["/api/portal/systemd-products", zohoItemId],
    queryFn: async () => {
      const r = await fetch(`/api/portal/systemd-products/${zohoItemId}`, {
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const err = new Error(body.message || `HTTP ${r.status}`);
        (err as any).status = r.status;
        (err as any).code = body.code;
        throw err;
      }
      return r.json();
    },
    retry: false,
    enabled: !!zohoItemId,
  });

  const handleAddToCart = () => {
    if (!product || product.stock <= 0 || cartFeedback) return;
    addItem(product, qty);
    setCartFeedback("Le panier a été mis à jour.");
    window.setTimeout(() => navigate(backUrl), 650);
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="space-y-6 animate-in">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,440px)_1fr] gap-8">
          <Skeleton className="aspect-square w-full max-w-[440px] rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-9 w-3/4 rounded-lg" />
            <Skeleton className="h-5 w-24 rounded-lg" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error states ── */
  if (isError) {
    const status = (error as any)?.status;
    const code = (error as any)?.code;

    if (status === 429 || code === "ZOHO_RATE_LIMITED") {
      return (
        <div className="space-y-6 animate-in">
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate(backUrl)}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la boutique
          </Button>
          <Card className="border-amber-200 dark:border-amber-500/30">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center gap-4">
              <div className="h-20 w-20 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">Quota Zoho atteint</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                La limite d'appels Zoho a été atteinte pour aujourd'hui. Ce produit sera de
                nouveau accessible demain.
              </p>
              <Button variant="outline" onClick={() => navigate(backUrl)}>
                Retour à la boutique
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (status === 403 || code === "CLIENT_PRODUCT") {
      return (
        <div className="space-y-6 animate-in">
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate(backUrl)}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la boutique
          </Button>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center gap-4">
              <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-10 w-10 text-destructive" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">Produit non disponible</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                Ce produit n'est pas disponible dans le catalogue Système D.
              </p>
              <Button variant="outline" onClick={() => navigate(backUrl)}>
                Retour à la boutique
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (status === 404) {
      return (
        <div className="space-y-6 animate-in">
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate(backUrl)}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la boutique
          </Button>
          <Card className="border-border/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center gap-4">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center">
                <Package className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">Produit introuvable</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                Ce produit n'existe pas ou n'est plus disponible dans l'inventaire Zoho.
              </p>
              <Button variant="outline" onClick={() => navigate(backUrl)}>
                Retour à la boutique
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    /* 503 (UNVERIFIABLE) ou autre erreur */
    return (
      <div className="space-y-6 animate-in">
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => navigate(backUrl)}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la boutique
        </Button>
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">
              Service temporairement indisponible
            </h3>
            <p className="text-muted-foreground max-w-sm text-sm">
              Impossible de vérifier ce produit pour le moment. Réessayez dans quelques instants.
            </p>
            <Button variant="outline" onClick={() => navigate(backUrl)}>
              Retour à la boutique
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!product) return null;

  const inStock = product.stock > 0;

  return (
    <div className="space-y-6 animate-in">
      {/* Retour */}
      <Button
        variant="ghost"
        className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => navigate(backUrl)}
        data-testid="button-back-to-boutique"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la boutique
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,440px)_1fr] gap-8 items-start">
        {/* Image */}
        <div className="mx-auto aspect-square w-full max-w-[440px] rounded-2xl overflow-hidden border bg-muted/30 flex items-center justify-center">
          <img
            src={product.imageUrl || ""}
            alt={product.name}
            className="w-full h-full object-contain p-4"
            style={{ display: product.imageUrl ? undefined : "none" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty(
                "display",
                "flex"
              );
            }}
          />
          <span
            className="w-full h-full items-center justify-center"
            style={{ display: product.imageUrl ? "none" : "flex" }}
          >
            <Package className="h-32 w-32 text-muted-foreground/20" />
          </span>
        </div>

        {/* Détails */}
        <div className="space-y-6">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-foreground"
              data-testid="text-systemd-product-name"
            >
              {product.name}
            </h1>
            {product.sku && (
              <Badge variant="outline" className="font-mono text-xs border-dashed mt-2">
                {product.sku}
              </Badge>
            )}
          </div>

          {/* Prix + Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-card">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Prix
              </p>
              <p
                className="text-2xl font-mono font-bold text-foreground"
                data-testid="text-systemd-product-price"
              >
                {money(product.price)}
              </p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                inStock
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                  : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Stock
              </p>
              <p
                className={`text-2xl font-mono font-bold ${
                  inStock
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
                data-testid="text-systemd-product-stock"
              >
                {product.stock} un.
              </p>
            </div>
          </div>

          {/* Description — toujours affichée, avec fallback */}
          <div className="p-4 rounded-xl border bg-muted/20">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Description
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              {product.description || <span className="text-muted-foreground italic">Aucune description disponible.</span>}
            </p>
          </div>

          {/* Spécifications */}
          {(product.productType || product.unit) && (
            <div className="p-4 rounded-xl border bg-card">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Spécifications
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                {product.productType && (
                  <>
                    <dt className="text-xs text-muted-foreground font-medium">Catégorie</dt>
                    <dd className="text-xs font-bold text-foreground text-right">{product.productType}</dd>
                  </>
                )}
                {product.unit && (
                  <>
                    <dt className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Ruler className="h-3 w-3" /> Unité</dt>
                    <dd className="text-xs font-bold text-foreground text-right">{product.unit}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Disponibilité */}
          {product.status && (
            <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Disponibilité</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2 w-2 rounded-full ${
                  product.status === "active" ? "bg-emerald-500" :
                  product.status === "inactive" ? "bg-slate-400" : "bg-amber-400"
                }`} />
                <Badge variant="outline" className={`text-xs font-bold ${
                  product.status === "active"
                    ? "border-emerald-200 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
                    : "border-slate-200 text-slate-600 dark:text-slate-400"
                }`}>
                  {product.status === "active" ? "Actif" :
                   product.status === "inactive" ? "Inactif" : product.status}
                </Badge>
              </div>
            </div>
          )}

          {/* Quantité + Panier */}
          {inStock ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Quantité
                </Label>
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
                    onChange={(e) =>
                      setQty(Math.max(1, Math.min(product.stock, Number(e.target.value))))
                    }
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
                <p className="text-xs text-muted-foreground">
                  Sous-total :{" "}
                  <span className="font-mono font-bold text-foreground">
                    {money(product.price * qty)}
                  </span>
                </p>
              </div>

              <Button
                className="w-full h-12 font-bold text-base shadow-lg shadow-primary/20"
                onClick={handleAddToCart}
                disabled={Boolean(cartFeedback)}
                data-testid="button-add-to-cart"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                {cartFeedback ? "Ajouté au panier" : "Ajouter au panier"}
              </Button>
              <p
                className={`min-h-5 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400 transition-opacity ${cartFeedback ? "opacity-100" : "opacity-0"}`}
                role="status"
                aria-live="polite"
              >
                {cartFeedback}
              </p>

            </div>
          ) : (
            <Button
              className="w-full h-12 font-bold text-base"
              disabled
              data-testid="button-add-to-cart-disabled"
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              Rupture de stock
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
