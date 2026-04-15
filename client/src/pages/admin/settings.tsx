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
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SiShopify } from "react-icons/si";

const ZOHO_REGIONS = [
  { value: "us", label: "United States (zoho.com)" },
  { value: "eu", label: "Europe (zoho.eu)" },
  { value: "in", label: "India (zoho.in)" },
  { value: "au", label: "Australia (zoho.com.au)" },
  { value: "jp", label: "Japan (zoho.jp)" },
  { value: "ca", label: "Canada (zohocloud.ca)" },
];

const SYNC_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Every 24 hours" },
];

const TYPE_LABELS: Record<string, string> = {
  shopify_auto_sync: "Auto Sync",
  shopify_import: "Shopify Import",
  shopify_orders_sync: "Orders Sync",
  zoho_push: "Zoho Push",
  zoho_inventory_sync: "Zoho Inventory",
  contact_invite: "Invite Sent",
  contact_revoke: "Access Revoked",
  contact_delete: "Contact Deleted",
  product_delete: "Product Deleted",
  restock_request: "Work Order",
  shopify_writeback: "Shopify Writeback",
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
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [zohoRegion, setZohoRegion] = useState("us");
  const [orgSelectOpen, setOrgSelectOpen] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: integrations } = useQuery<ShopifyIntegration[]>({
    queryKey: ["/api/shopify-integrations"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin-settings"],
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
      toast({ title: "Zoho Inventory connected", description: "Your account has been linked successfully." });
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("zoho_select_org") === "true") {
      setOrgSelectOpen(true);
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("zoho_error")) {
      toast({
        title: "Zoho connection failed",
        description: decodeURIComponent(params.get("zoho_error") || "Unknown error"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin/settings");
    }

  }, []);

  const isZohoConnected = !!adminSettings?.zohoInventoryRefreshToken;
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
      const res = await apiRequest("POST", "/api/shopify-integrations/connect", {
        contactId: Number(selectedClient),
        storeUrl: shopifyStoreUrl,
        accessToken: shopifyAccessToken,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setShopifyOpen(false);
      setSelectedClient("");
      setShopifyStoreUrl("");
      setShopifyAccessToken("");
      toast({ title: "Store connected", description: "Shopify store has been linked successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect Shopify store. Check the store URL and access token.",
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
        title: "Import Complete",
        description: data.message || `${data.imported} new, ${data.updated} updated (${data.total} total)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products from Shopify.",
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
      toast({ title: "Disconnected", description: "Shopify store removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect store.", variant: "destructive" });
    },
  });

  const updateSyncFrequencyMutation = useMutation({
    mutationFn: async ({ id, syncFrequencyMinutes }: { id: number; syncFrequencyMinutes: number }) => {
      await apiRequest("PATCH", `/api/shopify-integrations/${id}/sync-frequency`, { syncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      toast({ title: "Updated", description: "Product sync frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sync frequency.", variant: "destructive" });
    },
  });

  const updateOrderSyncFrequencyMutation = useMutation({
    mutationFn: async ({ id, orderSyncFrequencyMinutes }: { id: number; orderSyncFrequencyMinutes: number }) => {
      await apiRequest("PATCH", `/api/shopify-integrations/${id}/order-sync-frequency`, { orderSyncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      toast({ title: "Updated", description: "Order sync frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update order sync frequency.", variant: "destructive" });
    },
  });

  const syncOrdersNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/orders/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Orders synced", description: data.message || `${data.synced} orders synced.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to sync orders.", variant: "destructive" });
    },
  });

  const updateZohoSyncFrequencyMutation = useMutation({
    mutationFn: async (zohoSyncFrequencyMinutes: number) => {
      await apiRequest("PATCH", "/api/admin-settings", { zohoSyncFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Updated", description: "Zoho sync frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update Zoho sync frequency.", variant: "destructive" });
    },
  });

  const updateShopifyWritebackFrequencyMutation = useMutation({
    mutationFn: async (shopifyWritebackFrequencyMinutes: number) => {
      await apiRequest("PATCH", "/api/admin-settings", { shopifyWritebackFrequencyMinutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Updated", description: "Shopify writeback frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update Shopify writeback frequency.", variant: "destructive" });
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
        title: "Error",
        description: err.message || "Failed to start Zoho connection",
        variant: "destructive",
      });
    },
  });

  const disconnectZohoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/auth/zoho/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Disconnected", description: "Zoho Inventory has been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    },
  });

  const selectOrgMutation = useMutation({
    mutationFn: async (organizationId: string) =>
      apiRequest("POST", "/api/auth/zoho/select-organization", { organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      setOrgSelectOpen(false);
      toast({ title: "Organization selected", description: "Zoho Inventory connected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to select organization.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure integrations and view system activity</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList data-testid="tabs-settings">
          <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
          <TabsTrigger value="activity-log" data-testid="tab-activity-log">Activity Log</TabsTrigger>
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
                      ? adminSettings?.zohoInventoryOrgName || "Connected"
                      : "Connect via OAuth 2.0"}
                  </p>
                </div>
                {isZohoConnected && (
                  <Badge variant="default" className="ml-auto bg-emerald-600">Connected</Badge>
                )}
              </CardHeader>
              <CardContent>
                {settingsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : isZohoConnected ? (
                  <div className="space-y-4">
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-emerald-800 dark:text-emerald-300">Connected</p>
                        {adminSettings?.zohoInventoryOrgName && (
                          <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5">
                            Organization: {adminSettings.zohoInventoryOrgName}
                          </p>
                        )}
                        {adminSettings?.zohoInventoryOrgId && (
                          <p className="text-emerald-600 dark:text-emerald-500 text-xs">
                            Org ID: {adminSettings.zohoInventoryOrgId}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5" />
                        Zoho → App Sync Frequency
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
                        Zoho → Shopify Writeback Frequency
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Pushes Zoho inventory levels back to connected Shopify stores
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
                      {disconnectZohoMutation.isPending ? "Disconnecting..." : "Disconnect Zoho Inventory"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Setup required</p>
                      <p>You'll be redirected to Zoho to authorize access. Make sure your Zoho API Console app has this redirect URI set:</p>
                      <code className="block mt-1 text-xs bg-muted rounded px-2 py-1 break-all">
                        {window.location.origin}/api/auth/zoho/callback
                      </code>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        Data Center Region
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
                      {connectZohoMutation.isPending ? "Redirecting..." : "Connect with Zoho"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Shopify Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <SiShopify className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Shopify Integration</h3>
                    <p className="text-sm text-muted-foreground">Connect stores using a Shopify Admin API token</p>
                  </div>
                </div>
                <Dialog open={shopifyOpen} onOpenChange={(open) => {
                  setShopifyOpen(open);
                  if (!open) {
                    setSelectedClient("");
                    setShopifyStoreUrl("");
                    setShopifyAccessToken("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-connect-shopify">
                      <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                      Connect Store
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Connect Shopify Store</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <p className="text-sm text-muted-foreground">
                        Enter the client's store URL and a Shopify Admin API access token. You can generate one in your Shopify admin under <strong>Apps → Develop apps</strong>.
                      </p>
                      <div className="space-y-2">
                        <Label>Client</Label>
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                          <SelectTrigger data-testid="select-shopify-client">
                            <SelectValue placeholder="Select a client" />
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
                      <div className="space-y-2">
                        <Label>Store URL</Label>
                        <Input
                          value={shopifyStoreUrl}
                          onChange={(e) => setShopifyStoreUrl(e.target.value)}
                          placeholder="mystore.myshopify.com"
                          data-testid="input-shopify-store-url"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Admin API Access Token</Label>
                        <Input
                          type="password"
                          value={shopifyAccessToken}
                          onChange={(e) => setShopifyAccessToken(e.target.value)}
                          placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                          data-testid="input-shopify-access-token"
                        />
                        <p className="text-xs text-muted-foreground">The token requires <code>read_products</code>, <code>read_inventory</code>, and <code>write_inventory</code> scopes.</p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => connectShopifyMutation.mutate()}
                        disabled={!selectedClient || !shopifyStoreUrl || !shopifyAccessToken || connectShopifyMutation.isPending}
                        data-testid="button-submit-shopify"
                      >
                        {connectShopifyMutation.isPending ? "Connecting..." : "Connect Store"}
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
                      return (
                        <div
                          key={integration.id}
                          className="p-4 rounded-md bg-muted/50 space-y-3"
                          data-testid={`shopify-integration-${integration.id}`}
                        >
                          {/* Store header */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate" data-testid={`text-shopify-store-${integration.id}`}>
                                  {integration.shopName || integration.storeUrl}
                                </p>
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
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Products</span>
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
                              Import now
                            </Button>
                            {integration.lastAutoSyncAt && (
                              <span className="text-xs text-muted-foreground">
                                Last: {new Date(integration.lastAutoSyncAt).toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* Orders sync row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Orders</span>
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
                              Sync now
                            </Button>
                            {integration.lastOrderSyncAt && (
                              <span className="text-xs text-muted-foreground">
                                Last: {new Date(integration.lastOrderSyncAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <SiShopify className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No stores connected yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Click "Connect Store" to link a client's Shopify store</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Org Select Dialog */}
          <Dialog open={orgSelectOpen} onOpenChange={setOrgSelectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select Zoho Organization</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-muted-foreground">
                  Multiple organizations were found. Select which one to connect:
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
                placeholder="Search log messages..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-logs"
              />
            </div>
            <Select value={logTypeFilter} onValueChange={setLogTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {allLogTypes.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
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
                    <TableHead className="text-right whitespace-nowrap">Date & Time</TableHead>
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
                        <p className="text-sm text-muted-foreground">No log entries found</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Activity will appear here as actions are performed</p>
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
