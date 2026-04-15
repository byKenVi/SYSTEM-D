import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import type { Contact, Product, ShopifyIntegration } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import type { ElementType, ReactNode } from "react";
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
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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

function ContactAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
      <span className="text-xl font-semibold text-primary tracking-tight">{initials}</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: ElementType; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium leading-none mb-1">{label}</p>
        <div className="text-sm font-medium leading-snug">{value}</div>
      </div>
    </div>
  );
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hideEmptyRelated, setHideEmptyRelated] = useState(false);

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

  const { data: relatedContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", contactId, "related"],
    queryFn: () => fetch(`/api/contacts/${contactId}/related`, { credentials: "include" }).then(r => r.json()),
    enabled: !!contact?.companyName,
  });

  const { data: allContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const sortedContacts = allContacts ? [...allContacts].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const currentIndex = sortedContacts.findIndex((c) => c.id === contactId);
  const prevContact = currentIndex > 0 ? sortedContacts[currentIndex - 1] : null;
  const nextContact = currentIndex < sortedContacts.length - 1 ? sortedContacts[currentIndex + 1] : null;

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
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <Skeleton className="w-72 h-96 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
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

  const statusVariant = contact.status === "active" ? "default" : contact.status === "revoked" ? "destructive" : "secondary";
  const statusLabel = contact.status === "active" ? "Active" : contact.status === "revoked" ? "Revoked" : "Invited";

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── Top nav bar ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/contacts">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2" data-testid="button-back">
              <ArrowLeft className="h-3.5 w-3.5" />
              Contacts
            </Button>
          </Link>
          <span className="text-muted-foreground/40 text-sm">/</span>
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">{contact.name}</span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Switch
              id="hide-empty-related"
              checked={hideEmptyRelated}
              onCheckedChange={setHideEmptyRelated}
              data-testid="toggle-hide-empty-related"
            />
            <Label htmlFor="hide-empty-related" className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
              Hide empty related
            </Label>
          </div>

          <div className="flex items-center gap-1">
            {allContacts && currentIndex >= 0 && (
              <span className="text-xs text-muted-foreground mr-1 tabular-nums">
                {currentIndex + 1} / {sortedContacts.length}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={!prevContact}
              onClick={() => prevContact && navigate(`/admin/contacts/${prevContact.id}`)}
              title={prevContact ? `Previous: ${prevContact.name}` : undefined}
              data-testid="button-prev-contact"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={!nextContact}
              onClick={() => nextContact && navigate(`/admin/contacts/${nextContact.id}`)}
              title={nextContact ? `Next: ${nextContact.name}` : undefined}
              data-testid="button-next-contact"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex gap-5 items-start">

        {/* ══ LEFT SIDEBAR ══ */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Profile card */}
          <Card>
            <CardContent className="p-5">
              {/* Avatar + name + actions */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ContactAvatar name={contact.name} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight" data-testid="text-contact-name">{contact.name}</p>
                    {contact.companyName && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.companyName}</p>
                    )}
                    <div className="mt-1.5">
                      <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0">{statusLabel}</Badge>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" data-testid="button-contact-actions">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/portal/profile?viewAs=${contact.id}`}>
                        <Eye className="h-4 w-4 mr-2" /> View as client
                      </Link>
                    </DropdownMenuItem>
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

              <Separator className="mb-1" />

              {/* Info rows */}
              <InfoRow
                icon={Mail}
                label="Email"
                value={<span className="break-all" data-testid="text-contact-email">{contact.email}</span>}
              />
              <InfoRow
                icon={Building2}
                label="Company"
                value={contact.companyName ?? <span className="text-muted-foreground/40">—</span>}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={contact.phone ?? <span className="text-muted-foreground/40">—</span>}
              />
              <InfoRow
                icon={MapPin}
                label="Address"
                value={contact.companyAddress ?? <span className="text-muted-foreground/40">—</span>}
              />
              <InfoRow
                icon={CalendarDays}
                label="Created"
                value={contact.createdAt
                  ? new Date(contact.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                  : <span className="text-muted-foreground/40">—</span>}
              />
            </CardContent>
          </Card>

          {/* Integrations card */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground/60 font-medium">Integrations</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {/* Zoho */}
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Zoho CRM</p>
                </div>
                {contact.zohoCrmContactId ? (
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Synced</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Not synced</span>
                )}
              </div>

              {/* Shopify */}
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <SiShopify className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {integration?.shopName ?? "Shopify"}
                  </p>
                  {integration?.storeUrl && (
                    <p className="text-[11px] text-muted-foreground truncate">{integration.storeUrl}</p>
                  )}
                </div>
                {integration ? (
                  <a href={`https://${integration.storeUrl}/admin`} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Not connected</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══ RIGHT CONTENT ══ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Related Contacts — shown whenever contact has a company (unless toggle hides empty) */}
          {contact.companyName && !(hideEmptyRelated && relatedContacts && relatedContacts.length === 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Related Contacts</CardTitle>
                  {relatedContacts && (
                    <Badge variant="secondary" className="ml-auto">{relatedContacts.length}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!relatedContacts ? (
                  <div className="divide-y divide-border">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : relatedContacts.length === 0 ? (
                  <div className="h-16 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No other contacts at {contact.companyName}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {relatedContacts.map((rc) => {
                      const initials = rc.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                      return (
                        <Link key={rc.id} href={`/admin/contacts/${rc.id}`}>
                          <div
                            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                            data-testid={`row-related-contact-${rc.id}`}
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-none truncate">{rc.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{rc.email}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {rc.phone && (
                                <span className="text-xs text-muted-foreground hidden sm:block">{rc.phone}</span>
                              )}
                              <Badge
                                variant={rc.status === "active" ? "default" : rc.status === "revoked" ? "destructive" : "secondary"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {rc.status === "active" ? "Active" : rc.status === "revoked" ? "Revoked" : "Invited"}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Products table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Products</CardTitle>
                {products && (
                  <Badge variant="secondary" className="ml-auto">{products.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                          <TableCell className="text-muted-foreground text-sm font-mono">{product.sku || <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-sm">{product.price ? `$${Number(product.price).toFixed(2)}` : <span className="text-muted-foreground/40">—</span>}</TableCell>
                          <TableCell className="text-sm tabular-nums">{product.inventoryQuantity}</TableCell>
                          <TableCell className="text-sm tabular-nums">
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
                        <TableCell colSpan={6} className="h-20 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Package className="h-5 w-5 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No products imported yet</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Orders table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Orders</CardTitle>
                {ordersData?.orders && (
                  <Badge variant="secondary" className="ml-auto">{ordersData.orders.length}</Badge>
                )}
                {ordersData?.shopName && (
                  <span className="text-xs text-muted-foreground">from {ordersData.shopName}</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!contact.shopifyConnected ? (
                <div className="h-20 flex flex-col items-center justify-center gap-1.5">
                  <SiShopify className="h-5 w-5 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No Shopify store connected for this client</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
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
                            <TableCell className="text-sm max-w-[140px] truncate">
                              {order.customer
                                ? `${order.customer.first_name} ${order.customer.last_name}`
                                : order.email || <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground tabular-nums">
                              {order.line_items.length} item{order.line_items.length !== 1 ? "s" : ""}
                            </TableCell>
                            <TableCell><FinancialBadge status={order.financial_status} /></TableCell>
                            <TableCell><FulfillmentBadge status={order.fulfillment_status} /></TableCell>
                            <TableCell className="text-right font-medium text-sm tabular-nums">
                              {order.currency} {Number(order.total_price).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-20 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <ShoppingCart className="h-5 w-5 text-muted-foreground/30" />
                              <p className="text-sm text-muted-foreground">No orders found in Shopify</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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
