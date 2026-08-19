import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  Search,
  RefreshCw,
  ChevronDown,
  Users,
  Layers,
  AlertCircle,
  ExternalLink,
  BoxIcon,
  Trash2,
  Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@shared/schema";

interface ZohoInventoryItem {
  zohoItemId: string;
  localProductId: number | null;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  price: string | null;
  inventoryQuantity: number;
  cfClient: string | null;
  contactId: number | null;
  contactName: string | null;
  status: string | null;
  unit: string | null;
  productType: string | null;
}

interface InventoryResponse {
  items: ZohoInventoryItem[];
  total: number;
}

// Pattern matching operational service items created per soumission
const OPERATIONAL_PREFIX_RE = /^(ENT|LIV|TRI|INS|BTP|F\d+)-/i;

function isOperationalItem(item: ZohoInventoryItem): boolean {
  return item.productType === "service" && OPERATIONAL_PREFIX_RE.test(item.name);
}

export default function AdminInventaire() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<boolean>(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ZohoInventoryItem | null>(null);
  const [showOperational, setShowOperational] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (zohoItemId: string) => apiRequest("DELETE", `/api/zoho/items/${zohoItemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zoho/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteTarget(null);
      toast({ title: "Produit supprimé de Zoho Inventory" });
    },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery<InventoryResponse>({
    queryKey: ["/api/zoho/inventory"],
    queryFn: () => fetch("/api/zoho/inventory", { credentials: "include" }).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || "Zoho non connecté ou erreur API");
      }
      return r.json();
    }),
    staleTime: 2 * 60 * 1000,
    retry: false,
    // Keep the last successful data visible when a re-fetch fails (e.g. 429 rate limit).
    // This way the inventory table stays populated instead of going blank.
    placeholderData: (prev) => prev,
  });

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const items = data?.items ?? [];

  const operationalCount = useMemo(() => items.filter(isOperationalItem).length, [items]);

  const filtered = useMemo(() => items.filter((item) => {
    if (!showOperational && isOperationalItem(item)) return false;
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.cfClient || "").toLowerCase().includes(search.toLowerCase());
    const matchesClient =
      clientFilter === "all" ||
      (clientFilter === "__unmatched__"
        ? !item.contactId
        : String(item.contactId) === clientFilter);
    return matchesSearch && matchesClient;
  }), [items, search, clientFilter, showOperational]);

  const groupedByClient = useMemo(() => {
    if (!groupBy) return [];
    const groups = new Map<string, ZohoInventoryItem[]>();
    for (const item of filtered) {
      const key = item.contactId
        ? `contact-${item.contactId}`
        : item.cfClient
        ? `cf-${item.cfClient}`
        : "__unmatched__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries())
      .map(([key, groupItems]) => ({
        key,
        label: groupItems[0].contactName ?? groupItems[0].cfClient ?? "Sans client",
        contactId: groupItems[0].contactId,
        items: groupItems,
      }))
      .sort((a, b) => {
        if (a.key === "__unmatched__") return 1;
        if (b.key === "__unmatched__") return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filtered, groupBy]);

  const toggleCollapse = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.contactId && !seen.has(String(item.contactId))) {
        seen.set(String(item.contactId), item.contactName ?? item.cfClient ?? `#${item.contactId}`);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const hasUnmatched = items.some((i) => !i.contactId);

  const totalStock = filtered.reduce((sum, i) => sum + i.inventoryQuantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Inventaire Zoho</h1>
          <p className="text-muted-foreground mt-1">
            Tous les produits de votre organisation Zoho Inventory
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.fetchQuery({
              queryKey: ["/api/zoho/inventory"],
              queryFn: () => fetch("/api/zoho/inventory?force=true", { credentials: "include" }).then(async (r) => {
                if (!r.ok) {
                  const body = await r.json().catch(() => ({}));
                  throw new Error(body.message || "Zoho non connecté ou erreur API");
                }
                return r.json();
              }),
            });
          }}
          disabled={isFetching}
          data-testid="button-refresh-inventory"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats bar — shown even when there's an error if we have stale data */}
      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BoxIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Références Zoho</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{items.length.toLocaleString("fr-CA")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Unités en stock</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{totalStock.toLocaleString("fr-CA")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Clients associés</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{clientOptions.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher produit, SKU, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-inventory"
          />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-client-filter">
            <SelectValue placeholder="Tous les clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {clientOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
            {hasUnmatched && (
              <SelectItem value="__unmatched__">— Sans correspondance</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button
          variant={groupBy ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setGroupBy((p) => !p)}
          data-testid="button-toggle-groupby"
        >
          <Layers className="h-3.5 w-3.5" />
          Grouper par client
        </Button>
        <Button
          variant={showOperational ? "secondary" : "outline"}
          size="sm"
          className={`h-9 gap-1.5 text-xs ${showOperational ? "border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700" : ""}`}
          onClick={() => setShowOperational((p) => !p)}
          data-testid="button-toggle-operational"
          title="Services opérationnels créés par soumission (ENT-, LIV-, TRI-, INS-, BTP-, F[n]-)"
        >
          <Wrench className="h-3.5 w-3.5" />
          Services opérationnels
          {operationalCount > 0 && (
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 h-4">
              {operationalCount}
            </Badge>
          )}
        </Button>
        {filtered.length !== items.length && (
          <Badge variant="secondary" className="tabular-nums">
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Error banner — shown above stale data when a re-fetch fails */}
      {error && (() => {
        const msg = (error as Error).message || "";
        const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("taux d'appel") || msg.toLowerCase().includes("rate_limited") || msg.toLowerCase().includes("limite");
        const hasStaleData = items.length > 0;
        return (
          <Card className={isRateLimit ? "border-orange-300 dark:border-orange-800" : "border-destructive/50"}>
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isRateLimit ? "text-orange-500" : "text-destructive"}`} />
              <div className="flex-1">
                <p className={`font-medium text-sm ${isRateLimit ? "text-orange-700 dark:text-orange-400" : "text-destructive"}`}>
                  {isRateLimit
                    ? "Limite d'appels Zoho atteinte pour aujourd'hui"
                    : "Impossible de charger l'inventaire Zoho"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRateLimit
                    ? `Quota journalier (7 500 appels/jour) épuisé. L'inventaire sera de nouveau actualisable demain.${hasStaleData ? " Les données ci-dessous sont celles du dernier chargement réussi." : ""}`
                    : msg.includes("401") || msg.toLowerCase().includes("token") || msg.toLowerCase().includes("unauthorized")
                      ? "Token Zoho expiré — reconnectez Zoho Inventory dans les Paramètres."
                      : msg.toLowerCase().includes("not connected") || msg.toLowerCase().includes("refresh token")
                        ? "Zoho Inventory n'est pas connecté — configurez la connexion dans les Paramètres."
                        : "Vérifiez que Zoho Inventory est connecté et configuré dans les Paramètres."}
                </p>
                {!isRateLimit && (
                  <Link href="/admin/settings">
                    <Button variant="outline" size="sm" className="mt-3">Aller aux Paramètres</Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Table — flat mode (shown even when error, if stale data is available) */}
      {(!error || items.length > 0) && !groupBy && (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {items.length === 0
                    ? "Aucun produit dans votre organisation Zoho Inventory."
                    : "Aucun produit ne correspond à vos filtres."}
                </p>
              </div>
            ) : (
               <div className="responsive-table scrollbar-hide">
                <Table className="min-w-[700px] w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Client (cf_client)</TableHead>
                      <TableHead>Correspondance</TableHead>
                      <TableHead className="text-right">Prix</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <ZohoItemRow key={item.zohoItemId} item={item} onDelete={setDeleteTarget} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table — grouped mode (shown even when error, if stale data is available) */}
      {(!error || items.length > 0) && groupBy && (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : groupedByClient.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
              </div>
            ) : (
              <div className="divide-y">
                {groupedByClient.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.key);
                  const groupStock = group.items.reduce((s, i) => s + i.inventoryQuantity, 0);
                  return (
                    <div key={group.key} data-testid={`group-${group.key}`}>
                      <button
                        type="button"
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-b w-full text-left hover:bg-muted/50 transition-colors"
                        onClick={() => toggleCollapse(group.key)}
                        data-testid={`button-toggle-group-${group.key}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="font-semibold text-sm" data-testid={`text-group-label-${group.key}`}>
                            {group.label}
                          </span>
                          {group.contactId && (
                            <Badge variant="secondary" className="text-[10px] font-normal px-1.5">
                              Associé
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs font-normal">
                            {group.items.length} produit{group.items.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{groupStock.toLocaleString("fr-CA")} en stock</span>
                          {group.contactId && (
                            <Link
                              href={`/admin/contacts/${group.contactId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              Voir le client →
                            </Link>
                          )}
                        </div>
                      </button>
                      {!isCollapsed && (
                         <div className="responsive-table scrollbar-hide">
                          <Table className="min-w-[700px] w-full">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Produit</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>cf_client</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Prix</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead className="w-8" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.items.map((item) => (
                                <ZohoItemRow key={item.zohoItemId} item={item} hideClient onDelete={setDeleteTarget} />
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce produit ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            « <strong>{deleteTarget?.name}</strong> » sera supprimé définitivement de Zoho Inventory{deleteTarget?.localProductId ? " et de l'inventaire local" : ""}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-zoho">Annuler</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.zohoItemId)}
              data-testid="button-confirm-delete-zoho"
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ZohoItemRow({ item, hideClient, onDelete }: { item: ZohoInventoryItem; hideClient?: boolean; onDelete: (item: ZohoInventoryItem) => void }) {
  const zohoUrl = `https://inventory.zoho.com/app#/inventory/items/${item.zohoItemId}`;
  return (
    <TableRow data-testid={`row-zoho-item-${item.zohoItemId}`} className="group">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <span className="font-medium text-sm" data-testid={`text-item-name-${item.zohoItemId}`}>{item.name}</span>
            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground font-mono text-sm">{item.sku || "—"}</TableCell>
      {!hideClient ? (
        <>
          <TableCell>
            {item.cfClient ? (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{item.cfClient}</span>
            ) : (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </TableCell>
          <TableCell>
            {item.contactId ? (
              <Link href={`/admin/contacts/${item.contactId}`}>
                <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-muted">
                  {item.contactName}
                </Badge>
              </Link>
            ) : item.cfClient ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">Non associé</span>
            ) : (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </TableCell>
        </>
      ) : (
        <TableCell>
          {item.cfClient ? (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{item.cfClient}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          )}
        </TableCell>
      )}
      {hideClient && (
        <TableCell>
          <span className="text-xs text-muted-foreground">{item.productType || "—"}</span>
        </TableCell>
      )}
      <TableCell className="text-right font-mono text-sm">
        {item.price ? `$${Number(item.price).toFixed(2)}` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium text-sm" data-testid={`text-stock-${item.zohoItemId}`}>
        <span className={item.inventoryQuantity === 0 ? "text-muted-foreground" : ""}>
          {item.inventoryQuantity.toLocaleString("fr-CA")}
        </span>
        {item.unit && (
          <span className="text-muted-foreground text-xs ml-1">{item.unit}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={zohoUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`link-zoho-item-${item.zohoItemId}`}
            title="Voir dans Zoho Inventory"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item)}
            data-testid={`button-delete-zoho-item-${item.zohoItemId}`}
            title="Supprimer de Zoho Inventory"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
