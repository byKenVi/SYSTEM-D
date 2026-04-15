import { useQuery } from "@tanstack/react-query";
import type { RestockRequest, Contact, Product } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, Package, Clock, CheckCircle2, Truck, PackageCheck } from "lucide-react";
import { useState } from "react";
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

export default function AdminRestockRequests() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
      (product?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Work Orders</h1>
        <p className="text-muted-foreground mt-1">Monitor work orders and Zoho sales order status</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-restock"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Processing">Processing</SelectItem>
              <SelectItem value="Confirmed">Confirmed</SelectItem>
              <SelectItem value="Shipped">Shipped</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zoho SO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => {
                  const contact = contactMap.get(req.contactId);
                  const product = productMap.get(req.productId);
                  const StatusIcon = statusIcons[req.status] || Clock;
                  return (
                    <TableRow key={req.id} data-testid={`row-restock-${req.id}`}>
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
          ) : (
            <div className="p-12 text-center">
              <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">No work orders</p>
              <p className="text-sm text-muted-foreground mt-1">
                Requests will appear when clients submit them.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
