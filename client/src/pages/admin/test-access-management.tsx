import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, Check, Clock3, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";
import { testAccessRequest, type TestAccessStatus } from "@/pages/test-access";

interface TestRequest {
  id: string;
  code: string;
  status: "pending" | "approved";
  createdAt: string;
  expiresAt: string;
  scope: "read_only";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date indisponible"
    : date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function TestAccessManagement() {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const status = useQuery<TestAccessStatus>({
    queryKey: ["/api/test-access/status"],
    queryFn: () => testAccessRequest<TestAccessStatus>("/api/test-access/status"),
    refetchInterval: 3_000,
    retry: false,
  });
  const requests = useQuery<TestRequest[]>({
    queryKey: ["/api/admin/test-access"],
    queryFn: () => testAccessRequest<TestRequest[]>("/api/admin/test-access"),
    enabled: !!status.data && status.data.status !== "approved" && !status.isError,
    refetchInterval: 5_000,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/test-access"] });
  const approve = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      testAccessRequest(`/api/admin/test-access/${id}/approve`, "POST", { code }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => testAccessRequest(`/api/admin/test-access/${id}/revoke`, "POST", {}),
    onSuccess: refresh,
  });

  if (status.isLoading) {
    return <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-16 w-full" /></CardContent></Card>;
  }
  if (status.data?.status === "approved") {
    return (
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" />Accès de test actif</CardTitle>
          <CardDescription>Cette session est en lecture seule. Les contrôles d’administration sont désactivés.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Toutes les écritures sont bloquées. Expiration : {status.data.expiresAt ? dateLabel(status.data.expiresAt) : "non précisée"}.</CardContent>
      </Card>
    );
  }
  if (status.isError) {
    return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertCircle className="mr-2 inline h-4 w-4 text-destructive" />Impossible de vérifier le mode de session : {(status.error as Error).message}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Demandes d’accès de test</CardTitle>
        <CardDescription>
          Accès de consultation uniquement, valable 30 minutes après approbation. Approuvez uniquement un code que vous reconnaissez, reçu du testeur par messagerie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : requests.isError ? (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Impossible de charger les demandes</p>
            <p className="mt-1 text-muted-foreground">{(requests.error as Error).message}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => requests.refetch()}>Réessayer</Button>
          </div>
        ) : !requests.data?.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 font-medium">Aucune demande en attente</p>
            <p className="mt-1 text-sm text-muted-foreground">Les nouvelles demandes apparaîtront ici automatiquement.</p>
          </div>
        ) : requests.data.map((request) => {
          const code = codes[request.id] ?? "";
          const isBusy = approve.isPending || revoke.isPending;
          return (
            <div key={request.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Demande {request.id}</span>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">En attente</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Reçue le {dateLabel(request.createdAt)} · expire le {dateLabel(request.expiresAt)}</p>
                </div>
                <p className="font-mono text-lg font-semibold tracking-wider" aria-label="Code transmis par le testeur">{request.code}</p>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={code}
                  onChange={(event) => setCodes((current) => ({ ...current, [request.id]: event.target.value }))}
                  placeholder="Saisir le code communiqué par le testeur"
                  aria-label={`Saisir le code de confirmation de la demande ${request.id}`}
                  autoComplete="off"
                  className="sm:max-w-xs"
                />
                <Button
                  disabled={isBusy || code !== request.code}
                  onClick={() => approve.mutate({ id: request.id, code })}
                >
                  <Check className="mr-2 h-4 w-4" />Approuver 30 min
                </Button>
                <Button variant="outline" disabled={isBusy} onClick={() => revoke.mutate(request.id)}>
                  <X className="mr-2 h-4 w-4" />Révoquer
                </Button>
              </div>
              {(approve.isError || revoke.isError) && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {(approve.error as Error | null)?.message || (revoke.error as Error | null)?.message}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
