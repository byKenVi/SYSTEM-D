import { useQuery, useMutation } from "@tanstack/react-query";
import type { RestockRequest, Contact, Product } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Search, Package, Clock, CheckCircle2, Truck, PackageCheck, Trash2, ExternalLink, User, Calendar, Hash } from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const statusIcons: Record<string, any> = {
  Processing: Clock,
  Confirmed: CheckCircle2,
  Shipped: Truck,
  Delivered: PackageCheck,
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  Processing: "secondary",
  Confirmed: "default",
  Shipped: "default",
  Delivered: "default",
};

export default function AdminRestockRequests() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailRequest, setDetailRequest] = useState<RestockRequest | null>(null);
  const { toast } = useToast();

  const { data: requests, isLoading } = useQuery<RestockRequest[]>({
    queryKey: ["/api/restock-requests"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const contactMap = new Map(contacts?.map((c) => [c.id, c]) || []);
  const productMap = new Map(products?.map((p) => [p.id, p]) || []);

  const filtered = requests?.filter((r) => {
    const contact = contactMap.get(r.contactId);
    const product = productMap.get(r.productId);
    const matchesSearch =
      (contact?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (contact?.companyName || "").toLowerCase().includes(search.toLowerCase()) ||
      (product?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const allFilteredIds = filtered?.map((r) => r.id) || [];
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  }

  function toggleSelectId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("DELETE", "/api/restock-requests/bulk", { ids });
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restock-requests"] });
      setSelectedIds(new Set());
      setDetailRequest(null);
      toast({ title: `${ids.length} bon${ids.length > 1 ? "s" : ""} de travail supprimé${ids.length > 1 ? "s" : ""}` });
    },
    onError: () => {
      toast({ title: "Échec de la suppression", variant: "destructive" });
    },
  });

  const detailContact = detailRequest ? contactMap.get(detailRequest.contactId) : null;
  const detailProduct = detailRequest ? productMap.get(detailRequest.productId) : null;
  const DetailStatusIcon = detailRequest ? (statusIcons[detailRequest.status] || Clock) : Clock;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Bons de travail</h1>
          <p className="text-muted-foreground mt-1">Suivez les bons de travail et le statut des commandes Zoho</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
              disabled={deleteMutation.isPending}
              data-testid="button-bulk-delete"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
            </Button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par client ou produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[220px]"
              data-testid="input-search-restock"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="Processing">En traitement</SelectItem>
              <SelectItem value="Confirmed">Confirmé</SelectItem>
              <SelectItem value="Shipped">Expédié</SelectItem>
              <SelectItem value="Delivered">Livré</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
           ) : filtered && filtered.length > 0 ? (
             <div className="responsive-table">
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Zoho SO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => {
                  const contact = contactMap.get(req.contactId);
                  const product = productMap.get(req.productId);
                  const StatusIcon = statusIcons[req.status] || Clock;
                  const isSelected = selectedIds.has(req.id);
                  return (
                    <TableRow
                      key={req.id}
                      data-testid={`row-restock-${req.id}`}
                      data-state={isSelected ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => setDetailRequest(req)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectId(req.id)}
                          data-testid={`checkbox-restock-${req.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {contact?.companyName || contact?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {product?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {req.requestedQuantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[req.status] || "secondary"}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {req.zohoSalesOrderRef || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
             </Table>
             </div>
          ) : (
            <div className="p-12 text-center">
              <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">Aucun bon de travail</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les demandes apparaîtront lorsque les clients les soumettront.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!detailRequest} onOpenChange={(open) => { if (!open) setDetailRequest(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailRequest && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <SheetTitle>Bon de travail #{detailRequest.id}</SheetTitle>
                  <Badge variant={statusVariants[detailRequest.status] || "secondary"} className="gap-1">
                    <DetailStatusIcon className="h-3 w-3" />
                    {detailRequest.status}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="space-y-5">
                {/* Client */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium">{detailContact?.companyName || detailContact?.name || "—"}</p>
                      {detailContact?.email && <p className="text-sm text-muted-foreground">{detailContact.email}</p>}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Product */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produit</p>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium">{detailProduct?.name || "—"}</p>
                      {detailProduct?.sku && <p className="text-sm text-muted-foreground">SKU: {detailProduct.sku}</p>}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantité</p>
                    <p className="text-2xl font-bold">{detailRequest.requestedQuantity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      <span className="font-mono">{detailRequest.id}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Créé</p>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      {detailRequest.createdAt ? new Date(detailRequest.createdAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : "—"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mis à jour</p>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      {detailRequest.updatedAt ? new Date(detailRequest.updatedAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }) : "—"}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {(detailRequest as any).notes && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{(detailRequest as any).notes}</p>
                    </div>
                  </>
                )}

                {/* Zoho SO */}
                {detailRequest.zohoSalesOrderRef && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commande Zoho</p>
                      <p className="font-mono font-medium">{detailRequest.zohoSalesOrderRef}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Delete */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => deleteMutation.mutate([detailRequest.id])}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-detail"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer ce bon de travail
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
