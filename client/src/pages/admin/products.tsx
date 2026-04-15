import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product, Contact } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  AlertTriangle,
  Search,
  Upload,
  Users,
  ShoppingBag,
  X,
  Tag,
  Weight,
  Barcode,
  Clock,
  ExternalLink,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";

const LOW_STOCK_THRESHOLD = 10;

function ProductDetailDialog({
  product,
  contact,
  open,
  onClose,
}: {
  product: Product;
  contact?: Contact;
  open: boolean;
  onClose: () => void;
}) {
  const isLow = product.inventoryQuantity <= LOW_STOCK_THRESHOLD;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide p-0 gap-0"
        data-testid="dialog-product-detail"
      >
        {/* Header bar */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Product Detail</p>
            <h2 className="text-lg font-bold leading-tight" data-testid="text-detail-product-name">
              {product.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
            {product.pushedToZoho ? (
              <Badge className="bg-violet-600 hover:bg-violet-600 text-white text-xs" data-testid="badge-zoho-synced">
                Zoho Synced
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Not in Zoho</Badge>
            )}
            {product.shopifyStatus && (
              <Badge
                variant={product.shopifyStatus === "active" ? "default" : "secondary"}
                className="text-xs capitalize"
                data-testid="text-detail-status"
              >
                {product.shopifyStatus}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Left: image + shopify link */}
          <div className="md:w-56 flex-shrink-0 p-5 flex flex-col gap-4 border-b md:border-b-0 md:border-r">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full rounded-xl object-contain bg-muted aspect-square"
                data-testid="img-product-detail"
              />
            ) : (
              <div className="w-full rounded-xl bg-muted flex items-center justify-center aspect-square">
                <Package className="h-14 w-14 text-muted-foreground/30" />
              </div>
            )}

            {/* Stat pills */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Price</p>
                <p className="text-sm font-bold" data-testid="text-detail-price">
                  {product.price ? `$${Number(product.price).toFixed(2)}` : "—"}
                </p>
              </div>
              <div className={`rounded-lg px-3 py-2.5 text-center ${isLow ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/60"}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Shopify Stock</p>
                <p
                  className={`text-sm font-bold ${isLow ? "text-amber-600 dark:text-amber-400" : ""}`}
                  data-testid="text-detail-stock"
                >
                  {product.inventoryQuantity}
                </p>
              </div>
              {product.pushedToZoho && product.zohoInventoryQuantity != null && (
                <div className="col-span-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-3 py-2.5 text-center">
                  <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Zoho Stock</p>
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400" data-testid="text-detail-zoho-stock">
                    {product.zohoInventoryQuantity}
                  </p>
                </div>
              )}
            </div>

            {product.shopifyStoreUrl && (
              <a
                href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}/products/${product.shopifyHandle || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                data-testid="link-view-on-shopify"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                View on Shopify
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Right: details */}
          <div className="flex-1 min-w-0 p-5 space-y-5">
            {/* Identifiers */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <MetaRow label="SKU" value={product.sku} testId="text-detail-sku" />
              <MetaRow label="Barcode" value={product.barcode} testId="text-detail-barcode" />
              <MetaRow label="Compare at" value={product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null} testId="text-detail-compare-price" />
              <MetaRow label="Client" value={contact?.companyName || contact?.name} testId="text-detail-client" />
            </div>

            <div className="h-px bg-border" />

            {/* Catalog info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <MetaRow label="Vendor" value={product.vendor} testId="text-detail-vendor" />
              <MetaRow label="Type" value={product.productType} testId="text-detail-type" />
              <MetaRow
                label="Weight"
                value={product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null}
                testId="text-detail-weight"
              />
            </div>

            {product.tags && (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5" data-testid="container-detail-tags">
                    {product.tags.split(",").map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-normal">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {product.description && (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Description</p>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-detail-description">
                    {product.description}
                  </p>
                </div>
              </>
            )}

            <div className="h-px bg-border" />

            {/* Footer */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-detail-synced">
              <Clock className="h-3 w-3" />
              {product.lastSyncedAt
                ? `Last synced ${new Date(product.lastSyncedAt).toLocaleString()}`
                : "Never synced"}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({
  label,
  value,
  testId,
}: {
  label: string;
  value?: string | null;
  testId?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium truncate" data-testid={testId}>{value || "—"}</p>
    </div>
  );
}

export default function AdminProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const toggleCollapse = (contactId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const pushToZohoMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      await apiRequest("POST", "/api/products/push-to-zoho", { productIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelected(new Set());
      toast({ title: "Success", description: "Products pushed to Zoho Inventory." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to push products.", variant: "destructive" });
    },
  });


  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      await apiRequest("DELETE", `/api/products/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Product has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete product.", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("DELETE", "/api/products", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      toast({ title: "Deleted", description: `${selected.size} product${selected.size !== 1 ? "s" : ""} deleted.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete products.", variant: "destructive" });
    },
  });

  const handleDeleteClick = (product: Product) => {
    if (product.shopifyStoreUrl) {
      setDeleteTarget(product);
    } else {
      deleteProductMutation.mutate(product.id);
    }
  };

  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);

  const filtered = products?.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || "").toLowerCase().includes(search.toLowerCase());
    const matchesClient = clientFilter === "all" || p.contactId === Number(clientFilter);
    return matchesSearch && matchesClient;
  });

  const groupedByClient = (() => {
    if (!filtered) return [];
    const groups = new Map<number, Product[]>();
    for (const p of filtered) {
      if (!groups.has(p.contactId)) groups.set(p.contactId, []);
      groups.get(p.contactId)!.push(p);
    }
    return Array.from(groups.entries()).map(([contactId, items]) => ({
      contactId,
      contact: contactMap.get(contactId),
      products: items,
    }));
  })();


  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (!filtered) return;
    const allFilteredSelected = filtered.every((p) => selected.has(p.id));
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Products</h1>
          <p className="text-muted-foreground mt-1">Manage products across all client accounts</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap w-full sm:w-auto">
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products, SKU, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-products"
            />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-client-filter">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {contacts?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.companyName || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {filtered && filtered.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              data-testid="button-select-all-global"
            >
              <div className={`h-4 w-4 mr-1.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${filtered.every((p) => selected.has(p.id)) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                {filtered.every((p) => selected.has(p.id)) && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6 9 17l-5-5"/></svg>
                )}
              </div>
              {filtered.every((p) => selected.has(p.id)) ? "Deselect All" : "Select All"}
            </Button>
          )}
          {selected.size > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteConfirm(true)}
                disabled={bulkDeleteMutation.isPending}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete {selected.size}
              </Button>
              <Button
                size="sm"
                onClick={() => pushToZohoMutation.mutate(Array.from(selected))}
                disabled={pushToZohoMutation.isPending}
                data-testid="button-bulk-push-zoho"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Push {selected.size} to Zoho
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : groupedByClient.length > 0 ? (
            <div className="divide-y">
              {groupedByClient.map((group) => {
                const clientName = group.contact?.companyName || group.contact?.name || group.contact?.email || "Unknown Client";
                const groupProductCount = group.products.length;
                const groupStock = group.products.reduce((sum, p) => sum + p.inventoryQuantity, 0);
                const groupLow = group.products.filter((p) => p.inventoryQuantity <= LOW_STOCK_THRESHOLD).length;

                const isCollapsed = collapsedGroups.has(group.contactId);

                return (
                  <div key={group.contactId} data-testid={`group-client-${group.contactId}`}>
                    <button
                      type="button"
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-b w-full text-left hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCollapse(group.contactId)}
                      data-testid={`button-toggle-group-${group.contactId}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        />
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Users className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-semibold text-sm" data-testid={`text-group-client-name-${group.contactId}`}>
                          {clientName}
                        </span>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {groupProductCount} {groupProductCount === 1 ? "product" : "products"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{groupStock.toLocaleString()} in stock</span>
                        {groupLow > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {groupLow} low
                          </span>
                        )}
                      </div>
                    </button>
                    {!isCollapsed && (
                    <div className="overflow-x-auto scrollbar-hide">
                    <Table className="min-w-[800px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={group.products.every((p) => selected.has(p.id))}
                              onCheckedChange={() => {
                                const allSelected = group.products.every((p) => selected.has(p.id));
                                const next = new Set(selected);
                                group.products.forEach((p) => {
                                  if (allSelected) next.delete(p.id);
                                  else next.add(p.id);
                                });
                                setSelected(next);
                              }}
                              data-testid={`checkbox-select-all-${group.contactId}`}
                            />
                          </TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Shopify Stock</TableHead>
                          <TableHead className="text-right">Zoho Stock</TableHead>
                          <TableHead>Zoho</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.products.map((product) => {
                          const isLow = product.inventoryQuantity <= LOW_STOCK_THRESHOLD;
                          return (
                            <TableRow
                              key={product.id}
                              data-testid={`row-product-${product.id}`}
                              className="cursor-pointer"
                              onClick={() => setSelectedProduct(product)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selected.has(product.id)}
                                  onCheckedChange={() => toggleSelect(product.id)}
                                  data-testid={`checkbox-product-${product.id}`}
                                />
                              </TableCell>
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
                                  <span className="font-medium" data-testid={`text-product-name-${product.id}`}>
                                    {product.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground font-mono text-sm">
                                {product.sku || "—"}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {product.shopifyStoreUrl ? (
                                  <div className="flex items-center gap-1.5">
                                    <ShoppingBag className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                    <a
                                      href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[120px]"
                                      title={`Shopify ID: ${product.shopifyProductId}`}
                                      data-testid={`link-shopify-store-${product.id}`}
                                    >
                                      {product.shopifyStoreUrl.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "")}
                                    </a>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Manual</span>
                                )}
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
                              <TableCell className="text-right font-mono text-sm" data-testid={`text-zoho-stock-${product.id}`}>
                                {product.pushedToZoho && product.zohoInventoryQuantity != null ? (
                                  <span className="text-primary">{product.zohoInventoryQuantity}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {product.pushedToZoho ? (
                                  <Badge variant="default" className="text-xs">Synced</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Not pushed</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {!product.pushedToZoho && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => pushToZohoMutation.mutate([product.id])}
                                      disabled={pushToZohoMutation.isPending}
                                      data-testid={`button-push-zoho-${product.id}`}
                                    >
                                      <Upload className="h-3.5 w-3.5 mr-1" />
                                      Push
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteClick(product)}
                                    disabled={deleteProductMutation.isPending}
                                    data-testid={`button-delete-product-${product.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
              <p className="text-muted-foreground font-medium">No products found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Import products from client Shopify stores in Settings.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProduct && (
        <ProductDetailDialog
          product={selectedProduct}
          contact={contactMap.get(selectedProduct.contactId)}
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} product{selected.size !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This will permanently remove {selected.size} selected product{selected.size !== 1 ? "s" : ""} from your inventory. Any Shopify-sourced products will not be deleted from Shopify but may be re-imported on the next sync.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)} data-testid="button-cancel-bulk-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              Delete {selected.size} product{selected.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shopify product?</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.name}" was imported from Shopify ({deleteTarget?.shopifyStoreUrl?.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "")}). Deleting it here will not remove it from Shopify, but it will no longer appear in your inventory and may be re-imported on the next sync.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteProductMutation.mutate(deleteTarget.id)}
              disabled={deleteProductMutation.isPending}
              data-testid="button-confirm-delete-product"
            >
              Delete Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
