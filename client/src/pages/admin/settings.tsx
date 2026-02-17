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
  Settings,
  Link as LinkIcon,
  Download,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { SiShopify } from "react-icons/si";

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiSecret, setShopifyApiSecret] = useState("");
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");

  const [zohoClientId, setZohoClientId] = useState("");
  const [zohoClientSecret, setZohoClientSecret] = useState("");
  const [zohoRefreshToken, setZohoRefreshToken] = useState("");
  const [zohoOrgId, setZohoOrgId] = useState("");

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: integrations } = useQuery<ShopifyIntegration[]>({
    queryKey: ["/api/shopify-integrations"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin-settings"],
  });

  const connectedClientIds = new Set(integrations?.map((i) => i.contactId) || []);
  const availableClients = contacts?.filter((c) => !connectedClientIds.has(c.id)) || [];

  const connectShopifyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/shopify-integrations", {
        contactId: Number(selectedClient),
        apiKey: shopifyApiKey,
        apiSecret: shopifyApiSecret,
        storeUrl: shopifyStoreUrl,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setShopifyOpen(false);
      setSelectedClient("");
      setShopifyApiKey("");
      setShopifyApiSecret("");
      setShopifyStoreUrl("");
      toast({ title: "Connected", description: "Shopify store connected successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to connect Shopify store.", variant: "destructive" });
    },
  });

  const importProductsMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      await apiRequest("POST", `/api/shopify-integrations/${integrationId}/import`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Imported", description: "Products imported from Shopify." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import products.", variant: "destructive" });
    },
  });

  const saveZohoMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin-settings", {
        zohoInventoryClientId: zohoClientId,
        zohoInventoryClientSecret: zohoClientSecret,
        zohoInventoryRefreshToken: zohoRefreshToken,
        zohoInventoryOrgId: zohoOrgId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
      toast({ title: "Saved", description: "Zoho Inventory credentials saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save credentials.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure integrations and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <SiShopify className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold">Shopify Integration</h3>
                <p className="text-sm text-muted-foreground">Connect client Shopify stores</p>
              </div>
            </div>
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
                    <Label>API Key</Label>
                    <Input
                      value={shopifyApiKey}
                      onChange={(e) => setShopifyApiKey(e.target.value)}
                      placeholder="Shopify API Key"
                      data-testid="input-shopify-api-key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Secret</Label>
                    <Input
                      type="password"
                      value={shopifyApiSecret}
                      onChange={(e) => setShopifyApiSecret(e.target.value)}
                      placeholder="Shopify API Secret"
                      data-testid="input-shopify-api-secret"
                    />
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
                      !shopifyApiKey ||
                      !shopifyApiSecret ||
                      !shopifyStoreUrl ||
                      connectShopifyMutation.isPending
                    }
                    data-testid="button-submit-shopify"
                  >
                    {connectShopifyMutation.isPending ? "Connecting..." : "Connect"}
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
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`shopify-integration-${integration.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {contact?.companyName || contact?.name || "Client"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {integration.storeUrl}
                          </p>
                        </div>
                      </div>
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

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Zoho Inventory</h3>
              <p className="text-sm text-muted-foreground">Connect your Zoho Inventory account</p>
            </div>
            {adminSettings?.zohoInventoryClientId && (
              <Badge variant="default" className="ml-auto">Connected</Badge>
            )}
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={zohoClientId || adminSettings?.zohoInventoryClientId || ""}
                    onChange={(e) => setZohoClientId(e.target.value)}
                    placeholder="Zoho Client ID"
                    data-testid="input-zoho-client-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={zohoClientSecret || adminSettings?.zohoInventoryClientSecret || ""}
                    onChange={(e) => setZohoClientSecret(e.target.value)}
                    placeholder="Zoho Client Secret"
                    data-testid="input-zoho-client-secret"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Refresh Token</Label>
                  <Input
                    type="password"
                    value={zohoRefreshToken || adminSettings?.zohoInventoryRefreshToken || ""}
                    onChange={(e) => setZohoRefreshToken(e.target.value)}
                    placeholder="Zoho Refresh Token"
                    data-testid="input-zoho-refresh-token"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organization ID</Label>
                  <Input
                    value={zohoOrgId || adminSettings?.zohoInventoryOrgId || ""}
                    onChange={(e) => setZohoOrgId(e.target.value)}
                    placeholder="Zoho Organization ID"
                    data-testid="input-zoho-org-id"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => saveZohoMutation.mutate()}
                  disabled={saveZohoMutation.isPending}
                  data-testid="button-save-zoho"
                >
                  {saveZohoMutation.isPending ? "Saving..." : "Save Credentials"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
