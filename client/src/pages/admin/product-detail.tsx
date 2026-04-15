import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import type { Product, Contact } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Package,
  ShoppingBag,
  ExternalLink,
  Trash2,
  Clock,
  AlertTriangle,
  Tag,
  Building2,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useState } from "react";

const LOW_STOCK_THRESHOLD = 10;

function MetaRow({ label, value, testId }: { label: string; value?: string | null; testId?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium" data-testid={testId}>{value || "—"}</p>
    </div>
  );
}

export default function AdminProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const productId = Number(id);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: () => fetch(`/api/products/${productId}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const contact = product ? contacts?.find(c => c.id === product.contactId) : undefined;

  const deleteProductMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Deleted", description: "Product has been deleted." });
      navigate("/admin/products");
    },
    onError: () => toast({ title: "Error", description: "Failed to delete product.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Package className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground font-medium">Product not found</p>
        <Link href="/admin/products">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Products</Button>
        </Link>
      </div>
    );
  }

  const isLow = product.inventoryQuantity <= LOW_STOCK_THRESHOLD;
  const clientName = contact?.companyName || contact?.name || `Client #${product.contactId}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/products">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Product Detail</p>
            <h1 className="text-xl font-bold tracking-tight leading-none" data-testid="text-product-name">
              {product.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            onClick={() => setDeleteOpen(true)}
            data-testid="button-delete-product"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── LEFT: image + stats ── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Image */}
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full rounded-xl object-contain bg-muted aspect-square"
                  data-testid="img-product"
                />
              ) : (
                <div className="w-full rounded-xl bg-muted flex items-center justify-center aspect-square">
                  <Package className="h-16 w-16 text-muted-foreground/20" />
                </div>
              )}

              {/* Stat pills */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Price</p>
                  <p className="text-sm font-bold" data-testid="text-price">
                    {product.price ? `$${Number(product.price).toFixed(2)}` : "—"}
                  </p>
                </div>
                <div className={`rounded-lg px-3 py-2.5 text-center ${isLow ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/60"}`}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Shopify Stock</p>
                  <p className={`text-sm font-bold ${isLow ? "text-amber-600 dark:text-amber-400" : ""}`} data-testid="text-stock">
                    {isLow && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                    {product.inventoryQuantity}
                  </p>
                </div>
                {product.pushedToZoho && product.zohoInventoryQuantity != null && (
                  <div className="col-span-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-3 py-2.5 text-center">
                    <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Zoho Stock</p>
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-400" data-testid="text-zoho-stock">
                      {product.zohoInventoryQuantity}
                    </p>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {product.pushedToZoho ? (
                  <Badge className="bg-violet-600 hover:bg-violet-600 text-white text-xs" data-testid="badge-zoho-synced">
                    Zoho Synced
                  </Badge>
                ) : (
                  <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100">Not in Zoho</Badge>
                )}
                {product.shopifyStatus && (
                  <Badge variant={product.shopifyStatus === "active" ? "default" : "secondary"} className="text-xs capitalize" data-testid="badge-shopify-status">
                    {product.shopifyStatus}
                  </Badge>
                )}
              </div>

              {/* Shopify link */}
              {product.shopifyStoreUrl && (
                <a
                  href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}/products/${product.shopifyHandle || ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors w-full"
                  data-testid="link-view-on-shopify"
                >
                  <SiShopify className="h-3.5 w-3.5" />
                  View on Shopify
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Last synced */}
              {product.lastSyncedAt && (
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1" data-testid="text-synced">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  Last synced {new Date(product.lastSyncedAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: metadata ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Identifiers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Identifiers</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
              <MetaRow label="SKU" value={product.sku} testId="text-sku" />
              <MetaRow label="Barcode" value={product.barcode} testId="text-barcode" />
              <MetaRow label="Price" value={product.price ? `$${Number(product.price).toFixed(2)}` : null} testId="text-price-meta" />
              <MetaRow label="Compare at" value={product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null} testId="text-compare-price" />
            </CardContent>
          </Card>

          {/* Catalog info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Catalog</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
              <MetaRow label="Vendor" value={product.vendor} testId="text-vendor" />
              <MetaRow label="Type" value={product.productType} testId="text-product-type" />
              <MetaRow label="Weight" value={product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null} testId="text-weight" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Client</p>
                {contact ? (
                  <Link href={`/admin/contacts/${contact.id}`}>
                    <span className="text-sm font-medium text-primary hover:underline cursor-pointer" data-testid="link-client">
                      {clientName}
                    </span>
                  </Link>
                ) : (
                  <p className="text-sm font-medium" data-testid="text-client">{clientName}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Source */}
          {product.shopifyStoreUrl && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Shopify Source</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
                <MetaRow label="Store" value={product.shopifyStoreUrl.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "")} testId="text-store" />
                <MetaRow label="Handle" value={product.shopifyHandle} testId="text-handle" />
                <MetaRow label="Product ID" value={product.shopifyProductId} testId="text-shopify-product-id" />
                <MetaRow label="Variant ID" value={product.shopifyVariantId} testId="text-shopify-variant-id" />
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {product.tags && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5" data-testid="container-tags">
                  {product.tags.split(",").map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-normal">{tag.trim()}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {product.description && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
                  {product.description}
                </p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {product.name}?</DialogTitle>
            <DialogDescription>
              {product.shopifyStoreUrl
                ? `This product was imported from Shopify. Deleting it here will not remove it from Shopify, but it may be re-imported on the next sync.`
                : `This will permanently remove the product from your inventory. This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteProductMutation.mutate()}
              disabled={deleteProductMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteProductMutation.isPending ? "Deleting…" : "Delete Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
