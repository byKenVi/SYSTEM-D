import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact, AdminSettings, ShopifyIntegration, ActivityLog } from "@shared/schema";
type IntegrationWithCount = ShopifyIntegration & { productCount: number; repCount: number; orderCount: number };
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
  DialogDescription,
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
  zoho_catalog_sync: "Sync catalogue Zoho",
  zoho_catalog_webhook: "Webhook Zoho",
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
  zoho_catalog_sync: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  zoho_catalog_webhook: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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
  const [storePlatform, setStorePlatform] = useState<"shopify" | "woocommerce" | "other">("shopify");
  const [storeName, setStoreName] = useState("");
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [zohoRegion, setZohoRegion] = useState("us");
  const [orgSelectOpen, setOrgSelectOpen] = useState(false);
  const [zohoProjectsPortalInput, setZohoProjectsPortalInput] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [adminEmailInput, setAdminEmailInput] = useState("");

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: integrations } = useQuery<IntegrationWithCount[]>({
    queryKey: ["/api/shopify-integrations"],
  });
  const { data: shopifyOAuthConfig } = useQuery<{ callbackUrl: string; configured: boolean }>({
    queryKey: ["/api/auth/shopify/callback-url"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettings & { zohoInventoryConnected?: boolean }>({
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

  const { data: catalogStats, refetch: refetchCatalogStats } = useQuery<{
    stats: { total: number; systemd: number; client: number; unresolved: number; active: number; inactive: number; deleted: number };
    lastRuns: Array<{ id: number; status: string; triggeredBy: string; itemsReceived: number; itemsUpserted: number; itemsSoftDeleted: number; startedAt: string; completedAt: string | null; errorMessage: string | null }>;
  }>({
    queryKey: ["/api/zoho/catalog-stats"],
    enabled: !!adminSettings?.zohoInventoryConnected,
    refetchInterval: 60_000,
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
    if (params.get("shopify_connected") === "true") {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Shopify connecté",
        description: "La boutique est liée avec un accès OAuth offline durable.",
      });
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("shopify_error")) {
      const reason = params.get("shopify_error");
      const messages: Record<string, string> = {
        authorization_expired: "La demande a expiré. Relancez la connexion depuis les réglages.",
        authorization_invalid: "Le retour Shopify n’a pas pu être vérifié. Relancez la connexion.",
        authorization_cancelled: "L’autorisation Shopify a été annulée.",
        connection_failed: "La connexion Shopify n’a pas abouti. Vérifiez la configuration de l’application Shopify puis réessayez.",
      };
      toast({
        title: "Connexion Shopify échouée",
        description: messages[reason || ""] || "Impossible de finaliser la connexion Shopify.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin/settings");
    }

  }, []);

  const isZohoConnected = !!adminSettings?.zohoInventoryConnected;

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
  const availableClients = contacts ?? [];

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
        shopName: storeName.trim() || undefined,
      };
      const res = await apiRequest("POST", "/api/auth/shopify/connect", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (storePlatform === "shopify" && data?.authUrl) {
        window.location.assign(data.authUrl);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setShopifyOpen(false);
      setSelectedClient("");
      setStorePlatform("shopify");
      setStoreName("");
      setShopifyStoreUrl("");
      toast({ title: "Boutique connectée", description: "La boutique Shopify a été liée avec succès." });
    },
    onError: (error: any) => {
      toast({
        title: "Connexion échouée",
        description: error.message || "Impossible de démarrer la connexion de la boutique.",
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
    mutationFn: async (integrationId: number) => {
      const res = await apiRequest("POST", "/api/admin/orders/sync", { integrationId });
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

  const testShopifyConnectionMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      const res = await apiRequest("POST", `/api/shopify-integrations/${integrationId}/test-connection`);
      return res.json() as Promise<{ status: string; shopName?: string; error?: string }>;
    },
    onSuccess: (data, integrationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      if (data.status === "ok") {
        toast({ title: "Connexion OK", description: `Boutique ${data.shopName ? `"${data.shopName}"` : ""} accessible.` });
      } else if (data.status === "invalid_token") {
        toast({ title: "Autorisation Shopify révoquée", description: "La connexion a été invalidée par Shopify. Reconnectez la boutique via OAuth offline.", variant: "destructive" });
      } else {
        toast({ title: "Erreur de connexion", description: data.error || "Store inaccessible.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de tester la connexion.", variant: "destructive" });
    },
  });

  const triggerCatalogSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/zoho/full-sync", { method: "POST", credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Erreur inconnue");
      return body;
    },
    onSuccess: (data) => {
      refetchCatalogStats();
      toast({ title: "Synchronisation terminée", description: data.message });
    },
    onError: (err: Error) => {
      refetchCatalogStats();
      const is429 = err.message?.toLowerCase().includes("quota") || err.message?.includes("429");
      toast({
        title: is429 ? "Quota Zoho épuisé" : "Erreur de synchronisation",
        description: is429
          ? "Le quota journalier Zoho (7 500 appels) est épuisé. Réessayez après minuit."
          : err.message,
        variant: "destructive",
      });
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

  // ── Zoho Projects mutations ────────────────────────────────────────────────
  const [zohoProjectsPortals, setZohoProjectsPortals] = useState<{ id: string; name: string }[]>([]);
  const [zohoProjectsTestStatus, setZohoProjectsTestStatus] = useState<"idle" | "loading" | "ok" | "error" | "scope_missing">("idle");
  const [zohoProjectsTestError, setZohoProjectsTestError] = useState("");

  const testZohoProjectsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/zoho/projects/portals", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message || "Erreur"), { code: data.code });
      return data.portals as { id: string; name: string }[];
    },
    onMutate: () => { setZohoProjectsTestStatus("loading"); setZohoProjectsTestError(""); },
    onSuccess: (portals) => {
      setZohoProjectsPortals(portals);
      setZohoProjectsTestStatus("ok");
      if (portals.length === 1 && !adminSettings?.zohoProjectsPortalId) {
        setZohoProjectsPortalInput(portals[0].id);
      }
      toast({ title: "Connexion Zoho Projects OK", description: `${portals.length} portail${portals.length > 1 ? "s" : ""} trouvé${portals.length > 1 ? "s" : ""}` });
    },
    onError: (err: any) => {
      setZohoProjectsTestStatus(err.code === "ZOHO_PROJECTS_SCOPE_MISSING" ? "scope_missing" : "error");
      setZohoProjectsTestError(err.message || "Erreur inconnue");
    },
  });

  const saveZohoProjectsPortalMutation = useMutation({
    mutationFn: async ({ portalId, portalName }: { portalId: string; portalName: string }) => {
      const res = await apiRequest("PATCH", "/api/admin-settings/zoho-projects", { portalId, portalName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Zoho Projects configuré", description: "Portail enregistré avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer le portail.", variant: "destructive" });
    },
  });

  const syncRepsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/mapi/reps/sync").then((res) => res.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      toast({ title: "Reps synchronisés", description: `${data.synced ?? 0} rep(s) mis à jour.` });
    },
    onError: (error: any) => toast({ title: "Synchronisation impossible", description: error.message, variant: "destructive" }),
  });

  const disconnectZohoProjectsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin-settings/zoho-projects/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      setZohoProjectsPortalInput("");
      setZohoProjectsTestStatus("idle");
      toast({ title: "Zoho Projects déconnecté", description: "Zoho Inventory et les anciens projets sont conservés." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de déconnecter Zoho Projects.", variant: "destructive" }),
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
                    {/* ── Catalogue local (cache Zoho) ── */}
                    <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Catalogue local</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Cache local de tous les articles Zoho — évite les appels API à chaque chargement de page
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => triggerCatalogSyncMutation.mutate()}
                          disabled={
                            triggerCatalogSyncMutation.isPending ||
                            catalogStats?.lastRuns?.[0]?.status === "running"
                          }
                          data-testid="button-sync-catalog"
                          className="flex-shrink-0"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerCatalogSyncMutation.isPending ? "animate-spin" : ""}`} />
                          {triggerCatalogSyncMutation.isPending
                            ? "Synchronisation..."
                            : catalogStats?.lastRuns?.[0]?.status === "running"
                            ? "En cours..."
                            : "Synchroniser maintenant"}
                        </Button>
                      </div>

                      {/* Last sync run status */}
                      {catalogStats?.lastRuns?.[0] ? (() => {
                        const run = catalogStats.lastRuns[0];
                        const isRunning = run.status === "running";
                        const isFailed = run.status === "failed";
                        const isSuccess = run.status === "success";
                        const startedAt = run.startedAt
                          ? new Date(run.startedAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : null;
                        return (
                          <div className={`rounded text-xs p-2 flex items-start gap-2 ${
                            isRunning ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300" :
                            isFailed  ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300" :
                            isSuccess ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300" :
                            "bg-muted border text-muted-foreground"
                          }`}>
                            {isRunning && <RefreshCw className="h-3 w-3 mt-0.5 animate-spin flex-shrink-0" />}
                            {isFailed && <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                            {isSuccess && <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">
                                {isRunning ? "Synchronisation en cours…" :
                                 isFailed  ? "Dernier sync échoué" :
                                 isSuccess ? `Dernier sync : ${run.itemsUpserted} articles mis à jour` :
                                 "Statut inconnu"}
                              </span>
                              {isFailed && run.errorMessage && (
                                <p className="mt-0.5 break-words">{run.errorMessage}</p>
                              )}
                              {startedAt && (
                                <p className="mt-0.5 text-current opacity-70">
                                  {isSuccess ? `Le ${startedAt}` : `Démarré le ${startedAt}`}
                                  {isSuccess && run.itemsSoftDeleted > 0 && `, ${run.itemsSoftDeleted} supprimés`}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })() : (
                        <p className="text-xs text-muted-foreground italic">
                          Aucune synchronisation effectuée — cliquez sur "Synchroniser maintenant" pour lancer le premier sync.
                        </p>
                      )}

                      {/* Counters by assignment_state */}
                      {catalogStats?.stats && catalogStats.stats.total > 0 && (
                        <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                          {[
                            { label: "Total", value: catalogStats.stats.total, color: "text-foreground" },
                            { label: "Système D", value: catalogStats.stats.systemd, color: "text-emerald-600 dark:text-emerald-400" },
                            { label: "Clients", value: catalogStats.stats.client, color: "text-blue-600 dark:text-blue-400" },
                            { label: "Non résolu", value: catalogStats.stats.unresolved, color: "text-amber-600 dark:text-amber-400" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="rounded bg-background border py-1.5">
                              <p className={`font-bold text-sm leading-tight ${color}`}>{value}</p>
                              <p className="text-muted-foreground leading-tight mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      )}
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

            {/* Zoho Projects Card */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
                <div className="h-10 w-10 rounded-md bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <ScrollText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">Zoho Projects</h3>
                  <p className="text-sm text-muted-foreground">
                    {adminSettings?.zohoProjectsPortalId
                      ? adminSettings.zohoProjectsPortalName || `Portail ${adminSettings.zohoProjectsPortalId}`
                      : "Création automatique de projets"}
                  </p>
                </div>
                {adminSettings?.zohoProjectsPortalId
                  ? <Badge variant="default" className="ml-auto bg-violet-600">Configuré</Badge>
                  : <Badge variant="outline" className="ml-auto">Non configuré</Badge>
                }
              </CardHeader>
              <CardContent className="space-y-4">
                {!isZohoConnected ? (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      {adminSettings?.zohoProjectsPortalId ? (
                        <>
                          <p className="font-medium text-blue-800 dark:text-blue-300">Configuration conservée</p>
                          <p className="text-blue-700 dark:text-blue-400 text-xs mt-0.5">
                            Portail <strong>{adminSettings.zohoProjectsPortalName || adminSettings.zohoProjectsPortalId}</strong> enregistré.
                            Reconnectez Zoho Inventory (carte ci-dessus) pour réactiver Zoho Projects — aucune reconfiguration nécessaire.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-blue-800 dark:text-blue-300">Zoho Inventory requis</p>
                          <p className="text-blue-700 dark:text-blue-400 text-xs mt-0.5">
                            Connectez d'abord Zoho Inventory (carte ci-dessus), puis revenez ici pour configurer Zoho Projects.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {zohoProjectsTestStatus === "scope_missing" && (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-300">Reconnexion Zoho requise</p>
                          <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                            Les scopes Zoho Projects ne sont pas encore autorisés. Déconnectez puis reconnectez Zoho Inventory pour les activer.
                          </p>
                        </div>
                      </div>
                    )}
                    {zohoProjectsTestStatus === "error" && (
                      <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-400">{zohoProjectsTestError}</p>
                      </div>
                    )}
                    {zohoProjectsTestStatus === "ok" && (
                      <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-emerald-800 dark:text-emerald-300">Connexion OK</p>
                          <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5">
                            {zohoProjectsPortals.length} portail{zohoProjectsPortals.length > 1 ? "s" : ""} accessible{zohoProjectsPortals.length > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    )}

                    {adminSettings?.zohoProjectsPortalId && zohoProjectsTestStatus === "idle" && (
                      <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-0.5">
                        <p className="font-medium">Portail actuel</p>
                        <p className="text-muted-foreground text-xs">
                          {adminSettings.zohoProjectsPortalName || "—"} <span className="font-mono">({adminSettings.zohoProjectsPortalId})</span>
                        </p>
                        {adminSettings.zohoProjectsLastTestedAt && (
                          <p className="text-muted-foreground text-xs">
                            Dernier test : {new Date(adminSettings.zohoProjectsLastTestedAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Portal selector — shown after successful test if portals found */}
                    {zohoProjectsTestStatus === "ok" && zohoProjectsPortals.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Sélectionner le portail</Label>
                        <Select
                          value={zohoProjectsPortalInput}
                          onValueChange={setZohoProjectsPortalInput}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un portail…" />
                          </SelectTrigger>
                          <SelectContent>
                            {zohoProjectsPortals.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.id})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Manual portal ID input */}
                    {(zohoProjectsTestStatus === "idle" || zohoProjectsTestStatus === "error") && (
                      <div className="space-y-2">
                        <Label className="text-sm">ID du portail Zoho Projects</Label>
                        <Input
                          placeholder="Ex. : 123456789"
                          value={zohoProjectsPortalInput || adminSettings?.zohoProjectsPortalId || ""}
                          onChange={(e) => setZohoProjectsPortalInput(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Cliquez sur "Tester la connexion" pour récupérer automatiquement vos portails.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => testZohoProjectsMutation.mutate()}
                        disabled={testZohoProjectsMutation.isPending}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${testZohoProjectsMutation.isPending ? "animate-spin" : ""}`} />
                        {testZohoProjectsMutation.isPending ? "Test en cours…" : "Tester la connexion"}
                      </Button>
                      {(zohoProjectsPortalInput || adminSettings?.zohoProjectsPortalId) && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            const id = zohoProjectsPortalInput || adminSettings?.zohoProjectsPortalId || "";
                            const portal = zohoProjectsPortals.find((p) => p.id === id);
                            saveZohoProjectsPortalMutation.mutate({
                              portalId: id,
                              portalName: portal?.name || adminSettings?.zohoProjectsPortalName || "",
                            });
                          }}
                          disabled={saveZohoProjectsPortalMutation.isPending}
                        >
                          {saveZohoProjectsPortalMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                      )}
                    </div>

                    {adminSettings?.zohoProjectsPortalId && (
                      <Button
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => disconnectZohoProjectsMutation.mutate()}
                        disabled={disconnectZohoProjectsMutation.isPending}
                        data-testid="button-disconnect-zoho-projects"
                      >
                        {disconnectZohoProjectsMutation.isPending ? "Déconnexion…" : "Déconnecter Zoho Projects"}
                      </Button>
                    )}

                    <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground text-sm">Comment ça fonctionne</p>
                      <p>Un projet Zoho est créé automatiquement chaque fois qu'une soumission passe de <strong>En révision</strong> à <strong>Approuvée</strong>.</p>
                      <p>Zoho Projects réutilise les tokens OAuth de Zoho Inventory — aucune seconde connexion n'est requise.</p>
                    </div>
                  </>
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
                    <p className="text-sm text-muted-foreground">Une ou plusieurs boutiques par client, quelle que soit la plateforme</p>
                  </div>
                </div>
                <Dialog open={shopifyOpen} onOpenChange={(open) => {
                  setShopifyOpen(open);
                  if (!open) {
                    setSelectedClient("");
                    setStorePlatform("shopify");
                    setStoreName("");
                    setShopifyStoreUrl("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-connect-shopify">
                      <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                      Ajouter une boutique
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Connecter une boutique</DialogTitle>
                      <DialogDescription>
                        Associez une boutique Shopify à un client existant. Les autres plateformes seront disponibles prochainement.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      {/* Platform selector */}
                      <div className="space-y-2">
                        <Label>Plateforme</Label>
                        <Select value={storePlatform} onValueChange={(v) => setStorePlatform(v as "shopify" | "woocommerce" | "other")}>
                          <SelectTrigger data-testid="select-store-platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shopify">
                              <span className="flex items-center gap-2"><SiShopify className="h-4 w-4 text-green-600" /> Shopify</span>
                            </SelectItem>
                            <SelectItem value="woocommerce" disabled>
                              <span className="flex items-center gap-2"><SiWoocommerce className="h-4 w-4 text-purple-600" /> WooCommerce — à venir</span>
                            </SelectItem>
                            <SelectItem value="other" disabled>Autre / à configurer — à venir</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Nom de la boutique</Label>
                        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex. Boutique Mapei Canada" />
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
                          placeholder="mystore.myshopify.com"
                          data-testid="input-shopify-store-url"
                        />
                      </div>

                      {storePlatform === "shopify" ? (
                        <div className="rounded-md border border-green-200 bg-green-50/60 p-3 text-sm dark:border-green-900 dark:bg-green-950/20">
                          <p className="font-medium text-green-900 dark:text-green-200">Connexion Shopify sécurisée</p>
                          <p className="mt-1 text-xs text-green-800 dark:text-green-300">
                            Vous serez redirigé vers Shopify pour autoriser l’application une seule fois. L’accès offline reste actif sans token à copier ni renouvellement quotidien.
                          </p>
                          {shopifyOAuthConfig?.callbackUrl && (
                            <p className="mt-2 break-all text-xs text-green-800 dark:text-green-300">
                              URL de redirection à enregistrer dans Shopify : <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-black/20">{shopifyOAuthConfig.callbackUrl}</code>
                            </p>
                          )}
                          {shopifyOAuthConfig?.configured === false ? (
                            <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                              OAuth Shopify n’est pas configuré sur le serveur. Ajoutez les identifiants de l’application Shopify active dans les secrets du déploiement avant de connecter une boutique.
                            </p>
                          ) : (
                            <p className="mt-3 text-xs text-green-800 dark:text-green-300">
                              Si Shopify affiche « application cannot be found », vérifiez que l’application est active, que son Client ID correspond à la configuration serveur et que cette URL est autorisée dans Shopify.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                          Cette plateforme est préparée dans l’interface mais n’est pas encore configurable. Aucun secret n’est demandé ni enregistré.
                        </div>
                      )}

                      <Button
                        className="w-full"
                        onClick={() => connectShopifyMutation.mutate()}
                        disabled={
                          !selectedClient || !shopifyStoreUrl || storePlatform !== "shopify" ||
                          connectShopifyMutation.isPending
                        }
                        data-testid="button-submit-shopify"
                      >
                        {storePlatform !== "shopify"
                          ? "Non configuré — à venir"
                          : connectShopifyMutation.isPending
                          ? "Préparation…"
                          : "Continuer avec Shopify"}
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
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <p className="text-sm font-medium truncate" data-testid={`text-shopify-store-${integration.id}`}>
                                    {integration.shopName || integration.storeUrl}
                                  </p>
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${isWoo ? "border-purple-300 text-purple-600 dark:text-purple-400" : "border-green-300 text-green-600 dark:text-green-400"}`}>
                                    {isWoo ? "WooCommerce" : "Shopify"}
                                  </Badge>
                                  {!isWoo && (integration.platformConfig as any)?.authMode === "oauth_offline" && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-400">
                                      OAuth offline
                                    </Badge>
                                  )}
                                  {/* Connection status badge */}
                                  {(() => {
                                    const cs = integration.connectionStatus ?? "unknown";
                                    if (cs === "ok") return (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800 flex-shrink-0" variant="outline">
                                        ✓ Connexion OK
                                      </Badge>
                                    );
                                    if (cs === "invalid_token") return (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-800 flex-shrink-0" variant="outline">
                                        ✗ Token invalide
                                      </Badge>
                                    );
                                    if (cs === "error") return (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-800 flex-shrink-0" variant="outline">
                                        ⚠ Erreur de connexion
                                      </Badge>
                                    );
                                    if (cs === "permission_insufficient") return (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800 flex-shrink-0" variant="outline">
                                        ⚠ Autorisation insuffisante
                                      </Badge>
                                    );
                                    if (cs === "disconnected" || !integration.isActive) return (
                                      <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0" variant="secondary">
                                        Déconnectée
                                      </Badge>
                                    );
                                    return (
                                      <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0" variant="outline">
                                        Jamais testé
                                      </Badge>
                                    );
                                  })()}
                                </div>
                                {contact && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {contact.companyName || contact.name}
                                    {(integration as any).productCount != null && (
                                      <span className="ml-1.5 text-muted-foreground/60">· {(integration as any).productCount} produit{(integration as any).productCount !== 1 ? "s" : ""} importé{(integration as any).productCount !== 1 ? "s" : ""}</span>
                                    )}
                                  </p>
                                )}
                                <p className="text-[10px] text-muted-foreground/70 truncate">{integration.storeUrl}</p>
                                {integration.lastConnectionTestedAt && (
                                  <p className="text-[10px] text-muted-foreground/60">
                                    Testé le {new Date(integration.lastConnectionTestedAt).toLocaleString("fr-CA")}
                                  </p>
                                )}
                                {integration.connectionStatus !== "ok" && integration.lastConnectionError && (
                                  <p className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-xs" title={integration.lastConnectionError}>
                                    {integration.lastConnectionError.slice(0, 80)}{integration.lastConnectionError.length > 80 ? "…" : ""}
                                  </p>
                                )}
                                {integration.syncPausedUntil && new Date(integration.syncPausedUntil) > new Date() && (
                                  <p className="text-[10px] text-orange-500 dark:text-orange-400">
                                    Sync suspendue jusqu'à {new Date(integration.syncPausedUntil).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!isWoo && integration.isActive && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => testShopifyConnectionMutation.mutate(integration.id)}
                                  disabled={testShopifyConnectionMutation.isPending && testShopifyConnectionMutation.variables === integration.id}
                                  data-testid={`button-test-connection-${integration.id}`}
                                  title="Vérifie si l’autorisation Shopify est toujours valide"
                                >
                                  {testShopifyConnectionMutation.isPending && testShopifyConnectionMutation.variables === integration.id
                                    ? "Test…"
                                    : "Tester la connexion"}
                                </Button>
                              )}
                              {!integration.isActive && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setSelectedClient(String(integration.contactId));
                                    setStorePlatform(isWoo ? "woocommerce" : "shopify");
                                    setStoreName(integration.shopName || "");
                                    setShopifyStoreUrl(integration.storeUrl);
                                    setShopifyOpen(true);
                                  }}
                                >
                                  Reconnecter
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                                onClick={() => disconnectShopifyMutation.mutate(integration.id)}
                                disabled={disconnectShopifyMutation.isPending}
                                data-testid={`button-disconnect-shopify-${integration.id}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 rounded-md border bg-background/70 p-2 text-center">
                            <div><p className="text-sm font-bold tabular-nums">{integration.productCount ?? 0}</p><p className="text-[10px] text-muted-foreground">Produits</p></div>
                            <div><p className="text-sm font-bold tabular-nums">{integration.repCount ?? 0}</p><p className="text-[10px] text-muted-foreground">Reps</p></div>
                            <div><p className="text-sm font-bold tabular-nums">{integration.orderCount ?? 0}</p><p className="text-[10px] text-muted-foreground">Commandes</p></div>
                          </div>

                          {/* Product sync row */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Produits</span>
                              <Select
                                value={String(integration.syncFrequencyMinutes ?? 0)}
                                onValueChange={(v) =>
                                  updateSyncFrequencyMutation.mutate({ id: integration.id, syncFrequencyMinutes: Number(v) })
                                }
                                disabled={!integration.isActive || updateSyncFrequencyMutation.isPending}
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
                                disabled={!integration.isActive || importProductsMutation.isPending}
                                data-testid={`button-import-products-${integration.id}`}
                                title="Importe ou réimporte tous les produits actifs depuis cette boutique Shopify"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${importProductsMutation.isPending ? "animate-spin" : ""}`} />
                                Importer tous les produits
                              </Button>
                              {integration.lastAutoSyncAt && (
                                <span className="text-xs text-muted-foreground">
                                  Dernier sync : {new Date(integration.lastAutoSyncAt).toLocaleString("fr-CA")}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground/60 ml-[88px]">
                              Recharge le catalogue produits complet depuis Shopify. Les nouveaux produits actifs sont aussi ajoutés automatiquement lors des syncs programmées.
                            </p>
                          </div>

                          {/* Orders sync row */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Commandes</span>
                              <Select
                                value={String(integration.orderSyncFrequencyMinutes ?? 0)}
                                onValueChange={(v) =>
                                  updateOrderSyncFrequencyMutation.mutate({ id: integration.id, orderSyncFrequencyMinutes: Number(v) })
                                }
                                disabled={!integration.isActive || updateOrderSyncFrequencyMutation.isPending}
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
                                onClick={() => syncOrdersNowMutation.mutate(integration.id)}
                                disabled={!integration.isActive || syncOrdersNowMutation.isPending}
                                data-testid={`button-sync-orders-${integration.id}`}
                                title="Met à jour les commandes Shopify immédiatement"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncOrdersNowMutation.isPending ? "animate-spin" : ""}`} />
                                Sync commandes
                              </Button>
                              {integration.lastOrderSyncAt && (
                                <span className="text-xs text-muted-foreground">
                                  Dernier sync : {new Date(integration.lastOrderSyncAt).toLocaleString("fr-CA")}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground/60 ml-[88px]">
                              Met à jour les commandes Shopify uniquement. N'importe pas de nouveaux produits.
                            </p>
                          </div>
                          {!isWoo && integration.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase() === "tnt5ar-ki.myshopify.com" && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Reps</span>
                              <Button size="sm" variant="outline" disabled={!integration.isActive || syncRepsMutation.isPending} onClick={() => syncRepsMutation.mutate()}>
                                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncRepsMutation.isPending ? "animate-spin" : ""}`} /> Synchroniser les reps
                              </Button>
                            </div>
                          )}
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
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p>Les données déjà importées sont conservées même si Shopify doit être reconnecté.</p>
              <p>Les opérations de crédit live nécessitent une connexion Shopify active.</p>
            </div>
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
                  className="h-11 w-11 shrink-0"
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
               <div className="responsive-table">
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
               </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
