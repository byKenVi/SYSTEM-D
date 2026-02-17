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
  BarChart3,
  Layers,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function AdminProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);

  const filtered = products?.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase());
    const matchesClient = clientFilter === "all" || p.contactId === Number(clientFilter);
    return matchesSearch && matchesClient;
  });

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
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Products & Inventory</h1>
        <p className="text-muted-foreground mt-1">Manage products across all client accounts</p>
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
                placeholder="Search products..."
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Zoho</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => {
                  const isLow = product.inventoryQuantity <= LOW_STOCK_THRESHOLD;
                  const contact = contactMap.get(product.contactId);
                  return (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell>
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
                      <TableCell className="text-muted-foreground">
                        {contact?.companyName || contact?.name || "—"}
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
                      <TableCell>
                        {product.pushedToZoho ? (
                          <Badge variant="default" className="text-xs">Synced</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Not pushed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
    </div>
  );
}
