import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, DollarSign,
  Calendar, Tag, Shield, User, CreditCard, CheckCircle, XCircle,
  Package, AlertCircle, Wallet, TrendingUp, TrendingDown, RotateCcw, Clock,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { MapiRep, MapiRepCreditLog } from "@shared/schema";

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

function mapiMoney(amount: string | number | null | undefined, currency = "CAD") {
  const n = parseFloat(String(amount ?? "0"));
  return n.toLocaleString("fr-CA", { style: "currency", currency, minimumFractionDigits: 2 });
}

function TxnTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    credit:          { label: "Crédit",         cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", Icon: TrendingUp },
    debit:           { label: "Débit",          cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",                Icon: TrendingDown },
    monthly_renewal: { label: "Renouvellement", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",            Icon: RotateCcw },
    Credit:          { label: "Crédit",         cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", Icon: TrendingUp },
    Debit:           { label: "Débit",          cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",                Icon: TrendingDown },
    Expiration:      { label: "Expiré",         cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",        Icon: Clock },
    DebitRevert:     { label: "Réversion",      cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",    Icon: RotateCcw },
  };
  const cfg = map[type] ?? { label: type, cls: "bg-muted text-muted-foreground", Icon: Clock };
  return (
    <Badge className={`${cfg.cls} border-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md flex items-center gap-1`}>
      <cfg.Icon className="h-3 w-3" />{cfg.label}
    </Badge>
  );
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
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const store = searchParams.get("store") ?? "";
  const integrationId = searchParams.get("integrationId") ?? "";
  const requestedReturnTo = searchParams.get("returnTo") ?? "";
  const backHref = requestedReturnTo.startsWith("/admin/") ? requestedReturnTo : "/admin/boutique?tab=customers";

  const shopifyCustomerId = params.id;

  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [showDebitDialog, setShowDebitDialog] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [debitAmount, setDebitAmount] = useState("");
  const [debitReason, setDebitReason] = useState("");

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/admin/customers", shopifyCustomerId, store, integrationId],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (store) query.set("store", store);
      if (integrationId) query.set("integrationId", integrationId);
      const res = await fetch(`/api/admin/customers/${shopifyCustomerId}?${query}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!shopifyCustomerId,
  });

  const { data: mapiData, isLoading: mapiLoading } = useQuery<{ rep: MapiRep; logs: MapiRepCreditLog[]; shopifyTransactions: any[] } | null>({
    queryKey: ["/api/mapi/reps/by-shopify-customer", shopifyCustomerId],
    queryFn: async () => {
      const res = await fetch(`/api/mapi/reps/by-shopify-customer/${shopifyCustomerId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!shopifyCustomerId,
  });

  const creditMutation = useMutation({
    mutationFn: async () => {
      if (!mapiData?.rep) throw new Error("Rep introuvable");
      const res = await apiRequest("POST", `/api/mapi/reps/${mapiData.rep.id}/credit`, { amount: creditAmount, currency: "CAD", reason: creditReason });
      return res.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps/by-shopify-customer", shopifyCustomerId] });
      toast({ title: "Crédit ajouté", description: `Nouveau solde : ${mapiMoney(d.rep?.currentBalance)}` });
      setCreditAmount(""); setCreditReason(""); setShowCreditDialog(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const debitMutation = useMutation({
    mutationFn: async () => {
      if (!mapiData?.rep) throw new Error("Rep introuvable");
      const res = await apiRequest("POST", `/api/mapi/reps/${mapiData.rep.id}/debit`, { amount: debitAmount, currency: "CAD", reason: debitReason });
      return res.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps/by-shopify-customer", shopifyCustomerId] });
      toast({ title: "Débit effectué", description: `Nouveau solde : ${mapiMoney(d.rep?.currentBalance)}` });
      setDebitAmount(""); setDebitReason(""); setShowDebitDialog(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const c: any = data?.customer ?? {};
  const orders: any[] = data?.orders ?? [];

  const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "—";
  const initials = ((c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")).toUpperCase() || (c.email?.[0] ?? "?").toUpperCase();
  const shopifyCustomerUrl = store && c.id ? `https://${store}/admin/customers/${c.id}` : null;

  const emailConsent: any = c.email_marketing_consent ?? {};
  const smsConsent: any = c.sms_marketing_consent ?? {};

  return (
    <div className="flex flex-col gap-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 flex-shrink-0"
            onClick={() => navigate(backHref)}
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
      {data?.liveUnavailable && !error && (
        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10">
          <CardContent className="pt-5 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {data.warning || "Données Shopify live indisponibles. Dernières données synchronisées affichées."}
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

      {/* ── MAPI Credit Section ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Compte représentant MAPI
            </CardTitle>
            {mapiData?.rep && mapiData.rep.status === "active" && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="font-bold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10" onClick={() => setShowCreditDialog(true)} data-testid="button-credit-rep">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Créditer
                </Button>
                <Button size="sm" variant="outline" className="font-bold text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={() => setShowDebitDialog(true)} disabled={parseFloat(mapiData.rep.currentBalance ?? "0") <= 0} data-testid="button-debit-rep">
                  <TrendingDown className="h-3.5 w-3.5 mr-1.5" />Débiter
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {mapiLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !mapiData?.rep ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Ce client n'est pas un rep MAPI</p>
              <p className="text-xs text-muted-foreground">Les représentants sont identifiés par le tag <code className="bg-muted px-1 rounded">mapi-rep</code> dans Shopify.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Solde actuel</p>
                    <p className="text-xl font-mono font-bold tabular-nums" data-testid="text-rep-balance">{mapiMoney(mapiData.rep.currentBalance)}</p>
                    {mapiData.rep.lastBalanceRefreshAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">Mis à jour {new Date(String(mapiData.rep.lastBalanceRefreshAt)).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Budget mensuel</p>
                    <p className="text-xl font-mono font-bold tabular-nums">
                      {mapiData.rep.monthlyBudgetAmount && parseFloat(mapiData.rep.monthlyBudgetAmount) > 0 ? mapiMoney(mapiData.rep.monthlyBudgetAmount) : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Transactions</p>
                    <p className="text-xl font-mono font-bold">{(mapiData.logs?.length ?? 0) + (mapiData.shopifyTransactions?.length ?? 0)}</p>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={mapiData.rep.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0 text-xs"}>
                  {mapiData.rep.status === "active" ? "Actif" : "Archivé"}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">{mapiData.rep.shopifyCustomerGid}</span>
              </div>
              {(mapiData.shopifyTransactions?.length ?? 0) + (mapiData.logs?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Historique des transactions</p>
                  <div className="border border-border/50 rounded-lg divide-y divide-border/50 overflow-hidden">
                    {(mapiData.shopifyTransactions ?? []).map((txn: any, i: number) => (
                      <div key={`shopify-${i}`} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <TxnTypeBadge type={txn.type} />
                          <div>
                            <p className="text-xs text-muted-foreground">{new Date(txn.createdAt).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</p>
                            {txn.expiresAt && <p className="text-xs text-amber-600">Expire : {new Date(txn.expiresAt).toLocaleString("fr-CA")}</p>}
                          </div>
                        </div>
                        <span className={`font-semibold tabular-nums text-sm ${txn.type === "Credit" || txn.type === "DebitRevert" ? "text-emerald-600" : "text-red-500"}`}>
                          {txn.type === "Credit" || txn.type === "DebitRevert" ? "+" : "-"}{mapiMoney(txn.amount, txn.currency)}
                        </span>
                      </div>
                    ))}
                    {(mapiData.logs ?? []).map((log: MapiRepCreditLog) => (
                      <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <TxnTypeBadge type={log.action} />
                          <div>
                            {log.reason && <p className="text-sm font-medium">{log.reason}</p>}
                            <p className="text-xs text-muted-foreground">{new Date(String(log.createdAt)).toLocaleString("fr-CA", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</p>
                          </div>
                        </div>
                        <span className={`font-semibold tabular-nums text-sm ${log.action === "credit" || log.action === "monthly_renewal" ? "text-emerald-600" : "text-red-500"}`}>
                          {log.action === "credit" || log.action === "monthly_renewal" ? "+" : "-"}{mapiMoney(log.amount, log.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Créditer le rep</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Montant (CAD)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="50.00" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} data-testid="input-credit-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Raison (optionnel)</Label>
              <Input placeholder="Bonus, ajustement..." value={creditReason} onChange={(e) => setCreditReason(e.target.value)} data-testid="input-credit-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditDialog(false)}>Annuler</Button>
            <Button onClick={() => creditMutation.mutate()} disabled={!creditAmount || creditMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-confirm-credit">
              {creditMutation.isPending ? "En cours..." : "Créditer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debit Dialog */}
      <Dialog open={showDebitDialog} onOpenChange={setShowDebitDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Débiter le rep</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {mapiData?.rep && <p className="text-sm text-muted-foreground">Solde actuel : <span className="font-semibold text-foreground">{mapiMoney(mapiData.rep.currentBalance)}</span></p>}
            <div className="space-y-1.5">
              <Label>Montant (CAD)</Label>
              <Input type="number" min="0.01" step="0.01" max={parseFloat(mapiData?.rep?.currentBalance ?? "0")} placeholder="50.00" value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} data-testid="input-debit-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Raison *</Label>
              <Input placeholder="Remboursement client..." value={debitReason} onChange={(e) => setDebitReason(e.target.value)} data-testid="input-debit-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDebitDialog(false)}>Annuler</Button>
            <Button onClick={() => debitMutation.mutate()} disabled={!debitAmount || !debitReason || debitMutation.isPending} variant="destructive" data-testid="button-confirm-debit">
              {debitMutation.isPending ? "En cours..." : "Débiter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
