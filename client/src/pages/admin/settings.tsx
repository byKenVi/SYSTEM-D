import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact, AdminSettings, ShopifyIntegration, ActivityLog } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Link as LinkIcon,
  CheckCircle2,
  ExternalLink,
  Globe,
  Trash2,
  RefreshCw,
  Clock,
  Search,
  ScrollText,
  XCircle,
  Info,
  ShieldCheck,
  Plus,
  X,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SiShopify, SiWoocommerce } from "react-icons/si";

const ZOHO_REGIONS = [
  { value: "us", label: "United States (zoho.com)" },
  { value: "eu", label: "Europe (zoho.eu)" },
  { value: "in", label: "India (zoho.in)" },
  { value: "au", label: "Australia (zoho.com.au)" },
  { value: "jp", label: "Japan (zoho.jp)" },
  { value: "ca", label: "Canada (zohocloud.ca)" },
];

const SYNC_OPTIONS = [
  { value: "0", label: "Désactivé" },
  { value: "15", label: "Toutes les 15 minutes" },
  { value: "30", label: "Toutes les 30 minutes" },
  { value: "60", label: "Toutes les heures" },
  { value: "360", label: "Toutes les 6 heures" },
  { value: "720", label: "Toutes les 12 heures" },
  { value: "1440", label: "Toutes les 24 heures" },
];

const TYPE_LABELS: Record<string, string> = {
  shopify_auto_sync: "Auto Sync",
  shopify_import: "Import Shopify",
  shopify_orders_sync: "Sync Commandes",
  zoho_push: "Envoi Zoho",
  zoho_inventory_sync: "Inventaire Zoho",
  contact_invite: "Invitation envoyée",
  contact_revoke: "Accès révoqué",
  contact_delete: "Contact supprimé",
  product_delete: "Produit supprimé",
  restock_request: "Bon de travail",
  shopify_writeback: "Écriture Shopify",
};

const TYPE_COLORS: Record<string, string> = {
  shopify_auto_sync: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  shopify_import: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  shopify_orders_sync: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  shopify_writeback: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  zoho_push: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  zoho_inventory_sync: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  contact_invite: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  contact_revoke: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  contact_delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  product_delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  restock_request: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [storePlatform, setStorePlatform] = useState<"shopify" | "woocommerce">("shopify");
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [wooConsumerKey, setWooConsumerKey] = useState("");
  const [wooConsumerSecret, setWooConsumerSecret] = useState("");
  const [zohoRegion, setZohoRegion] = useState("us");
  const [orgSelectOpen, setOrgSelectOpen] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [adminEmailInput, setAdminEmailInput] = useState("");

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: integrations } = useQuery<ShopifyIntegration[]>({
    queryKey: ["/api/shopify-integrations"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin-settings"],
  });

  const { data: zohoCallbackUrlData } = useQuery<{ callbackUrl: string }>({
    queryKey: ["/api/auth/zoho/callback-url"],
    staleTime: Infinity,
  });

  const { data: pendingOrgs } = useQuery<{ organizations: any[] }>({
    queryKey: ["/api/auth/zoho/pending-organizations"],
    enabled: orgSelectOpen,
  });

  const { data: logs, isLoading: logsLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoho_connected") === "true") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Zoho Inventory connecté", description: "Votre compte a été lié avec succès." });
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("zoho_select_org") === "true") {
      setOrgSelectOpen(true);
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("zoho_error")) {
      toast({
        title: "Connexion Zoho échouée",
        description: decodeURIComponent(params.get("zoho_error") || "Erreur inconnue"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin/settings");
    }

  }, []);

  const isZohoConnected = !!adminSettings?.zohoInventoryRefreshToken;

  // Live connection test — only fires when the Integrations tab is visible and Zoho appears connected
  const { data: zohoTestResult } = useQuery<{ ok: boolean; rateLimited?: boolean; reason?: string; message?: string }>({
    queryKey: ["/api/auth/zoho/test"],
    queryFn: () => fetch("/api/auth/zoho/test", { credentials: "include" }).then(async (r) => {
      const body = await r.json();
      return body;
    }),
    enabled: isZohoConnected,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Token is only considered invalid when the test explicitly says ok:false with reason invalid_token.
  // A 429 rate-limit (ok:true, rateLimited:true) or a loading state (undefined) must not trigger the
  // "Token invalide" warning — the token is fine in those cases.
  const zohoTokenValid = !isZohoConnected || zohoTestResult === undefined || zohoTestResult.ok !== false;
  const zohoRateLimited = isZohoConnected && zohoTestResult?.ok === true && zohoTestResult?.rateLimited === true;
  const connectedClientIds = new Set(integrations?.map((i) => i.contactId) || []);
  const availableClients = contacts?.filter((c) => !connectedClientIds.has(c.id)) || [];

  const filteredLogs = logs?.filter((l) => {
    const matchesSearch = l.message.toLowerCase().includes(logSearch.toLowerCase());
    const matchesType = logTypeFilter === "all" || l.type === logTypeFilter;
    const matchesStatus = logStatusFilter === "all" || l.status === logStatusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });
  const allLogTypes = Array.from(new Set(logs?.map((l) => l.type) ?? []));

  const connectShopifyMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        contactId: Number(selectedClient),
        storeUrl: shopifyStoreUrl,
        platform: storePlatform,
      };
      if (storePlatform === "woocommerce") {
        body.consumerKey = wooConsumerKey;
        body.consumerSecret = wooConsumerSecret;
      } else {
        body.accessToken = shopifyAccessToken;
      }
      const res = await apiRequest("POST", "/api/shopify-integrations/connect", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setShopifyOpen(false);
      setSelectedClient("");
      setStorePlatform("shopify");
      setShopifyStoreUrl("");
      setShopifyAccessToken("");
      setWooConsumerKey("");
      setWooConsumerSecret("");
      const label = storePlatform === "woocommerce" ? "WooCommerce" : "Shopify";
      toast({ title: "Boutique connectée", description: `La boutique ${label} a été liée avec succès.` });
    },
    onError: (error: any) => {
      toast({
        title: "Connexion échouée",
        description: error.message || "Impossible de connecter la boutique. Vérifiez l'URL et les identifiants.",
        variant: "destructive",
      });
    },
  });

  const importProductsMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      const res = await apiRequest("POST", `/api/shopify-integrations/${integrationId}/import`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Import terminé",
        description: data.message || `${data.imported} nouveau${data.imported > 1 ? "x" : ""}, ${data.updated} mis à jour (${data.total} total)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import échoué",
        description: error.message || "Impossible d'importer les produits depuis Shopify.",
        variant: "destructive",
      });
    },
  });

  const disconnectShopifyMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      await apiRequest("DELETE", `/api/shopify-integrations/${integrationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Déconnecté", description: "Boutique Shopify supprimée." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la déconnexion de la boutique.", variant: "destructive" });
    },
  });

  const updateSyncFrequencyMutation = useMutation({
    mutationFn: async ({ id, syncFrequencyMinutes }: { id: number; syncFrequencyMinutes: number }) => {
      await apiRequest("PATCH", `/api/shopify-integrations/${id}/sync-frequency`, { syncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      toast({ title: "Mis à jour", description: "Fréquence de sync produits mise à jour." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la mise à jour de la fréquence.", variant: "destructive" });
    },
  });

  const updateOrderSyncFrequencyMutation = useMutation({
    mutationFn: async ({ id, orderSyncFrequencyMinutes }: { id: number; orderSyncFrequencyMinutes: number }) => {
      await apiRequest("PATCH", `/api/shopify-integrations/${id}/order-sync-frequency`, { orderSyncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      toast({ title: "Mis à jour", description: "Fréquence de sync commandes mise à jour." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la mise à jour de la fréquence des commandes.", variant: "destructive" });
    },
  });

  const syncOrdersNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/orders/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Commandes synchronisées", description: data.message || `${data.synced} commande${data.synced > 1 ? "s" : ""} synchronisée${data.synced > 1 ? "s" : ""}.` });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la synchronisation des commandes.", variant: "destructive" });
    },
  });

  const updateZohoSyncFrequencyMutation = useMutation({
    mutationFn: async (zohoSyncFrequencyMinutes: number) => {
      await apiRequest("PATCH", "/api/admin-settings", { zohoSyncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Mis à jour", description: "Fréquence de sync Zoho mise à jour." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la mise à jour de la fréquence Zoho.", variant: "destructive" });
    },
  });

  const updateShopifyWritebackFrequencyMutation = useMutation({
    mutationFn: async (shopifyWritebackFrequencyMinutes: number) => {
      await apiRequest("PATCH", "/api/admin-settings", { shopifyWritebackFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Mis à jour", description: "Fréquence d'écriture Shopify mise à jour." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la mise à jour de la fréquence d'écriture Shopify.", variant: "destructive" });
    },
  });

  const connectZohoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/zoho/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: zohoRegion }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start Zoho connection");
      if (!data.authUrl) throw new Error("No auth URL returned from server");
      return data.authUrl as string;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de démarrer la connexion Zoho",
        variant: "destructive",
      });
    },
  });

  const disconnectZohoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/auth/zoho/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Déconnecté", description: "Zoho Inventory a été déconnecté." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la déconnexion.", variant: "destructive" });
    },
  });

  const selectOrgMutation = useMutation({
    mutationFn: async (organizationId: string) =>
      apiRequest("POST", "/api/auth/zoho/select-organization", { organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      setOrgSelectOpen(false);
      toast({ title: "Organisation sélectionnée", description: "Zoho Inventory connecté." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Échec de la sélection de l'organisation.", variant: "destructive" });
    },
  });

  const additionalAdminEmails = adminSettings?.additionalAdminEmails
    ? adminSettings.additionalAdminEmails.split(",").map((e) => e.trim()).filter(Boolean)
    : [];

  const updateAdminEmailsMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const res = await apiRequest("PATCH", "/api/admin-settings", {
        additionalAdminEmails: emails.join(","),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Administrateurs mis à jour" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour les administrateurs.", variant: "destructive" });
    },
  });

  const addAdminEmail = () => {
    const email = adminEmailInput.trim().toLowerCase();
    if (!email || additionalAdminEmails.includes(email)) {
      setAdminEmailInput("");
      return;
    }
    updateAdminEmailsMutation.mutate([...additionalAdminEmails, email]);
    setAdminEmailInput("");
  };

  const removeAdminEmail = (email: string) => {
    updateAdminEmailsMutation.mutate(additionalAdminEmails.filter((e) => e !== email));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Paramètres</h1>
        <p className="text-muted-foreground mt-1">Configurez les intégrations et consultez l'activité du système</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList data-testid="tabs-settings">
          <TabsTrigger value="integrations" data-testid="tab-integrations">Intégrations</TabsTrigger>
          <TabsTrigger value="activity-log" data-testid="tab-activity-log">Journal d'activité</TabsTrigger>
        </TabsList>

        {/* ── Integrations Tab ── */}
        <TabsContent value="integrations" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Zoho Inventory Card */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">Zoho Inventory</h3>
                  <p className="text-sm text-muted-foreground">
                    {isZohoConnected
                      ? adminSettings?.zohoInventoryOrgName || "Connecté"
                      : "Connecter via OAuth 2.0"}
                  </p>
                </div>
                {isZohoConnected && (
                  zohoTokenValid
                    ? zohoRateLimited
                      ? <Badge variant="outline" className="ml-auto border-orange-400 text-orange-500">Limite atteinte</Badge>
                      : <Badge variant="default" className="ml-auto bg-emerald-600">Connecté</Badge>
                    : <Badge variant="outline" className="ml-auto border-amber-500 text-amber-600 dark:text-amber-400">Token invalide</Badge>
                )}
              </CardHeader>
              <CardContent>
                {settingsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : isZohoConnected ? (
                  <div className="space-y-4">
                    {zohoTokenValid ? (
                      zohoRateLimited ? (
                        <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-orange-800 dark:text-orange-300">Limite d'appels Zoho atteinte</p>
                            <p className="text-orange-700 dark:text-orange-400 text-xs mt-0.5">
                              Votre connexion Zoho est valide. Le quota journalier (7 500 appels) est temporairement épuisé — l'inventaire sera de nouveau accessible demain.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-emerald-800 dark:text-emerald-300">Connecté</p>
                            {adminSettings?.zohoInventoryOrgName && (
                              <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5">
                                Organisation : {adminSettings.zohoInventoryOrgName}
                              </p>
                            )}
                            {adminSettings?.zohoInventoryOrgId && (
                              <p className="text-emerald-600 dark:text-emerald-500 text-xs">
                                Org ID : {adminSettings.zohoInventoryOrgId}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-300">Token invalide — reconnectez</p>
                          <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                            Le token stocké ne peut plus authentifier auprès de Zoho. Déconnectez puis reconnectez Zoho Inventory.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5" />
                        Fréquence de sync Zoho → App
                      </Label>
                      <Select
                        value={String(adminSettings?.zohoSyncFrequencyMinutes ?? 0)}
                        onValueChange={(v) => updateZohoSyncFrequencyMutation.mutate(Number(v))}
                        disabled={updateZohoSyncFrequencyMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-zoho-sync-frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Fréquence d'écriture Zoho → Shopify
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Renvoie les niveaux d'inventaire Zoho vers les boutiques Shopify connectées
                      </p>
                      <Select
                        value={String(adminSettings?.shopifyWritebackFrequencyMinutes ?? 0)}
                        onValueChange={(v) => updateShopifyWritebackFrequencyMutation.mutate(Number(v))}
                        disabled={updateShopifyWritebackFrequencyMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-shopify-writeback-frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => disconnectZohoMutation.mutate()}
                      disabled={disconnectZohoMutation.isPending}
                      data-testid="button-disconnect-zoho"
                    >
                      {disconnectZohoMutation.isPending ? "Déconnexion..." : "Déconnecter Zoho Inventory"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Configuration requise</p>
                      <p>Vous serez redirigé vers Zoho pour autoriser l'accès. Assurez-vous que votre application Zoho API Console a cet URI de redirection :</p>
                      <code className="block mt-1 text-xs bg-muted rounded px-2 py-1 break-all">
                        {zohoCallbackUrlData?.callbackUrl ?? `${window.location.origin}/api/auth/zoho/callback`}
                      </code>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        Région du centre de données
                      </Label>
                      <Select value={zohoRegion} onValueChange={setZohoRegion}>
                        <SelectTrigger data-testid="select-zoho-region">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ZOHO_REGIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => connectZohoMutation.mutate()}
                      disabled={connectZohoMutation.isPending}
                      data-testid="button-connect-zoho"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {connectZohoMutation.isPending ? "Redirection..." : "Connecter avec Zoho"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Store Integrations Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <SiShopify className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Intégrations boutiques</h3>
                    <p className="text-sm text-muted-foreground">Connectez des boutiques Shopify ou WooCommerce</p>
                  </div>
                </div>
                <Dialog open={shopifyOpen} onOpenChange={(open) => {
                  setShopifyOpen(open);
                  if (!open) {
                    setSelectedClient("");
                    setStorePlatform("shopify");
                    setShopifyStoreUrl("");
                    setShopifyAccessToken("");
                    setWooConsumerKey("");
                    setWooConsumerSecret("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-connect-shopify">
                      <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                      Connecter boutique
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Connecter une boutique</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      {/* Platform selector */}
                      <div className="space-y-2">
                        <Label>Plateforme</Label>
                        <Select value={storePlatform} onValueChange={(v) => setStorePlatform(v as "shopify" | "woocommerce")}>
                          <SelectTrigger data-testid="select-store-platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shopify">
                              <span className="flex items-center gap-2"><SiShopify className="h-4 w-4 text-green-600" /> Shopify</span>
                            </SelectItem>
                            <SelectItem value="woocommerce">
                              <span className="flex items-center gap-2"><SiWoocommerce className="h-4 w-4 text-purple-600" /> WooCommerce</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Client */}
                      <div className="space-y-2">
                        <Label>Client</Label>
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                          <SelectTrigger data-testid="select-shopify-client">
                            <SelectValue placeholder="Sélectionner un client" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableClients.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.companyName || c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Store URL */}
                      <div className="space-y-2">
                        <Label>URL de la boutique</Label>
                        <Input
                          value={shopifyStoreUrl}
                          onChange={(e) => setShopifyStoreUrl(e.target.value)}
                          placeholder={storePlatform === "woocommerce" ? "https://example.com" : "mystore.myshopify.com"}
                          data-testid="input-shopify-store-url"
                        />
                      </div>

                      {storePlatform === "shopify" ? (
                        <div className="space-y-2">
                          <Label>Jeton d'accès API Admin</Label>
                          <Input
                            type="password"
                            value={shopifyAccessToken}
                            onChange={(e) => setShopifyAccessToken(e.target.value)}
                            placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                            data-testid="input-shopify-access-token"
                          />
                          <p className="text-xs text-muted-foreground">Le jeton requiert les portées <code>read_products</code>, <code>read_inventory</code> et <code>write_inventory</code>.</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Consumer Key</Label>
                            <Input
                              value={wooConsumerKey}
                              onChange={(e) => setWooConsumerKey(e.target.value)}
                              placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                              data-testid="input-woo-consumer-key"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Consumer Secret</Label>
                            <Input
                              type="password"
                              value={wooConsumerSecret}
                              onChange={(e) => setWooConsumerSecret(e.target.value)}
                              placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                              data-testid="input-woo-consumer-secret"
                            />
                            <p className="text-xs text-muted-foreground">Générez une clé API dans <strong>WooCommerce → Réglages → Avancé → API REST</strong> avec l'autorisation Lecture/Écriture.</p>
                          </div>
                        </>
                      )}

                      <Button
                        className="w-full"
                        onClick={() => connectShopifyMutation.mutate()}
                        disabled={
                          !selectedClient || !shopifyStoreUrl ||
                          (storePlatform === "shopify" ? !shopifyAccessToken : !wooConsumerKey || !wooConsumerSecret) ||
                          connectShopifyMutation.isPending
                        }
                        data-testid="button-submit-shopify"
                      >
                        {connectShopifyMutation.isPending ? "Connexion..." : "Connecter la boutique"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {integrations && integrations.length > 0 ? (
                  <div className="space-y-3">
                    {integrations.map((integration) => {
                      const contact = contacts?.find((c) => c.id === integration.contactId);
                      const platform = (integration as any).platform ?? "shopify";
                      const isWoo = platform === "woocommerce";
                      return (
                        <div
                          key={integration.id}
                          className="p-4 rounded-md bg-muted/50 space-y-3"
                          data-testid={`shopify-integration-${integration.id}`}
                        >
                          {/* Store header */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {isWoo
                                ? <SiWoocommerce className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                : <SiShopify className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                              }
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-medium truncate" data-testid={`text-shopify-store-${integration.id}`}>
                                    {integration.shopName || integration.storeUrl}
                                  </p>
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${isWoo ? "border-purple-300 text-purple-600 dark:text-purple-400" : "border-green-300 text-green-600 dark:text-green-400"}`}>
                                    {isWoo ? "WooCommerce" : "Shopify"}
                                  </Badge>
                                </div>
                                {contact && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {contact.companyName || contact.name}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                              onClick={() => disconnectShopifyMutation.mutate(integration.id)}
                              disabled={disconnectShopifyMutation.isPending}
                              data-testid={`button-disconnect-shopify-${integration.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          {/* Product sync row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Produits</span>
                            <Select
                              value={String(integration.syncFrequencyMinutes ?? 0)}
                              onValueChange={(v) =>
                                updateSyncFrequencyMutation.mutate({ id: integration.id, syncFrequencyMinutes: Number(v) })
                              }
                              disabled={updateSyncFrequencyMutation.isPending}
                            >
                              <SelectTrigger className="h-7 text-xs w-auto gap-1" data-testid={`select-sync-frequency-${integration.id}`}>
                                <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SYNC_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => importProductsMutation.mutate(integration.id)}
                              disabled={importProductsMutation.isPending}
                              data-testid={`button-import-products-${integration.id}`}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${importProductsMutation.isPending ? "animate-spin" : ""}`} />
                              Importer
                            </Button>
                            {integration.lastAutoSyncAt && (
                              <span className="text-xs text-muted-foreground">
                                Dernier : {new Date(integration.lastAutoSyncAt).toLocaleString("fr-CA")}
                              </span>
                            )}
                          </div>

                          {/* Orders sync row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Commandes</span>
                            <Select
                              value={String(integration.orderSyncFrequencyMinutes ?? 0)}
                              onValueChange={(v) =>
                                updateOrderSyncFrequencyMutation.mutate({ id: integration.id, orderSyncFrequencyMinutes: Number(v) })
                              }
                              disabled={updateOrderSyncFrequencyMutation.isPending}
                            >
                              <SelectTrigger className="h-7 text-xs w-auto gap-1" data-testid={`select-order-sync-frequency-${integration.id}`}>
                                <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SYNC_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => syncOrdersNowMutation.mutate()}
                              disabled={syncOrdersNowMutation.isPending}
                              data-testid={`button-sync-orders-${integration.id}`}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncOrdersNowMutation.isPending ? "animate-spin" : ""}`} />
                              Sync maintenant
                            </Button>
                            {integration.lastOrderSyncAt && (
                              <span className="text-xs text-muted-foreground">
                                Dernier : {new Date(integration.lastOrderSyncAt).toLocaleString("fr-CA")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <SiShopify className="h-6 w-6 text-muted-foreground/30" />
                      <SiWoocommerce className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Aucune boutique connectée</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Cliquez sur « Connecter boutique » pour lier une boutique Shopify ou WooCommerce</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Admin Emails Card */}
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">Accès administrateurs</h3>
                <p className="text-sm text-muted-foreground">Adresses e-mail avec accès administrateur complet</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="nouveau@example.com"
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAdminEmail()}
                  data-testid="input-admin-email"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={addAdminEmail}
                  disabled={!adminEmailInput.trim() || updateAdminEmailsMutation.isPending}
                  data-testid="button-add-admin-email"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {additionalAdminEmails.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {additionalAdminEmails.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="flex items-center gap-1.5 pl-3 pr-2 py-1"
                      data-testid={`badge-admin-email-${email}`}
                    >
                      {email}
                      <button
                        onClick={() => removeAdminEmail(email)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        data-testid={`button-remove-admin-email-${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun administrateur supplémentaire configuré</p>
              )}
            </CardContent>
          </Card>

          {/* Org Select Dialog */}
          <Dialog open={orgSelectOpen} onOpenChange={setOrgSelectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sélectionner l'organisation Zoho</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-muted-foreground">
                  Plusieurs organisations ont été trouvées. Sélectionnez celle à connecter :
                </p>
                {pendingOrgs?.organizations?.map((org: any) => (
                  <Button
                    key={org.organization_id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => selectOrgMutation.mutate(org.organization_id)}
                    disabled={selectOrgMutation.isPending}
                    data-testid={`button-select-org-${org.organization_id}`}
                  >
                    <div className="text-left">
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.organization_id}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── Activity Log Tab ── */}
        <TabsContent value="activity-log" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 min-w-0 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans les journaux..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-logs"
              />
            </div>
            <Select value={logTypeFilter} onValueChange={setLogTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {allLogTypes.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="success">Succès</SelectItem>
                <SelectItem value="error">Erreur</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Date et heure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredLogs && filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell>
                          <StatusIcon status={log.status} />
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-log-message-${log.id}`}>
                          {log.message}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[log.type] ?? "bg-muted text-muted-foreground"}`}>
                            {TYPE_LABELS[log.type] ?? log.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-log-time-${log.id}`}>
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString(undefined, {
                                month: "short", day: "numeric", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-36 text-center">
                        <ScrollText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">Aucune entrée de journal</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">L'activité apparaîtra ici au fur et à mesure des actions</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
