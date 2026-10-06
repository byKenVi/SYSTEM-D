import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";

type BooksStatus = {
  connected: boolean;
  organizationId: string | null;
  inventoryOrganizationId: string | null;
  region: string;
};

type BooksOrganization = {
  organization_id: string;
  name: string;
  currency_code?: string;
};

type BooksOrganizationsResponse = {
  organizations: BooksOrganization[];
  suggestedOrganizationId: string | null;
};

type ApiError = Error & { code?: string };

async function booksRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "La demande Zoho Books a échoué.") as ApiError;
    error.code = payload.code;
    throw error;
  }
  return payload as T;
}

export function ZohoBooksSettings({
  enabled,
  onReconnect,
}: {
  enabled: boolean;
  onReconnect: () => void;
}) {
  const [organizations, setOrganizations] = useState<BooksOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string; code?: string } | null>(null);

  const statusQuery = useQuery<BooksStatus>({
    queryKey: ["/api/auth/zoho/books/status"],
    queryFn: () => booksRequest<BooksStatus>("/api/auth/zoho/books/status"),
    enabled,
  });

  const refreshBooksData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/books/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin-settings"] });
  };

  const loadAndAutoConfigure = useMutation({
    mutationFn: async () => {
      const result = await booksRequest<BooksOrganizationsResponse>("/api/auth/zoho/books/organizations", {});
      setOrganizations(result.organizations);
      if (result.suggestedOrganizationId) setSelectedOrganizationId(result.suggestedOrganizationId);
      return booksRequest<{ organizationId: string; organizationName: string; message: string }>(
        "/api/auth/zoho/books/configure",
        {},
      );
    },
    onSuccess: (result) => {
      setNotice({ kind: "success", message: result.message || `Organisation « ${result.organizationName} » enregistrée.` });
      refreshBooksData();
    },
    onError: (error: ApiError) => {
      const selectionNeeded = error.message.toLowerCase().includes("selection") || error.message.toLowerCase().includes("select");
      setNotice({
        kind: "error",
        code: error.code,
        message: selectionNeeded
          ? "Plusieurs organisations Books sont disponibles. Choisissez l’organisation à enregistrer ci-dessous."
          : error.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/zoho/books/status"] });
    },
  });

  const saveOrganization = useMutation({
    mutationFn: () => booksRequest<{ organizationId: string; organizationName: string; message: string }>(
      "/api/auth/zoho/books/configure",
      { organizationId: selectedOrganizationId },
    ),
    onSuccess: (result) => {
      setNotice({ kind: "success", message: result.message || `Organisation « ${result.organizationName} » enregistrée.` });
      refreshBooksData();
    },
    onError: (error: ApiError) => setNotice({ kind: "error", message: error.message, code: error.code }),
  });

  const testConnection = useMutation({
    mutationFn: () => booksRequest<{ ok: true; organizationId: string; message: string }>(
      "/api/auth/zoho/books/test",
      {},
    ),
    onSuccess: (result) => {
      setNotice({ kind: "success", message: result.message || "Zoho Books a répondu correctement." });
      refreshBooksData();
    },
    onError: (error: ApiError) => setNotice({ kind: "error", message: error.message, code: error.code }),
  });

  const busy = loadAndAutoConfigure.isPending || saveOrganization.isPending || testConnection.isPending;
  const statusError = statusQuery.error as ApiError | null;
  const needsReconnect = notice?.code === "BOOKS_SCOPE_REQUIRED"
    || notice?.code === "BOOKS_NOT_CONNECTED"
    || statusError?.code === "BOOKS_SCOPE_REQUIRED"
    || statusError?.code === "BOOKS_NOT_CONNECTED";

  return (
    <Card className="border-amber-900/15">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
          <BookOpen className="h-5 w-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">Zoho Books</CardTitle>
          <CardDescription className="mt-1">
            Organisation financière sélectionnée séparément d’Inventory.
          </CardDescription>
        </div>
        {enabled && statusQuery.data && (
          <Badge variant={statusQuery.data.connected ? "default" : "outline"}
            className={statusQuery.data.connected ? "bg-emerald-600" : ""}>
            {statusQuery.data.connected ? "OAuth actif" : "Non connecté"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <div className="rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
            La configuration Books est indisponible pendant une session d’accès de test.
          </div>
        ) : statusQuery.isLoading ? (
          <div className="space-y-3" aria-label="Chargement de Zoho Books">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : statusQuery.isError ? (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Impossible de charger l’état Books : {(statusQuery.error as Error).message}
            </p>
            {needsReconnect && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  La reconnexion Zoho est partagée avec Inventory. Elle demandera aussi les autorisations Books ; confirmez-les sur Zoho.
                </p>
                <Button variant="outline" size="sm" onClick={onReconnect}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Reconnecter Zoho et autoriser Books
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <p>Organisation Books enregistrée : <span className="font-medium">{statusQuery.data?.organizationId || "Aucune"}</span></p>
              <p>Organisation Inventory : <span className="font-medium">{statusQuery.data?.inventoryOrganizationId || "Aucune"}</span></p>
              <p>Région OAuth : <span className="font-medium uppercase">{statusQuery.data?.region || "—"}</span></p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              L’état OAuth et l’organisation Books sont vérifiés séparément. Une organisation Inventory n’est pas considérée comme configurée pour Books.
            </p>

            {organizations.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="zoho-books-organization">Organisation Books à enregistrer</Label>
                <Select value={selectedOrganizationId} onValueChange={setSelectedOrganizationId}>
                  <SelectTrigger id="zoho-books-organization">
                    <SelectValue placeholder="Choisir une organisation" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((organization) => (
                      <SelectItem key={organization.organization_id} value={organization.organization_id}>
                        {organization.name}{organization.currency_code ? ` · ${organization.currency_code}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => { setNotice(null); saveOrganization.mutate(); }}
                  disabled={!enabled || !selectedOrganizationId || busy}
                >
                  {saveOrganization.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer cette organisation
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => { setNotice(null); loadAndAutoConfigure.mutate(); }}
                disabled={!enabled || busy || !statusQuery.data?.connected}
                className="justify-start"
              >
                {loadAndAutoConfigure.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Charger et configurer automatiquement
              </Button>
              <Button
                variant="outline"
                onClick={() => { setNotice(null); testConnection.mutate(); }}
                disabled={!enabled || busy || !statusQuery.data?.connected || !statusQuery.data?.organizationId}
                className="justify-start"
              >
                {testConnection.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <ShieldCheck className="mr-2 h-4 w-4" />}
                Tester les accès Books
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Le test vérifie l’accès aux ventes et aux contacts. Il ne crée ni commande, ni paiement, et ne lance aucune synchronisation.
            </p>
            {!statusQuery.data?.connected && (
              <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Connexion Zoho requise</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Books utilise la même autorisation OAuth que Inventory. Reconnectez Zoho et acceptez aussi les autorisations Books.
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={onReconnect}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Connecter Zoho et autoriser Books
                </Button>
              </div>
            )}

            {notice && (
              <div
                role={notice.kind === "error" ? "alert" : "status"}
                className={`rounded-md border p-3 text-sm ${notice.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-700/20 bg-emerald-700/5 text-emerald-800 dark:text-emerald-300"}`}
              >
                <p className="flex items-start gap-2">
                  {notice.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{notice.message}</span>
                </p>
                {needsReconnect && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs leading-relaxed">
                      La reconnexion Zoho est partagée avec Inventory. Elle demandera aussi les autorisations Books ; confirmez-les sur Zoho pour continuer.
                    </p>
                    <Button size="sm" variant="outline" onClick={onReconnect} disabled={!enabled}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" /> Reconnecter Zoho et autoriser Books
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
