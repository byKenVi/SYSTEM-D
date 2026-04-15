import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import type { Product } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, RefreshCw, Tag, Layers, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useState, useMemo } from "react";

export default function PortalProductDetail({ viewAsContactId }: { viewAsContactId?: number }) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const productId = Number(id);
  const isViewAs = !!viewAsContactId;
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockQty, setRestockQty] = useState("");

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
      await apiRequest("POST", "/api/portal/restock-requests", {
        productId: product.id,
        requestedQuantity: Number(restockQty),
        contactId: product.contactId,
        status: "Processing",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/restock-requests"] });
      setRestockOpen(false);
      setRestockQty("");
      toast({ title: "Work order submitted", description: "Your work order has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit work order.", variant: "destructive" });
    },
  });

  const backHref = viewAsContactId
    ? `/portal/boutique?viewAs=${viewAsContactId}`
    : "/portal/boutique";

  // Fetch the full products list so we can derive prev/next neighbors
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
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-10 w-full mt-6" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Product not found.</p>
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">Back to Products</Button>
        </Link>
      </div>
    );
  }

  const specs = [
    { label: "SKU", value: product.sku },
    { label: "Barcode", value: product.barcode },
    { label: "Vendor", value: product.vendor },
    { label: "Type", value: product.productType },
    { label: "Weight", value: product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null },
    { label: "Compare at", value: product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null },
  ].filter((s) => s.value);

  return (
    <div className="space-y-8">
      {/* Back link + prev/next */}
      <div className="flex items-center justify-between">
        <Link href={backHref}>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Products
          </button>
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!prevId}
            onClick={() => prevId && navigate(makeProductHref(prevId))}
            data-testid="button-prev-product"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!nextId}
            onClick={() => nextId && navigate(makeProductHref(nextId))}
            data-testid="button-next-product"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">

        {/* Image */}
        <div className="rounded-2xl border bg-muted/30 aspect-square flex items-center justify-center px-6 py-6">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain rounded-xl"
              data-testid="img-product"
            />
          ) : (
            <Package className="h-24 w-24 text-muted-foreground/20" />
          )}
        </div>

        {/* Info panel */}
        <div className="space-y-6">
          {/* Name + status */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {product.shopifyStatus && (
                <Badge
                  variant={product.shopifyStatus === "active" ? "default" : "secondary"}
                  className="capitalize text-xs"
                >
                  {product.shopifyStatus}
                </Badge>
              )}
              {product.vendor && (
                <span className="text-xs text-muted-foreground">{product.vendor}</span>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-product-name">
              {product.name}
            </h1>
            {product.sku && (
              <p className="text-sm text-muted-foreground mt-1">SKU: {product.sku}</p>
            )}
          </div>

          {/* Price */}
          {product.price && (
            <div>
              <p className="text-4xl font-bold text-primary" data-testid="text-price">
                ${Number(product.price).toFixed(2)}
              </p>
            </div>
          )}

          {/* Stock */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border">
            <div className="h-10 w-10 rounded-lg bg-background border flex items-center justify-center flex-shrink-0">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Current Stock</p>
              <p className="text-2xl font-bold leading-none mt-0.5" data-testid="text-stock">
                {product.inventoryQuantity}
                <span className="text-sm font-normal text-muted-foreground ml-1.5">units</span>
              </p>
            </div>
          </div>

          {/* Description (inline if short, else below) */}
          {product.description && (
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
              {product.description}
            </p>
          )}

          <Separator />

          {/* Work Order button */}
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              if (isViewAs) {
                toast({ title: "Preview mode", description: "Clients can submit a work order here." });
                return;
              }
              setRestockOpen(true);
              setRestockQty("");
            }}
            data-testid="button-work-order"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Submit Work Order
          </Button>
        </div>
      </div>

      {/* Specs + Shopify + Tags */}
      {(specs.length > 0 || product.shopifyStoreUrl || product.tags) && (
        <Card>
          <CardContent className="p-6 space-y-6">

            {/* Specifications */}
            {specs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Specifications</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                  {specs.map((s) => (
                    <div key={s.label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{s.label}</p>
                      <p className="text-sm font-medium">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shopify Source */}
            {product.shopifyStoreUrl && (
              <>
                {specs.length > 0 && <Separator />}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
                    <SiShopify className="h-3.5 w-3.5" /> Shopify Source
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Store</p>
                      <a
                        href={`https://${product.shopifyStoreUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {product.shopifyStoreUrl.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {product.shopifyHandle && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Handle</p>
                        <a
                          href={`https://${product.shopifyStoreUrl}/products/${product.shopifyHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          {product.shopifyHandle}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {product.shopifyProductId && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Product ID</p>
                        <p className="text-sm font-medium font-mono">{product.shopifyProductId}</p>
                      </div>
                    )}
                    {product.shopifyVariantId && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Variant ID</p>
                        <p className="text-sm font-medium font-mono">{product.shopifyVariantId}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Tags */}
            {product.tags && (
              <>
                {(specs.length > 0 || product.shopifyStoreUrl) && <Separator />}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.split(",").map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-normal">{tag.trim()}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Work Order Dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{product.name}</p>
                <p className="text-xs text-muted-foreground">Current stock: {product.inventoryQuantity}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="Enter quantity"
                data-testid="input-restock-quantity"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => restockMutation.mutate()}
              disabled={!restockQty || Number(restockQty) < 1 || restockMutation.isPending}
              data-testid="button-submit-restock"
            >
              {restockMutation.isPending ? "Submitting..." : "Submit Work Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
