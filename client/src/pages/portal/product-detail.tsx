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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";
import { useState } from "react";

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

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
    ? `/portal/products?viewAs=${viewAsContactId}`
    : "/portal/products";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Skeleton className="lg:col-span-2 h-80 rounded-xl" />
          <Skeleton className="lg:col-span-3 h-80 rounded-xl" />
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="-ml-2 mt-0.5" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate" data-testid="text-product-name">{product.name}</h1>
          {product.sku && (
            <p className="text-sm text-muted-foreground mt-0.5">SKU: {product.sku}</p>
          )}
        </div>
        {!isViewAs && (
          <Button
            variant="outline"
            onClick={() => { setRestockOpen(true); setRestockQty(""); }}
            data-testid="button-work-order"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Work Order
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* LEFT: image + stock */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full aspect-square object-cover rounded-md"
                  data-testid="img-product"
                />
              ) : (
                <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center">
                  <Package className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock card */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Stock</p>
                <p className="text-2xl font-bold" data-testid="text-stock">{product.inventoryQuantity}</p>
              </div>
            </CardContent>
          </Card>

          {product.shopifyStatus && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant={product.shopifyStatus === "active" ? "default" : "secondary"} className="capitalize">
                {product.shopifyStatus}
              </Badge>
            </div>
          )}
        </div>

        {/* RIGHT: details */}
        <div className="lg:col-span-3 space-y-4">

          {/* Pricing & Identifiers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
              <MetaRow label="SKU" value={product.sku} />
              <MetaRow label="Barcode" value={product.barcode} />
              <MetaRow label="Price" value={product.price ? `$${Number(product.price).toFixed(2)}` : null} />
              <MetaRow label="Compare at" value={product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null} />
              <MetaRow label="Vendor" value={product.vendor} />
              <MetaRow label="Type" value={product.productType} />
              <MetaRow label="Weight" value={product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null} />
            </CardContent>
          </Card>

          {/* Tags */}
          {product.tags && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
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
