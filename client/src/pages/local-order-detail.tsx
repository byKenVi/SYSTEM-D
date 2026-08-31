import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Building2, Calendar, CreditCard, ExternalLink, Package, ShoppingBag, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function money(amount: number, currency = "CAD") {
  return amount.toLocaleString("fr-CA", { style: "currency", currency: currency.toUpperCase() });
}

export default function LocalOrderDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const endpoint = admin ? `/api/admin/systemd-orders/${id}` : `/api/portal/systemd-orders/${id}`;
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Commande introuvable.");
      return response.json();
    },
    refetchInterval: (query) => query.state.data?.order?.status === "pending_shopify" ? 5000 : false,
  });
  const order = data?.order;
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  const fulfillmentMutation = useMutation({
    mutationFn: async (fulfillmentStatus: "processing" | "completed") => {
      const response = await apiRequest("PATCH", `/api/admin/systemd-orders/${id}/fulfillment`, { fulfillmentStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/systemd-orders"] });
      toast({ title: "Traitement mis à jour" });
    },
    onError: (error: any) => toast({ title: "Mise à jour impossible", description: error?.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-5"><Skeleton className="h-10 w-52" /><Skeleton className="h-56 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (error || !order) return (
    <Card className="border-dashed"><CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
      <Package className="h-12 w-12 text-muted-foreground" />
      <div><h1 className="text-xl font-bold">Commande introuvable</h1><p className="text-sm text-muted-foreground">{(error as Error)?.message}</p></div>
      <Button onClick={() => navigate(admin ? "/admin/orders" : "/portal/boutique?tab=orders")}><ArrowLeft className="mr-2 h-4 w-4" />Retour aux commandes</Button>
    </CardContent></Card>
  );

  const items = Array.isArray(order.lineItems) ? order.lineItems : [];
  const currency = order.currency || "CAD";
  const sourceLabel = order.source === "client_product" ? "Produit client · Shopify" : "Commande Système D — suivi dans Système D";
  const paymentLabel = order.status === "paid"
    ? "Payé par Store Credit — confirmé par Shopify"
    : order.status === "pending_shopify"
      ? "Paiement à finaliser dans Shopify"
      : order.status === "payment_reconciliation_required"
        ? "Réconciliation Shopify requise"
        : order.status === "cancelled" || order.status === "failed"
          ? "Paiement non confirmé"
          : "En attente";
  const paymentBadgeClass = order.status === "paid"
    ? "bg-emerald-100 text-emerald-800"
    : order.status === "payment_reconciliation_required" || order.status === "cancelled" || order.status === "failed"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";
  const fulfillmentLabel = order.fulfillmentStatus === "completed" ? "Terminée" : order.fulfillmentStatus === "processing" ? "En traitement" : "À traiter";

  return <div className="space-y-6 pb-12">
    <div className="flex items-center justify-between gap-3"><Button variant="ghost" className="-ml-3" onClick={() => navigate(admin ? "/admin/orders" : "/portal/boutique?tab=orders")}><ArrowLeft className="mr-2 h-4 w-4" />Retour aux commandes</Button>{admin && order.status === "paid" && order.fulfillmentStatus !== "completed" && <Button disabled={fulfillmentMutation.isPending} onClick={() => fulfillmentMutation.mutate(order.fulfillmentStatus === "processing" ? "completed" : "processing")}>{order.fulfillmentStatus === "processing" ? "Marquer comme terminée" : "Commencer le traitement"}</Button>}</div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{sourceLabel}</Badge><Badge className={paymentBadgeClass}>{paymentLabel}</Badge></div><h1 className="text-3xl font-bold">Commande #{order.id}</h1>{order.shopifyOrderName && <p className="mt-1 text-sm text-muted-foreground">Commande Shopify {order.shopifyOrderName}</p>}</div>
      <p className="font-mono text-3xl font-bold text-primary">{money(Number(order.amount || 0) / 100, currency)}</p>
    </div>

    <div className="grid gap-4 md:grid-cols-4">
      <Card><CardContent className="flex gap-3 p-5"><Calendar className="h-5 w-5 text-primary" /><div><p className="text-xs uppercase text-muted-foreground">Date</p><p className="font-medium">{order.createdAt ? new Date(order.createdAt).toLocaleString("fr-CA") : "—"}</p></div></CardContent></Card>
      <Card><CardContent className="flex gap-3 p-5"><Building2 className="h-5 w-5 text-primary" /><div><p className="text-xs uppercase text-muted-foreground">Client</p><p className="font-medium">{order.contactName || order.companyName || `#${order.contactId}`}</p><p className="text-xs text-muted-foreground">{order.contactEmail}</p></div></CardContent></Card>
      <Card><CardContent className="flex gap-3 p-5"><UserRound className="h-5 w-5 text-primary" /><div><p className="text-xs uppercase text-muted-foreground">Rep</p><p className="font-medium">{order.repName || order.repEmail || "—"}</p><p className="text-xs text-muted-foreground">{order.repEmail}</p></div></CardContent></Card>
      <Card><CardContent className="flex gap-3 p-5"><ShoppingBag className="h-5 w-5 text-primary" /><div><p className="text-xs uppercase text-muted-foreground">Traitement</p><p className="font-medium">{fulfillmentLabel}</p><p className="text-xs text-muted-foreground">{order.stockReservationStatus === "reserved" ? "Stock réservé" : order.source === "client_product" ? "Stock Shopify" : "Stock à vérifier"}</p></div></CardContent></Card>
    </div>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Articles</CardTitle></CardHeader>
      <CardContent><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Produit</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Quantité</TableHead><TableHead className="text-right">Prix unitaire</TableHead><TableHead className="text-right">Sous-total</TableHead></TableRow></TableHeader><TableBody>
        {items.map((item: any, index: number) => <TableRow key={index}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="font-mono text-xs">{item.sku || "—"}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right font-mono">{money(Number(item.unitPrice || 0), currency)}</TableCell><TableCell className="text-right font-mono font-bold">{money(Number(item.unitPrice || 0) * Number(item.quantity || 0), currency)}</TableCell></TableRow>)}
      </TableBody></Table></div></CardContent>
    </Card>

    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-primary" /><div><p className="font-bold">{paymentLabel}</p><p className="text-xs text-muted-foreground">Transaction Store Credit : {order.shopifyCreditTransactionId || "Non confirmée"}</p><p className="text-xs text-muted-foreground">Statut paiement Shopify : {order.shopifyFinancialStatus || "en attente"}</p></div></div><div className="flex items-center gap-2">{order.status === "pending_shopify" && order.shopifyCheckoutUrl && <Button asChild><a href={order.shopifyCheckoutUrl}>Continuer dans Shopify <ExternalLink className="ml-2 h-4 w-4" /></a></Button>}{order.shopifyAdminUrl && <Button variant="outline" asChild><a href={order.shopifyAdminUrl} target="_blank" rel="noopener noreferrer">Voir dans Shopify <ExternalLink className="ml-2 h-4 w-4" /></a></Button>}<p className="font-mono font-bold">{money(Number(order.amount || 0) / 100, currency)}</p></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader><CardContent>{logs.length === 0 ? <p className="text-sm text-muted-foreground">Aucun événement supplémentaire enregistré.</p> : <div className="space-y-3">{logs.map((log: any) => <div key={log.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0"><div><p className="text-sm font-medium">{log.message}</p><Badge variant="outline" className="mt-1 text-[10px]">{log.status}</Badge></div><time className="text-xs text-muted-foreground whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString("fr-CA") : "—"}</time></div>)}</div>}</CardContent></Card>
  </div>;
}
