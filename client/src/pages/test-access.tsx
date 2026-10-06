import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, Check, Clock3, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

export interface TestAccessStatus {
  status: "none" | "pending" | "approved" | "revoked" | "expired";
  id?: string;
  code?: string;
  expiresAt?: string;
  scope?: "read_only";
}

export async function testAccessRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Une erreur est survenue. Réessayez.");
  return data as T;
}

function formatExpiry(value?: string) {
  if (!value) return "non précisée";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "non précisée"
    : date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function TestAccessPage() {
  const [requestError, setRequestError] = useState("");
  const statusQuery = useQuery<TestAccessStatus>({
    queryKey: ["/api/test-access/status"],
    queryFn: () => testAccessRequest<TestAccessStatus>("/api/test-access/status"),
    refetchInterval: 3_000,
    retry: false,
  });

  const createRequest = useMutation({
    mutationFn: () => testAccessRequest<TestAccessStatus>("/api/test-access/request", "POST", {}),
    onSuccess: async () => {
      setRequestError("");
      await queryClient.invalidateQueries({ queryKey: ["/api/test-access/status"] });
    },
    onError: (error: Error) => setRequestError(error.message),
  });
  const resetRequest = useMutation({
    mutationFn: () => testAccessRequest("/api/test-access/end", "POST", {}),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/test-access");
    },
  });

  const status = statusQuery.data?.status;

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-12 sm:px-6 flex items-center justify-center">
      <Card className="w-full max-w-xl border-border/70 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Système D · Accès temporaire</p>
            <CardTitle className="mt-2 text-2xl">Inspection de production</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              Demandez un accès de consultation à un administrateur. La session est en lecture seule :
              aucune commande ni aucun crédit ne peut être modifié.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {statusQuery.isLoading ? (
            <div className="space-y-3" aria-label="Chargement de l’accès">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : statusQuery.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                <div className="space-y-2">
                  <p className="font-medium">État de la demande indisponible</p>
                  <p className="text-sm text-muted-foreground">{(statusQuery.error as Error).message}</p>
                  <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>Réessayer</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {status === "approved" && (
                <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-4">
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="font-semibold">Accès approuvé — lecture seule</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Les écritures sont bloquées. La session expire le {formatExpiry(statusQuery.data?.expiresAt)}.
                      </p>
                    </div>
                  </div>
                  <Button className="mt-4 w-full sm:w-auto" onClick={() => window.location.assign("/admin/dashboard")}>
                    Ouvrir le portail
                  </Button>
                </div>
              )}

              {status === "pending" && (
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" />En attente d’approbation</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Transmettez ce code à votre administrateur par un canal de confiance. La demande expire après 10 minutes.
                  </p>
                  {statusQuery.data?.code && (
                    <div className="mt-4 rounded-md border bg-background px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em]" aria-label="Code de confirmation">
                      {statusQuery.data.code}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">Cette page vérifie l’approbation automatiquement.</p>
                </div>
              )}

              {status === "none" && (
                <div className="space-y-3">
                  <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>
                    {createRequest.isPending ? "Envoi de la demande…" : "Demander un accès de test"}
                  </Button>
                </div>
              )}
              {(status === "revoked" || status === "expired") && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {status === "revoked" ? "La demande précédente a été révoquée." : "La demande précédente a expiré."}
                    {" "}Terminez-la pour pouvoir en créer une nouvelle.
                  </p>
                  <Button variant="outline" onClick={() => resetRequest.mutate()} disabled={resetRequest.isPending}>
                    {resetRequest.isPending ? "Réinitialisation…" : "Réinitialiser la demande"}
                  </Button>
                </div>
              )}
              {status === "pending" && (
                <Button variant="outline" onClick={() => resetRequest.mutate()} disabled={resetRequest.isPending}>
                  {resetRequest.isPending ? "Annulation…" : "Annuler la demande"}
                </Button>
              )}
            </>
          )}

          {(requestError || createRequest.isError || resetRequest.isError) && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {requestError || (createRequest.error as Error)?.message || (resetRequest.error as Error)?.message}
            </div>
          )}
          <div className="flex items-start gap-3 border-t pt-4 text-sm text-muted-foreground">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Un accès temporaire permet uniquement de consulter les écrans. Toute action d’écriture est bloquée.</p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
