import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, DollarSign,
  Calendar, Tag, Shield, User, CreditCard, CheckCircle, XCircle, RefreshCw,
  Package, Truck, AlertCircle, SirenIcon,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function money(amount: string | number | null | undefined, currency = "CAD") {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  return n.toLocaleString("fr-CA", { style: "currency", currency });
}

function StateBadge({ state }: { state?: string }) {
  if (state === "enabled")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs">Actif</Badge>;
  if (state === "disabled")
    return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0 text-xs">Inactif</Badge>;
  if (state === "invited")
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0 text-xs">Invité</Badge>;
  if (state === "declined")
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0 text-xs">Refusé</Badge>;
  return <Badge variant="secondary" className="text-xs">{state ?? "—"}</Badge>;
}

function FinancialStatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    partially_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    refunded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    voided: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    partially_refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return <Badge className={`${cls} border-0 text-xs`}>{status ?? "—"}</Badge>;
}

function FulfillmentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="secondary" className="text-xs">Non expédié</Badge>;
  const map: Record<string, string> = {
    fulfilled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    unfulfilled: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    restocked: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  const labels: Record<string, string> = {
    fulfilled: "Expédié",
    partial: "Partiel",
    unfulfilled: "À expédier",
    restocked: "Remis en stock",
  };
  return <Badge className={`${cls} border-0 text-xs`}>{labels[status] ?? status}</Badge>;
}

function AddressBlock({ address }: { address: any }) {
  if (!address) return <span className="text-muted-foreground/40 text-sm">—</span>;
  const lines = [
    [address.first_name, address.last_name].filter(Boolean).join(" "),
    address.company,
    address.address1,
    address.address2,
    [address.city, address.province_code, address.zip].filter(Boolean).join(", "),
    address.country_name ?? address.country,
    address.phone,
  ].filter(Boolean);
  return (
    <div className="text-sm space-y-0.5">
      {lines.map((l, i) => <p key={i} className="text-foreground/90">{l}</p>)}
    </div>
  );
}

export default function AdminCustomerDetail() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const store = searchParams.get("store") ?? "";

  const shopifyCustomerId = params.id;

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/admin/customers", shopifyCustomerId, store],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/customers/${shopifyCustomerId}?store=${encodeURIComponent(store)}`
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!shopifyCustomerId && !!store,
  });

  const c: any = data?.customer ?? {};
  const orders: any[] = data?.orders ?? [];

  const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "—";
  const initials = ((c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")).toUpperCase() || (c.email?.[0] ?? "?").toUpperCase();
  const shopifyCustomerUrl = store && c.id ? `https://${store}/admin/customers/${c.id}` : null;

  const emailConsent: any = c.email_marketing_consent ?? {};
  const smsConsent: any = c.sms_marketing_consent ?? {};

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 flex-shrink-0"
            onClick={() => navigate("/admin/boutique?tab=customers")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {isLoading ? (
              <Skeleton className="h-8 w-56 mb-2" />
            ) : (
              <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {isLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : (
                <>
                  <StateBadge state={c.state} />
                  {c.verified_email && (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />Email vérifié
                    </Badge>
                  )}
                  {c.tax_exempt && (
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs">
                      Exonéré de taxes
                    </Badge>
                  )}
                  {data?.companyName && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <SiShopify className="h-3 w-3" /> {data.companyName}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data?.contactId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/contacts/${data.contactId}`}>
                <User className="h-3.5 w-3.5 mr-1.5" />Contact
              </Link>
            </Button>
          )}
          {shopifyCustomerUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={shopifyCustomerUrl} target="_blank" rel="noopener noreferrer" data-testid="link-shopify-customer">
                <SiShopify className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                Voir dans Shopify
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Impossible de charger le client : {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Commandes",
            value: isLoading ? null : c.orders_count ?? 0,
            icon: <ShoppingBag className="h-4 w-4 text-muted-foreground" />,
          },
          {
            label: "Dépenses totales",
            value: isLoading ? null : money(c.total_spent, c.currency ?? "CAD"),
            icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
          },
          {
            label: "Dernière commande",
            value: isLoading ? null : (c.last_order_name ?? "—"),
            icon: <Package className="h-4 w-4 text-muted-foreground" />,
          },
          {
            label: "Devise",
            value: isLoading ? null : (c.currency ?? "—"),
            icon: <CreditCard className="h-4 w-4 text-muted-foreground" />,
          },
        ].map(({ label, value, icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                {icon}
              </div>
              {isLoading ? <Skeleton className="h-6 w-20 mt-1" /> : (
                <p className="text-lg font-semibold">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />Informations de contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading ? <Skeleton className="h-20 w-full" /> : (
              <>
                {c.email && (
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-mono text-sm break-all">{c.email}</p>
                      {c.verified_email !== undefined && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.verified_email ? "✓ Vérifié" : "✗ Non vérifié"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.default_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <AddressBlock address={c.default_address} />
                  </div>
                )}
                {c.note && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-1">Note</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-2">{c.note}</p>
                  </div>
                )}
                {c.tags && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {String(c.tags).split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />{t}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Marketing & Consent */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />Consentement marketing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Email</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {emailConsent.state === "subscribed"
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="capitalize">{emailConsent.state ?? "—"}</span>
                    </div>
                    {emailConsent.opt_in_level && (
                      <p className="text-xs text-muted-foreground pl-5">{emailConsent.opt_in_level?.replace(/_/g, " ")}</p>
                    )}
                    {emailConsent.consent_updated_at && (
                      <p className="text-xs text-muted-foreground pl-5">{fmt(emailConsent.consent_updated_at)}</p>
                    )}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">SMS</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {smsConsent.state === "subscribed"
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="capitalize">{smsConsent.state ?? "—"}</span>
                    </div>
                    {smsConsent.opt_in_level && (
                      <p className="text-xs text-muted-foreground pl-5">{smsConsent.opt_in_level?.replace(/_/g, " ")}</p>
                    )}
                    {smsConsent.consent_collected_from && (
                      <p className="text-xs text-muted-foreground pl-5">Via : {smsConsent.consent_collected_from}</p>
                    )}
                    {smsConsent.consent_updated_at && (
                      <p className="text-xs text-muted-foreground pl-5">{fmt(smsConsent.consent_updated_at)}</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Addresses */}
      {!isLoading && Array.isArray(c.addresses) && c.addresses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />Adresses ({c.addresses.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {c.addresses.map((addr: any) => (
                <div key={addr.id} className={`rounded-lg border p-3 ${addr.default ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                  {addr.default && (
                    <Badge className="mb-2 text-xs bg-primary/10 text-primary border-0">Par défaut</Badge>
                  )}
                  <AddressBlock address={addr} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tax exemptions */}
      {!isLoading && c.tax_exempt && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />Exonérations de taxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(c.tax_exemptions) && c.tax_exemptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {c.tax_exemptions.map((ex: string) => (
                  <Badge key={ex} variant="secondary" className="text-xs">{ex}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Exonération générale (aucun code spécifique)</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {!isLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />Métadonnées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {[
                ["ID Shopify", c.id],
                ["Identifiant multipass", c.multipass_identifier ?? "—"],
                ["GraphQL ID", c.admin_graphql_api_id],
                ["Créé le", fmt(c.created_at as string)],
                ["Mis à jour le", fmt(c.updated_at as string)],
                ["Boutique", data?.shopName ?? store],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4 border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-xs text-right break-all">{String(value ?? "—")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Historique des commandes
            {!isLoading && <Badge variant="secondary" className="text-xs ml-1">{orders.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Aucune commande trouvée
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Commande</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut paiement</TableHead>
                    <TableHead>Expédition</TableHead>
                    <TableHead className="text-right">Articles</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order: any) => {
                    const detailUrl = `/admin/orders/${order.id}?store=${encodeURIComponent(store)}`;
                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer"
                        data-testid={`row-order-${order.id}`}
                        onClick={() => navigate(detailUrl)}
                      >
                        <TableCell className="pl-6 font-medium font-mono text-sm">{order.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell><FinancialStatusBadge status={order.financial_status} /></TableCell>
                        <TableCell><FulfillmentStatusBadge status={order.fulfillment_status} /></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {(order.line_items as any[] | undefined)?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {money(order.total_price, order.currency ?? "CAD")}
                        </TableCell>
                        <TableCell className="pr-4">
                          <a
                            href={`https://${store}/admin/orders/${order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`link-order-shopify-${order.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
