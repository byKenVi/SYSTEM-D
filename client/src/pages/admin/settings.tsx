import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact, AdminSettings, ShopifyIntegration } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ShoppingBag,
  Package,
  Link as LinkIcon,
  Download,
  CheckCircle2,
  ExternalLink,
  Plug,
  PlugZap,
  Globe,
  Trash2,
  RefreshCw,
  Clock,
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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [shopifyAppOpen, setShopifyAppOpen] = useState(false);
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");
  const [zohoRegion, setZohoRegion] = useState("us");
  const [orgSelectOpen, setOrgSelectOpen] = useState(false);

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

    if (params.get("shopify_connected") === "true") {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Shopify store connected", description: "OAuth authorization completed successfully." });
      window.history.replaceState({}, "", "/admin/settings");
    } else if (params.get("shopify_error")) {
      toast({
        title: "Shopify connection failed",
        description: decodeURIComponent(params.get("shopify_error") || "Unknown error"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin/settings");
    }
  }, []);

  const isZohoConnected = !!adminSettings?.zohoInventoryRefreshToken;

  const connectedClientIds = new Set(integrations?.map((i) => i.contactId) || []);
  const availableClients = contacts?.filter((c) => !connectedClientIds.has(c.id)) || [];

  const connectShopifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/shopify/connect", {
        contactId: Number(selectedClient),
        storeUrl: shopifyStoreUrl,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setShopifyOpen(false);
      setSelectedClient("");
      setShopifyStoreUrl("");
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate Shopify OAuth. Make sure your Shopify app credentials are configured.",
        variant: "destructive",
      });
    },
  });

  const saveShopifyAppMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/admin-settings", {
        shopifyAppClientId: shopifyClientId,
        shopifyAppClientSecret: shopifyClientSecret,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      setShopifyAppOpen(false);
      toast({ title: "Saved", description: "Shopify app credentials updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save Shopify credentials.", variant: "destructive" });
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
      toast({ title: "Updated", description: "Sync frequency updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sync frequency.", variant: "destructive" });
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
        <p className="text-muted-foreground mt-1">Configure integrations and preferences</p>
      </div>

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
                    Auto-sync Frequency
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
                      <SelectItem value="0">Disabled</SelectItem>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every hour</SelectItem>
                      <SelectItem value="360">Every 6 hours</SelectItem>
                      <SelectItem value="720">Every 12 hours</SelectItem>
                      <SelectItem value="1440">Every 24 hours</SelectItem>
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
                <p className="text-sm text-muted-foreground">
                  {adminSettings?.shopifyAppClientId ? "OAuth 2.0 connected" : "Configure app credentials to get started"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={shopifyAppOpen} onOpenChange={(open) => {
                setShopifyAppOpen(open);
                if (open) {
                  setShopifyClientId(adminSettings?.shopifyAppClientId || "");
                  setShopifyClientSecret(adminSettings?.shopifyAppClientSecret || "");
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="button-shopify-app-settings">
                    <Plug className="h-3.5 w-3.5 mr-1.5" />
                    App Settings
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Shopify App Credentials</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <p className="text-sm text-muted-foreground">
                      Enter your Shopify app's Client ID and Client Secret from the{" "}
                      <a href="https://partners.shopify.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        Shopify Partners Dashboard
                      </a>.
                    </p>
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <Input
                        value={shopifyClientId}
                        onChange={(e) => setShopifyClientId(e.target.value)}
                        placeholder="Shopify App Client ID"
                        data-testid="input-shopify-client-id"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Secret</Label>
                      <Input
                        type="password"
                        value={shopifyClientSecret}
                        onChange={(e) => setShopifyClientSecret(e.target.value)}
                        placeholder="Shopify App Client Secret"
                        data-testid="input-shopify-client-secret"
                      />
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Redirect URI</p>
                      <p className="text-xs font-mono break-all select-all" data-testid="text-shopify-redirect-uri">
                        {`${window.location.origin}/api/auth/shopify/callback`}
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => saveShopifyAppMutation.mutate()}
                      disabled={!shopifyClientId || !shopifyClientSecret || saveShopifyAppMutation.isPending}
                      data-testid="button-save-shopify-app"
                    >
                      {saveShopifyAppMutation.isPending ? "Saving..." : "Save Credentials"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {adminSettings?.shopifyAppClientId && (
                <Dialog open={shopifyOpen} onOpenChange={setShopifyOpen}>
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
                        Select a client and enter their Shopify store URL. You'll be redirected to Shopify to authorize access.
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
                      <Button
                        className="w-full"
                        onClick={() => connectShopifyMutation.mutate()}
                        disabled={
                          !selectedClient ||
                          !shopifyStoreUrl ||
                          connectShopifyMutation.isPending
                        }
                        data-testid="button-submit-shopify"
                      >
                        {connectShopifyMutation.isPending ? "Redirecting to Shopify..." : "Authorize on Shopify"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {contact?.companyName || contact?.name || "Client"}
                              {integration.shopName && (
                                <span className="text-muted-foreground font-normal"> — {integration.shopName}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {integration.storeUrl}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => importProductsMutation.mutate(integration.id)}
                            disabled={importProductsMutation.isPending}
                            data-testid={`button-import-products-${integration.id}`}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Import
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => disconnectShopifyMutation.mutate(integration.id)}
                            disabled={disconnectShopifyMutation.isPending}
                            data-testid={`button-disconnect-shopify-${integration.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Disconnect
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1 border-t border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3" />
                          <span>Auto-sync:</span>
                        </div>
                        <Select
                          value={String(integration.syncFrequencyMinutes || 0)}
                          onValueChange={(val) =>
                            updateSyncFrequencyMutation.mutate({
                              id: integration.id,
                              syncFrequencyMinutes: Number(val),
                            })
                          }
                        >
                          <SelectTrigger
                            className="h-7 w-[160px] text-xs"
                            data-testid={`select-sync-frequency-${integration.id}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Disabled</SelectItem>
                            <SelectItem value="15">Every 15 minutes</SelectItem>
                            <SelectItem value="30">Every 30 minutes</SelectItem>
                            <SelectItem value="60">Every hour</SelectItem>
                            <SelectItem value="360">Every 6 hours</SelectItem>
                            <SelectItem value="720">Every 12 hours</SelectItem>
                            <SelectItem value="1440">Every 24 hours</SelectItem>
                          </SelectContent>
                        </Select>
                        {integration.lastAutoSyncAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last: {new Date(integration.lastAutoSyncAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No Shopify stores connected yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Multiple org selection dialog */}
      <Dialog open={orgSelectOpen} onOpenChange={setOrgSelectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Zoho Organization</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Multiple organizations found. Choose which one to connect:</p>
          <div className="space-y-2 mt-2">
            {pendingOrgs?.organizations?.map((org: any) => (
              <Button
                key={org.organization_id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => selectOrgMutation.mutate(org.organization_id)}
                disabled={selectOrgMutation.isPending}
                data-testid={`button-select-org-${org.organization_id}`}
              >
                <Package className="h-4 w-4 mr-2" />
                {org.name}
                <span className="ml-auto text-xs text-muted-foreground">{org.organization_id}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
