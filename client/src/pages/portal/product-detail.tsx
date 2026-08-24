import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import type { Product } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, Wrench, Tag, Layers, ChevronLeft, ChevronRight, Hash, DollarSign, Box, ShoppingCart, CreditCard } from "lucide-react";
import { useState, useMemo } from "react";

export default function PortalProductDetail({ viewAsContactId }: { viewAsContactId?: number }) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const productId = Number(id);
  const isViewAs = !!viewAsContactId;
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockQty, setRestockQty] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState("1");

  const { data: repsData, isLoading: creditLoading, isError: creditUnavailable } = useQuery<{ reps: Array<{ balance: string; currency: string; isCurrentContact: boolean }> }>({
    queryKey: ["/api/portal/mapi/reps", "product-checkout"],
    queryFn: async () => {
      const response = await fetch("/api/portal/mapi/reps", { credentials: "include" });
      if (!response.ok) throw new Error("Crédit Shopify indisponible");
      return response.json();
    },
    enabled: !isViewAs,
    staleTime: 60_000,
    retry: false,
  });
  const currentRep = repsData?.reps?.find((rep) => rep.isCurrentContact);

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products", productId]
      : ["/api/portal/products", productId],
    queryFn: () => {
      const url = viewAsContactId
        ? `/api/admin/view-as/${viewAsContactId}/products/${productId}`
        : `/api/portal/products/${productId}`;
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const response = await apiRequest("POST", "/api/portal/product-work-orders", {
        productId: product.id,
        requestedQuantity: Number(restockQty),
      });
      return response.json();
    },
    onSuccess: (submission: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/forms"] });
      setRestockOpen(false);
      setRestockQty("");
      toast({ title: "Bon de Travail soumis", description: "Cette demande n’est pas une commande payée. L’équipe Système D doit l’analyser avant traitement." });
      if (submission?.id) navigate(`/portal/forms/${submission.id}`);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la soumission du bon de travail.", variant: "destructive" });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const response = await apiRequest("POST", "/api/portal/product-checkout", {
        productId: product.id,
        quantity: Number(purchaseQty),
      });
      return response.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/systemd-orders"] });
      setPurchaseOpen(false);
      toast({ title: "Commande payée", description: "Le Store Credit Shopify du rep a été débité." });
      if (order?.url) navigate(order.url);
    },
    onError: (error: any) => {
      toast({ title: "Paiement impossible", description: error?.message || "Le Store Credit n’a pas pu être débité.", variant: "destructive" });
    },
  });

  const backHref = viewAsContactId
    ? `/portal/boutique?viewAs=${viewAsContactId}`
    : "/portal/boutique";

  const { data: allProducts } = useQuery<Product[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products"]
      : ["/api/portal/products"],
    queryFn: () => {
      const url = viewAsContactId
        ? `/api/admin/view-as/${viewAsContactId}/products`
        : `/api/portal/products`;
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
  });

  const { prevId, nextId } = useMemo(() => {
    if (!allProducts || allProducts.length === 0) return { prevId: null, nextId: null };
    const sorted = [...allProducts].sort((a, b) => a.name.localeCompare(b.name));
    const idx = sorted.findIndex((p) => p.id === productId);
    return {
      prevId: idx > 0 ? sorted[idx - 1].id : null,
      nextId: idx < sorted.length - 1 ? sorted[idx + 1].id : null,
    };
  }, [allProducts, productId]);

  const makeProductHref = (pid: number) =>
    viewAsContactId ? `/portal/products/${pid}?viewAs=${viewAsContactId}` : `/portal/products/${pid}`;

  if (isLoading) {
    return (
      <div className="space-y-8 w-full">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5"><Skeleton className="aspect-square rounded-2xl w-full" /></div>
          <div className="lg:col-span-7 space-y-6">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full mt-8" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="animate-in">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="mb-6 h-10 px-4 font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la boutique
          </Button>
        </Link>
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <Package className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Produit introuvable</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Ce produit n'existe pas ou vous n'y avez pas accès.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const specs = [
    { label: "SKU", value: product.sku, icon: <Hash className="h-3 w-3" /> },
    { label: "Code-barres", value: product.barcode, icon: <Hash className="h-3 w-3" /> },
    { label: "Fournisseur", value: product.vendor, icon: <Package className="h-3 w-3" /> },
    { label: "Type", value: product.productType, icon: <Tag className="h-3 w-3" /> },
    { label: "Poids", value: product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null, icon: <Box className="h-3 w-3" /> },
    { label: "Prix comp.", value: product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null, icon: <DollarSign className="h-3 w-3" /> },
  ].filter((s) => s.value);

  const isLowStock = product.inventoryQuantity <= 5;
  const unitPrice = Number(product.price || 0);
  const insufficientCredit = !!currentRep && Number(currentRep.balance) < unitPrice;
  const immediatePurchaseBlocked = product.inventoryQuantity < 1 || !product.price || (!isViewAs && (creditLoading || creditUnavailable || !currentRep || insufficientCredit));
  const requestedTotal = unitPrice * Number(purchaseQty || 0);

  return (
    <div className="space-y-8 animate-in w-full pb-12">
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="h-10 px-4 font-bold text-muted-foreground hover:text-foreground -ml-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour au catalogue
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-card hover:bg-muted font-bold shadow-sm"
            disabled={!prevId}
            onClick={() => prevId && navigate(makeProductHref(prevId))}
            data-testid="button-prev-product"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-card hover:bg-muted font-bold shadow-sm"
            disabled={!nextId}
            onClick={() => nextId && navigate(makeProductHref(nextId))}
            data-testid="button-next-product"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

        {/* ── Left Column: Image ── */}
        <div className="lg:col-span-5 relative group">
          <div className="absolute -inset-1 bg-gradient-to-tr from-primary/20 via-transparent to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative aspect-square rounded-2xl bg-card border border-border/50 shadow-sm flex items-center justify-center p-8 overflow-hidden">
            {/* Soft grid background */}
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
            
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain rounded-xl relative z-10 drop-shadow-xl transition-transform duration-500 group-hover:scale-105"
                data-testid="img-product"
              />
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center text-muted-foreground/30">
                <Package className="h-24 w-24 mb-4" />
                <span className="font-bold uppercase tracking-widest text-xs">Aucune Image</span>
              </div>
            )}
            
          </div>
        </div>

        {/* ── Right Column: Info ── */}
        <div className="lg:col-span-7 flex flex-col h-full">
          
          <div className="mb-6">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              {product.shopifyStatus && (
                <Badge variant="outline" className={`border text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${product.shopifyStatus === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                  {product.shopifyStatus}
                </Badge>
              )}
              {product.vendor && (
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md">
                  <Package className="h-3 w-3" /> {product.vendor}
                </span>
              )}
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-3" data-testid="text-product-name">
              {product.name}
            </h1>
            
            {product.sku && (
              <p className="text-sm font-mono font-medium text-muted-foreground flex items-center gap-2">
                <Hash className="h-4 w-4" /> SKU: {product.sku}
              </p>
            )}
          </div>

          {product.price && (
            <div className="mb-8">
              <p className="text-5xl font-mono font-bold text-primary" data-testid="text-price">
                ${Number(product.price).toFixed(2)}
              </p>
            </div>
          )}

          {/* Key Metrics row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 items-start gap-4 mb-8">
            <div className={`self-start p-4 sm:p-5 rounded-2xl border bg-card shadow-sm relative overflow-hidden ${isLowStock ? 'border-red-500/30' : 'border-border/50'}`}>
              {isLowStock && <div className="absolute inset-0 bg-red-500/5" />}
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${isLowStock ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/10 border-primary/20'}`}>
                    <Layers className={`h-4 w-4 ${isLowStock ? 'text-red-500' : 'text-primary'}`} />
                  </div>
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>En inventaire</span>
                </div>
                <div className="flex items-baseline gap-2 pl-10" data-testid="text-stock">
                  <span className={`text-3xl font-mono font-bold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                    {product.inventoryQuantity}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">unités</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm flex flex-col justify-center items-start gap-3">
              <Button
                size="lg"
                className="w-full h-16 text-lg font-bold shadow-lg shadow-primary/20 hover:-translate-y-1 transition-transform duration-200"
                disabled={immediatePurchaseBlocked}
                onClick={() => {
                  if (isViewAs) {
                    toast({ title: "Mode Aperçu", description: "Le paiement est disponible uniquement dans la session du client." });
                    return;
                  }
                  setPurchaseQty("1");
                  setPurchaseOpen(true);
                }}
                data-testid="button-purchase-product"
              >
                <ShoppingCart className="h-5 w-5 mr-3" />
                Commander avec crédit
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 font-bold"
                onClick={() => {
                  if (isViewAs) {
                    toast({ title: "Mode Aperçu", description: "Les clients peuvent soumettre un bon de travail ici." });
                    return;
                  }
                  setRestockOpen(true);
                  setRestockQty("");
                }}
                data-testid="button-work-order"
              >
                <Wrench className="h-5 w-5 mr-3" />
                Bon de Travail
              </Button>
              <div className="space-y-1 text-center w-full text-xs font-medium text-muted-foreground">
                <p><strong>Commander avec crédit :</strong> achetez maintenant avec le crédit Shopify de votre compte.</p>
                <p><strong>Bon de Travail :</strong> demande spéciale non payée; aucun crédit n’est débité avant validation.</p>
                {product.inventoryQuantity < 1 && <p className="text-amber-600">Produit en rupture. Vous pouvez soumettre une demande à l’équipe Système D.</p>}
                {insufficientCredit && <p className="text-destructive font-bold">Crédit insuffisant pour commander ce produit.</p>}
                {creditUnavailable && <p className="text-destructive">Store Credit Shopify indisponible. L’achat immédiat est temporairement bloqué.</p>}
              </div>
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="p-6 rounded-2xl border border-border/50 bg-muted/20 mb-8">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">Description</p>
              <p className="text-base text-foreground leading-relaxed font-medium whitespace-pre-wrap" data-testid="text-description">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Details Section ── */}
      {(specs.length > 0 || product.tags) && (
        <div className={`mt-12 pt-12 border-t border-border/50 grid grid-cols-1 gap-8 ${specs.length > 0 && product.tags ? "lg:grid-cols-2" : ""}`}>
          
          {/* Specs */}
          {specs.length > 0 && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Box className="h-4 w-4 text-primary" /> Spécifications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {specs.map((s) => (
                    <div key={s.label} className="flex justify-between items-center px-6 py-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        {s.icon} {s.label}
                      </span>
                      <span className="font-mono text-sm font-bold text-right text-foreground max-w-[250px] truncate">{s.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {product.tags && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" /> Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-2">
                  {product.tags.split(",").map((tag, i) => (
                    <Badge key={i} variant="secondary" className="bg-muted text-foreground hover:bg-muted/80 px-3 py-1 font-bold text-xs">{tag.trim()}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Commander ce produit</DialogTitle>
            <DialogDescription>Le montant sera débité du Store Credit Shopify du rep connecté. Aucun Bon de Travail ne sera créé.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-bold">{product.name}</p>
              <p className="text-sm text-muted-foreground">{Number(product.price || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} / unité</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-quantity">Quantité</Label>
              <Input id="purchase-quantity" type="number" min="1" max={product.inventoryQuantity} value={purchaseQty} onChange={(event) => setPurchaseQty(event.target.value)} data-testid="input-purchase-quantity" />
            </div>
            <div className="flex justify-between rounded-lg bg-primary/5 p-4 font-bold">
              <span>Total Store Credit</span>
              <span>{requestedTotal.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseOpen(false)}>Annuler</Button>
            <Button onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending || Number(purchaseQty) < 1 || Number(purchaseQty) > product.inventoryQuantity || !currentRep || requestedTotal > Number(currentRep.balance)} data-testid="button-confirm-purchase">
              {purchaseMutation.isPending ? "Paiement…" : "Payer avec Store Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Work Order Dialog ── */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/50 shadow-2xl">
          <div className="bg-primary/5 p-6 border-b border-border/50 flex gap-4 items-start">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight mb-2">Créer un Bon de Travail</DialogTitle>
              <DialogDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
                Demandez une intervention physique ou un réapprovisionnement pour ce produit spécifique.
              </DialogDescription>
            </div>
          </div>
          
          <div className="p-6 bg-background space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-background border flex items-center justify-center shrink-0 overflow-hidden bg-white">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-6 w-6 text-muted-foreground/50" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-foreground truncate mb-1">{product.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] bg-muted/50">{product.sku || "Sans SKU"}</Badge>
                  <span className="text-xs font-bold text-muted-foreground">Stock: <span className="font-mono text-foreground">{product.inventoryQuantity}</span></span>
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
                className="h-14 text-lg font-mono font-bold shadow-none focus-visible:ring-1"
                data-testid="input-restock-quantity"
              />
            </div>
            
            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button variant="ghost" className="font-bold" onClick={() => setRestockOpen(false)}>
                Annuler
              </Button>
              <Button
                className="font-bold shadow-lg shadow-primary/20"
                onClick={() => restockMutation.mutate()}
                disabled={!restockQty || Number(restockQty) < 1 || restockMutation.isPending}
                data-testid="button-submit-restock"
              >
                {restockMutation.isPending ? "Création en cours..." : "Soumettre la demande"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
