import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import type { Contact, Product, ShopifyIntegration } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  Mail,
  Building2,
  Phone,
  MapPin,
  CalendarDays,
  Send,
  ShieldOff,
  Trash2,
  Eye,
  Package,
  ShoppingCart,
  Link2,
  Link2Off,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useState } from "react";

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
  storeUrl: string | null;
  shopName: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: { id: number; title: string; quantity: number; price: string; sku: string | null; variant_title: string | null }[];
  customer?: { first_name: string; last_name: string; email: string };
}

function FinancialBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    refunded: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    partially_refunded: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    voided: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Unfulfilled</span>;
  const map: Record<string, string> = {
    fulfilled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    partial: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    restocked: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: contact, isLoading: contactLoading } = useQuery<Contact>({
    queryKey: ["/api/contacts", contactId],
    queryFn: () => fetch(`/api/contacts/${contactId}`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); }),
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/contacts", contactId, "products"],
    queryFn: () => fetch(`/api/contacts/${contactId}/products`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<ShopifyOrdersResponse>({
    queryKey: ["/api/contacts", contactId, "shopify-orders"],
    queryFn: () => fetch(`/api/contacts/${contactId}/shopify-orders`, { credentials: "include" }).then(r => r.json()),
    enabled: !!contact?.shopifyConnected,
  });

  const { data: shopifyIntegrations } = useQuery<ShopifyIntegration[]>({
    queryKey: ["/api/contacts", contactId, "shopify-integrations"],
    queryFn: () => fetch(`/api/contacts/${contactId}/shopify-integrations`, { credentials: "include" }).then(r => r.json()),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/contacts/${contactId}/resend-invite`),
    onSuccess: () => toast({ title: "Invite sent", description: "The invitation email has been sent." }),
    onError: () => toast({ title: "Error", description: "Failed to send invite.", variant: "destructive" }),
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/contacts/${contactId}/revoke-access`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setRevokeOpen(false);
      toast({ title: "Access revoked" });
    },
    onError: () => toast({ title: "Error", description: "Failed to revoke access.", variant: "destructive" }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      navigate("/admin/contacts");
      toast({ title: "Contact deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete contact.", variant: "destructive" }),
  });

  if (contactLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-muted-foreground">Contact not found</p>
        <Link href="/admin/contacts"><Button variant="outline" size="sm">Back to Contacts</Button></Link>
      </div>
    );
  }

  const integration = shopifyIntegrations?.[0];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/contacts">
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-contact-name">{contact.name}</h1>
              <Badge variant={contact.status === "active" ? "default" : contact.status === "revoked" ? "destructive" : "secondary"}>
                {contact.status === "active" ? "Active" : contact.status === "revoked" ? "Revoked" : "Invited"}
              </Badge>
            </div>
            {contact.companyName && (
              <p className="text-muted-foreground text-sm mt-0.5">{contact.companyName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/portal/profile?viewAs=${contact.id}`}>
            <Button size="sm" variant="outline" data-testid="button-view-as">
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              View as client
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-9 w-9" data-testid="button-contact-actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(contact.status === "invited" || contact.status === "revoked") && (
                <DropdownMenuItem onClick={() => resendInviteMutation.mutate()} disabled={resendInviteMutation.isPending} data-testid="button-send-invite">
                  <Send className="h-4 w-4 mr-2" /> Send invite
                </DropdownMenuItem>
              )}
              {contact.status === "active" && (
                <DropdownMenuItem className="text-amber-600 focus:text-amber-600" onClick={() => setRevokeOpen(true)} data-testid="button-revoke">
                  <ShieldOff className="h-4 w-4 mr-2" /> Revoke access
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)} data-testid="button-delete">
                <Trash2 className="h-4 w-4 mr-2" /> Delete contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Contact Info Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium truncate" data-testid="text-contact-email">{contact.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Company</p>
              <p className="text-sm font-medium truncate">{contact.companyName || <span className="text-muted-foreground/50">—</span>}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Phone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium">{contact.phone || <span className="text-muted-foreground/50">—</span>}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="text-sm font-medium truncate">{contact.companyAddress || <span className="text-muted-foreground/50">—</span>}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium">
                {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Zoho CRM</p>
              {contact.zohoCrmContactId ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Synced</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Link2Off className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">Not synced</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Shopify Store Info ── */}
      {integration && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <SiShopify className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Shopify Store</p>
              <p className="text-sm font-medium">{integration.shopName || integration.storeUrl}</p>
            </div>
            <a href={`https://${integration.storeUrl}/admin`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <ExternalLink className="h-3.5 w-3.5" /> Open in Shopify
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* ── Products Related List ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Products</CardTitle>
            {products && <Badge variant="secondary" className="ml-auto">{products.length}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-hide">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Zoho Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : products && products.length > 0 ? (
                  products.map((product) => (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell className="font-medium max-w-[200px] truncate">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{product.sku || <span className="opacity-40">—</span>}</TableCell>
                      <TableCell className="text-sm">{product.price ? `$${Number(product.price).toFixed(2)}` : <span className="text-muted-foreground/40">—</span>}</TableCell>
                      <TableCell className="text-sm">{product.inventoryQuantity}</TableCell>
                      <TableCell className="text-sm">
                        {product.zohoInventoryQuantity != null ? (
                          <span className="text-violet-600 dark:text-violet-400 font-medium">{product.zohoInventoryQuantity}</span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell>
                        {product.pushedToZoho ? (
                          <Badge variant="outline" className="text-xs gap-1 text-violet-600 border-violet-300 dark:text-violet-400 dark:border-violet-700">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Zoho
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Local</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                      No products imported yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Shopify Orders Related List ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Shopify Orders</CardTitle>
            {ordersData?.orders && <Badge variant="secondary" className="ml-auto">{ordersData.orders.length}</Badge>}
            {ordersData?.shopName && (
              <span className="text-xs text-muted-foreground ml-1">from {ordersData.shopName}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!contact.shopifyConnected ? (
            <div className="h-24 flex flex-col items-center justify-center gap-1.5">
              <SiShopify className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No Shopify store connected for this client</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Fulfillment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : ordersData?.orders && ordersData.orders.length > 0 ? (
                    ordersData.orders.map((order) => (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-medium font-mono text-sm">{order.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-sm max-w-[150px] truncate">
                          {order.customer
                            ? `${order.customer.first_name} ${order.customer.last_name}`
                            : order.email || <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{order.line_items.length} item{order.line_items.length !== 1 ? "s" : ""}</span>
                        </TableCell>
                        <TableCell><FinancialBadge status={order.financial_status} /></TableCell>
                        <TableCell><FulfillmentBadge status={order.fulfillment_status} /></TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {order.currency} {Number(order.total_price).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground text-sm">
                        No orders found in Shopify
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke access for {contact.name}?</DialogTitle>
            <DialogDescription>
              This will remove their ability to log in to the client portal. Their contact record will remain and you can resend an invite later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => revokeAccessMutation.mutate()} disabled={revokeAccessMutation.isPending} data-testid="button-confirm-revoke">
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {contact.name}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the contact and all their associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteContactMutation.mutate()} disabled={deleteContactMutation.isPending} data-testid="button-confirm-delete">
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
