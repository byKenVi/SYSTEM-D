import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product, Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Layers,
  Users,
  ShoppingBag,
  X,
  Tag,
  Weight,
  Barcode,
  Clock,
  ExternalLink,
  ChevronDown,
  RefreshCw,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-product-detail">
        <DialogHeader>
          <DialogTitle className="text-xl" data-testid="text-detail-product-name">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div className="space-y-4">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full rounded-lg object-contain bg-muted aspect-square"
                data-testid="img-product-detail"
              />
            ) : (
              <div className="w-full rounded-lg bg-muted flex items-center justify-center aspect-square">
                <Package className="h-16 w-16 text-muted-foreground/40" />
              </div>
            )}

            {product.shopifyStoreUrl && (
              <a
                href={`https://${product.shopifyStoreUrl.replace(/^https?:\/\//, "")}/products/${product.shopifyHandle || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
                data-testid="link-view-on-shopify"
              >
                <ShoppingBag className="h-4 w-4" />
                View on Shopify
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="SKU" value={product.sku} icon={<Tag className="h-3.5 w-3.5" />} testId="text-detail-sku" />
              <DetailField label="Barcode" value={product.barcode} icon={<Barcode className="h-3.5 w-3.5" />} testId="text-detail-barcode" />
              <DetailField label="Price" value={product.price ? `$${Number(product.price).toFixed(2)}` : null} testId="text-detail-price" />
              <DetailField
                label="Compare at"
                value={product.compareAtPrice ? `$${Number(product.compareAtPrice).toFixed(2)}` : null}
                testId="text-detail-compare-price"
              />
              <DetailField
                label="Stock"
                value={String(product.inventoryQuantity)}
                className={isLow ? "text-amber-600 dark:text-amber-400 font-semibold" : "font-semibold"}
                testId="text-detail-stock"
              />
              {product.pushedToZoho && product.zohoInventoryQuantity != null && (
                <DetailField
                  label="Zoho Inventory"
                  value={String(product.zohoInventoryQuantity)}
                  className="text-primary font-semibold"
                  testId="text-detail-zoho-stock"
                />
              )}
              <DetailField label="Client" value={contact?.companyName || contact?.name} testId="text-detail-client" />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Vendor" value={product.vendor} testId="text-detail-vendor" />
              <DetailField label="Type" value={product.productType} testId="text-detail-type" />
              <DetailField
                label="Weight"
                value={product.weight ? `${product.weight} ${product.weightUnit || ""}`.trim() : null}
                icon={<Weight className="h-3.5 w-3.5" />}
                testId="text-detail-weight"
              />
              <DetailField label="Status" value={product.shopifyStatus} testId="text-detail-status" />
            </div>

            {product.tags && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5" data-testid="container-detail-tags">
                    {product.tags.split(",").map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {product.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm leading-relaxed" data-testid="text-detail-description">{product.description}</p>
                </div>
              </>
            )}

            <Separator />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span data-testid="text-detail-synced">
                  {product.lastSyncedAt
                    ? `Last synced: ${new Date(product.lastSyncedAt).toLocaleString()}`
                    : "Never synced"}
                </span>
              </div>
              {product.pushedToZoho ? (
                <Badge variant="default" className="text-xs">Zoho Synced</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Not pushed</Badge>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  icon,
  className,
  testId,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-sm font-medium ${className || ""}`} data-testid={testId}>
        {value || "—"}
      </p>
    </div>
  );
}

export default function AdminProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
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

  const syncZohoInventoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/zoho/sync-inventory");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Zoho Inventory Synced", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to sync Zoho inventory.", variant: "destructive" });
    },
  });

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

  const totalProducts = products?.length || 0;
  const totalStock = products?.reduce((sum, p) => sum + p.inventoryQuantity, 0) || 0;
  const lowStockCount = products?.filter((p) => p.inventoryQuantity <= LOW_STOCK_THRESHOLD).length || 0;
  const uniqueClients = new Set(products?.map((p) => p.contactId)).size;

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Products & Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage products across all client accounts</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncZohoInventoryMutation.mutate()}
          disabled={syncZohoInventoryMutation.isPending}
          data-testid="button-sync-zoho-inventory"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${syncZohoInventoryMutation.isPending ? "animate-spin" : ""}`} />
          {syncZohoInventoryMutation.isPending ? "Syncing..." : "Sync Zoho Inventory"}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clients</p>
              <p className="text-2xl font-bold" data-testid="text-total-clients">{uniqueClients}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Products</p>
              <p className="text-2xl font-bold" data-testid="text-total-products">{totalProducts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Layers className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Stock</p>
              <p className="text-2xl font-bold" data-testid="text-total-stock">{totalStock.toLocaleString()}</p>
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
              <p className="text-2xl font-bold" data-testid="text-low-stock">{lowStockCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
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
              <SelectTrigger className="w-[180px]" data-testid="select-client-filter">
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
          <div className="flex items-center gap-2">
            {filtered && filtered.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAll}
                data-testid="button-select-all-global"
              >
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                  className="mr-1.5 pointer-events-none"
                />
                {filtered.every((p) => selected.has(p.id)) ? "Deselect All" : "Select All"}
              </Button>
            )}
            {selected.size > 0 && (
              <Button
                onClick={() => pushToZohoMutation.mutate(Array.from(selected))}
                disabled={pushToZohoMutation.isPending}
                data-testid="button-bulk-push-zoho"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Push {selected.size} to Zoho
              </Button>
            )}
          </div>
        </CardHeader>
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
                    <Table>
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
                          <TableHead className="text-right">Stock</TableHead>
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
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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
    </div>
  );
}
