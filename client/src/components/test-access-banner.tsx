import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AlertTriangle, Clock3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { testAccessRequest, type TestAccessStatus } from "@/pages/test-access";

export function TestAccessBanner() {
  const { data: status } = useQuery<TestAccessStatus>({
    queryKey: ["/api/test-access/status"],
    queryFn: () => testAccessRequest<TestAccessStatus>("/api/test-access/status"),
    refetchInterval: 3_000,
    retry: false,
  });
  const endSession = useMutation({
    mutationFn: () => testAccessRequest("/api/test-access/end", "POST", {}),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/test-access");
    },
  });
  const redirected = useRef(false);
  useEffect(() => {
    if (
      !redirected.current &&
      (status?.status === "revoked" || status?.status === "expired") &&
      status.id
    ) {
      redirected.current = true;
      queryClient.clear();
      window.location.assign("/test-access");
    }
  }, [status?.status, status?.id]);

  if (status?.status !== "approved") return null;
  const expiry = status.expiresAt
    ? new Date(status.expiresAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "non précisée";

  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-100 px-4 py-2 text-amber-950 dark:bg-amber-950/70 dark:text-amber-100" data-testid="banner-test-access">
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">Accès de test — lecture seule.</span>{" "}
          Toutes les écritures sont bloquées. Expire le {expiry}.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 border-amber-700/40 bg-background/60 text-amber-950 hover:bg-background dark:text-amber-100"
        disabled={endSession.isPending}
        onClick={() => endSession.mutate()}
      >
        {endSession.isPending ? <Clock3 className="mr-1.5 h-3.5 w-3.5" /> : <LogOut className="mr-1.5 h-3.5 w-3.5" />}
        Terminer la session
      </Button>
      {endSession.isError && <p role="alert" className="w-full text-xs">Impossible de terminer la session : {(endSession.error as Error).message}</p>}
    </div>
  );
}
