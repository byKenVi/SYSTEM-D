import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Package,
  AlertTriangle,
  Search,
  RefreshCw,
  Layers,
} from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LOW_STOCK_THRESHOLD = 10;

export default function PortalProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState("");

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/portal/products"],
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
      toast({ title: "Request submitted", description: "Your restock request has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit restock request.", variant: "destructive" });
    },
  });

  const filtered = products
    ?.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "stock-asc") return a.inventoryQuantity - b.inventoryQuantity;
      if (sortBy === "stock-desc") return b.inventoryQuantity - a.inventoryQuantity;
      return a.name.localeCompare(b.name);
    });

  const totalStock = products?.reduce((sum, p) => sum + p.inventoryQuantity, 0) || 0;
  const lowStockCount = products?.filter((p) => p.inventoryQuantity <= LOW_STOCK_THRESHOLD).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Products & Inventory</h1>
        <p className="text-muted-foreground mt-1">View your products and current stock levels</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Products</p>
              <p className="text-2xl font-bold" data-testid="text-portal-total-products">{products?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Layers className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Stock</p>
              <p className="text-2xl font-bold" data-testid="text-portal-total-stock">{totalStock.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold" data-testid="text-portal-low-stock">{lowStockCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-portal-products"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px]" data-testid="select-sort-products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="stock-asc">Stock: Low to High</SelectItem>
              <SelectItem value="stock-desc">Stock: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => {
                  const isLow = product.inventoryQuantity <= LOW_STOCK_THRESHOLD;
                  return (
                    <TableRow key={product.id} data-testid={`row-portal-product-${product.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-9 w-9 rounded-md object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium">{product.name}</span>
                            {product.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {product.sku || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {product.price ? `$${Number(product.price).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          <span className={isLow ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                            {product.inventoryQuantity}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRestockProduct(product);
                            setRestockQty("");
                          }}
                          data-testid={`button-request-restock-${product.id}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Restock
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">No products found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your admin will import products from your Shopify store.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!restockProduct} onOpenChange={() => setRestockProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Restock</DialogTitle>
          </DialogHeader>
          {restockProduct && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{restockProduct.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Current stock: {restockProduct.inventoryQuantity}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quantity to Restock</Label>
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
                {restockMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
