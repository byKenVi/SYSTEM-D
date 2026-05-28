import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, DollarSign,
  Calendar, Tag, Shield, User, CreditCard, CheckCircle, XCircle, Package, Truck, AlertCircle, ShoppingCart
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
  return Number(amount).toLocaleString("fr-CA", { style: "currency", currency });
}

function StateBadge({ state }: { state?: string }) {
  if (state === "enabled")
    return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md">Actif</Badge>;
  if (state === "disabled")
    return <Badge className="bg-muted text-muted-foreground border-border text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md">Inactif</Badge>;
  if (state === "invited")
    return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md">Invité</Badge>;
  if (state === "declined")
    return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md">Refusé</Badge>;
  return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md">{state ?? "—"}</Badge>;
}

function FinancialStatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    partially_paid: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    refunded: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    voided: "bg-muted text-muted-foreground border-border",
    partially_refunded: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  };
  const cls = map[status ?? ""] ?? "bg-muted text-muted-foreground border-border";
  return <Badge className={`${cls} text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md`}>{status ?? "—"}</Badge>;
}

function FulfillmentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Non expédié</Badge>;
  const map: Record<string, string> = {
    fulfilled: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    unfulfilled: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    restocked: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  const labels: Record<string, string> = {
    fulfilled: "Expédié", partial: "Partiel", unfulfilled: "À expédier", restocked: "Remis en stock",
  };
  return <Badge className={`${cls} text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md`}>{labels[status] ?? status}</Badge>;
}

function AddressBlock({ address }: { address: any }) {
  if (!address) return <span className="text-muted-foreground/40 text-sm font-medium">—</span>;
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
    <div className="text-sm space-y-1">
      <p className="font-bold text-foreground">{lines[0]}</p>
      {lines.slice(1).map((l, i) => <p key={i} className="text-muted-foreground font-medium">{l}</p>)}
    </div>
  );
}

export default function PortalCustomerDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const store = searchParams.get("store") ?? "";
  const shopifyCustomerId = params.id;

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/portal/customers", shopifyCustomerId, store],
    queryFn: async () => {
      const res = await fetch(
        `/api/portal/customers/${shopifyCustomerId}?store=${encodeURIComponent(store)}`,
        { credentials: "include" }
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

  if (error) {
    return (
      <div className="max-w-5xl mx-auto animate-in">
        <Link href="/portal/boutique">
          <Button variant="ghost" size="sm" className="mb-6 h-10 px-4 font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la boutique
          </Button>
        </Link>
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2">Erreur de chargement</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Impossible de charger les données du client depuis Shopify. {(error as Error).message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in w-full pb-12">
      
      {/* ── Action Header (Sticky) ── */}
      <div className="sticky top-0 z-40 -mx-4 px-4 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50 mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/portal/boutique">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted shrink-0" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          
          <div>
            {isLoading ? (
              <Skeleton className="h-8 w-56 mb-1" />
            ) : (
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                  {initials}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-customer-name">
                  {fullName}
                </h1>
                <StateBadge state={c.state} />
                {c.verified_email && (
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 px-2 py-0.5 rounded-md">
                    Email Vérifié
                  </Badge>
                )}
                {c.tax_exempt && (
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 px-2 py-0.5 rounded-md">
                    Exonéré
                  </Badge>
                )}
              </div>
            )}
            
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground ml-11">
                <SiShopify className="h-3.5 w-3.5 text-[#95bf47]" />
                <span>{data?.shopName ?? store}</span>
              </div>
            )}
          </div>
        </div>

        {shopifyCustomerUrl && (
          <Button variant="outline" asChild className="shrink-0 font-bold border-border/50 bg-card hover:bg-muted">
            <a href={shopifyCustomerUrl} target="_blank" rel="noopener noreferrer" data-testid="link-shopify-customer">
              Ouvrir dans Shopify <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Commandes", value: isLoading ? null : c.orders_count ?? 0, icon: <ShoppingCart className="h-5 w-5 text-primary" /> },
          { label: "Dépenses Totales", value: isLoading ? null : money(c.total_spent, c.currency ?? "CAD"), icon: <DollarSign className="h-5 w-5 text-primary" /> },
          { label: "Dernier Achat", value: isLoading ? null : (c.last_order_name ?? "Aucun"), icon: <Package className="h-5 w-5 text-primary" /> },
          { label: "Devise par défaut", value: isLoading ? null : (c.currency ?? "—"), icon: <CreditCard className="h-5 w-5 text-primary" /> },
        ].map(({ label, value, icon }, i) => (
          <Card key={i} className="border-border/50 shadow-sm bg-card hover:border-primary/30 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  {icon}
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground leading-tight">{label}</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <p className="text-2xl font-mono font-bold text-foreground truncate">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Contact info */}
        <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Informations de contact
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {isLoading ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="space-y-4">
                  {c.email && (
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Email</p>
                        <p className="font-mono font-bold text-sm text-foreground truncate">{c.email}</p>
                      </div>
                      {c.verified_email !== undefined && (
                        <Badge variant="outline" className={`shrink-0 border-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${c.verified_email ? 'bg-blue-500/10 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                          {c.verified_email ? "Vérifié" : "Non Vérifié"}
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {c.phone && (
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Téléphone</p>
                        <p className="font-mono font-bold text-sm text-foreground">{c.phone}</p>
                      </div>
                    </div>
                  )}
                  
                  {c.default_address && (
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 bg-muted/30 p-4 rounded-xl border border-border/50">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Adresse Principale</p>
                        <AddressBlock address={c.default_address} />
                      </div>
                    </div>
                  )}
                </div>

                {(c.note || c.tags) && <Separator className="border-border/50" />}

                {c.note && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5" /> Note Interne
                    </p>
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-xl text-sm font-medium whitespace-pre-wrap leading-relaxed">
                      {c.note}
                    </div>
                  </div>
                )}
                
                {c.tags && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5" /> Tags Shopify
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {String(c.tags).split(",").map((t: string) => t.trim()).filter(Boolean).map((t: string) => (
                        <Badge key={t} variant="secondary" className="bg-muted text-foreground hover:bg-muted/80 px-2.5 py-1 text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Marketing consent */}
          <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Préférences Marketing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {isLoading ? <Skeleton className="h-24 w-full" /> : (
                <>
                  <div className="flex items-start justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                        <Mail className="h-3.5 w-3.5" /> Communications Email
                      </p>
                      {emailConsent.opt_in_level && <p className="text-sm font-bold text-foreground capitalize mb-0.5">{emailConsent.opt_in_level.replace(/_/g, " ")}</p>}
                      {emailConsent.consent_updated_at && <p className="text-xs font-medium text-muted-foreground">Mis à jour le {fmt(emailConsent.consent_updated_at)}</p>}
                    </div>
                    <Badge variant="outline" className={`border-0 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md mt-1 ${emailConsent.state === "subscribed" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {emailConsent.state ?? "—"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-start justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                        <Phone className="h-3.5 w-3.5" /> Communications SMS
                      </p>
                      {smsConsent.opt_in_level && <p className="text-sm font-bold text-foreground capitalize mb-0.5">{smsConsent.opt_in_level.replace(/_/g, " ")}</p>}
                      {smsConsent.consent_updated_at && <p className="text-xs font-medium text-muted-foreground">Mis à jour le {fmt(smsConsent.consent_updated_at)}</p>}
                    </div>
                    <Badge variant="outline" className={`border-0 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md mt-1 ${smsConsent.state === "subscribed" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {smsConsent.state ?? "—"}
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          {!isLoading && (
            <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Métadonnées
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {[
                    ["ID Shopify", c.id],
                    ["Créé le", fmt(c.created_at)],
                    ["Mis à jour le", fmt(c.updated_at)],
                    ["Boutique Source", data?.shopName ?? store],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between items-center px-6 py-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
                      <span className="font-mono text-sm font-medium text-right text-foreground max-w-[200px] truncate">{String(value ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tax exemptions */}
          {!isLoading && c.tax_exempt && (
            <Card className="border-amber-500/20 shadow-sm bg-amber-500/5 overflow-hidden">
              <CardHeader className="border-b border-amber-500/10 bg-amber-500/10 px-6 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Exonérations Fiscales
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {Array.isArray(c.tax_exemptions) && c.tax_exemptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {c.tax_exemptions.map((ex: string) => (
                      <Badge key={ex} variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 hover:bg-amber-500/30 px-3 py-1 font-bold">{ex}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-amber-700/70 dark:text-amber-400/70">Exonération générale (aucun code spécifique attribué)</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* All Addresses */}
      {!isLoading && Array.isArray(c.addresses) && c.addresses.length > 0 && (
        <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Adresses du compte ({c.addresses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {c.addresses.map((addr: any) => (
                <div key={addr.id} className={`rounded-2xl border p-5 ${addr.default ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/50 bg-muted/20"}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="h-10 w-10 rounded-full bg-background border flex items-center justify-center shrink-0">
                      <MapPin className={`h-4 w-4 ${addr.default ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    {addr.default && (
                      <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">Défaut</Badge>
                    )}
                  </div>
                  <AddressBlock address={addr} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order History */}
      <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Historique des commandes
            {!isLoading && <Badge variant="secondary" className="ml-2 bg-background border-border text-foreground font-mono">{orders.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">Aucune commande</h3>
              <p className="text-muted-foreground max-w-sm">
                Ce client n'a pas encore passé de commande sur la boutique.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
                    <TableHead className="py-4 pl-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commande</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Date</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Paiement</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Expédition</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Articles</TableHead>
                    <TableHead className="py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Total</TableHead>
                    <TableHead className="py-4 pr-6 w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order: any) => {
                    const detailUrl = `/portal/orders/${order.id}?store=${encodeURIComponent(store)}`;
                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer group hover:bg-muted/50 transition-colors"
                        data-testid={`row-order-${order.id}`}
                        onClick={() => navigate(detailUrl)}
                      >
                        <TableCell className="pl-6 py-4 font-bold font-mono text-base text-foreground">{order.name}</TableCell>
                        <TableCell className="py-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString("fr-CA", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="py-4"><FinancialStatusBadge status={order.financial_status} /></TableCell>
                        <TableCell className="py-4"><FulfillmentStatusBadge status={order.fulfillment_status} /></TableCell>
                        <TableCell className="py-4 text-right">
                          <span className="font-mono font-bold text-sm bg-muted/50 border border-border/50 px-2 py-0.5 rounded-md">
                            {(order.line_items as any[] | undefined)?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right text-base font-mono font-bold text-foreground">
                          {money(order.total_price, order.currency ?? "CAD")}
                        </TableCell>
                        <TableCell className="pr-6 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground" asChild onClick={(e) => e.stopPropagation()}>
                            <a href={`https://${store}/admin/orders/${order.id}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
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
