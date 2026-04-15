import { useQuery } from "@tanstack/react-query";
import type { RestockRequest, Product } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  Package,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function PortalRestock({ viewAsContactId }: { viewAsContactId?: number }) {
  const { data: requests, isLoading } = useQuery<RestockRequest[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "restock-requests"]
      : ["/api/portal/restock-requests"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "products"]
      : ["/api/portal/products"],
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) || []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Bons de travail</h1>
        <p className="text-muted-foreground mt-1">Suivez l'historique et le statut de vos bons de travail</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <h3 className="font-semibold">Historique des demandes</h3>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : requests && requests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Référence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const product = productMap.get(req.productId);
                  const StatusIcon = statusIcons[req.status] || Clock;
                  return (
                    <TableRow key={req.id} data-testid={`row-portal-restock-${req.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{product?.name || "—"}</span>
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
          ) : (
            <div className="p-12 text-center">
              <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">Aucun bon de travail pour l'instant</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les bons de travail peuvent être soumis depuis votre page Produits.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
