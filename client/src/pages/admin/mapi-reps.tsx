import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  CreditCard,
  MinusCircle,
  UserX,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  XCircle,
  Search,
  Users,
  Wallet,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import type { MapiRep, MapiRepCreditLog } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function money(amount: string | number | null | undefined, currency = "CAD") {
  const n = parseFloat(String(amount ?? "0"));
  return n.toLocaleString("fr-CA", { style: "currency", currency, minimumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-CA", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fullName(rep: MapiRep) {
  return [rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email;
}

function BalanceBadge({ amount }: { amount: string | null | undefined }) {
  const n = parseFloat(amount ?? "0");
  const cls = n > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return <Badge className={`${cls} border-0 tabular-nums`}>{money(amount)}</Badge>;
}

function TxnTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    credit:       { label: "Crédit",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: TrendingUp },
    debit:        { label: "Débit",     cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: TrendingDown },
    monthly_renewal: { label: "Renouvellement", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: RotateCcw },
    deactivate:   { label: "Désactivation", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: XCircle },
    Credit:       { label: "Crédit",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: TrendingUp },
    Debit:        { label: "Débit",     cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: TrendingDown },
    Expiration:   { label: "Expiré",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
    DebitRevert:  { label: "Réversion", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: RotateCcw },
  };
  const cfg = map[type] ?? { label: type, cls: "", icon: CreditCard };
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.cls} border-0 text-xs flex items-center gap-1`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </Badge>
  );
}

// ─── Add Rep Dialog ───────────────────────────────────────────────────────────

function AddRepDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "" });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/mapi/reps", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      toast({ title: "Rep créé", description: "Le représentant a été ajouté avec succès." });
      setForm({ email: "", firstName: "", lastName: "" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un représentant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rep-email">Courriel *</Label>
            <Input
              id="rep-email"
              type="email"
              placeholder="jean.tremblay@mapi.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              data-testid="input-rep-email"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-first">Prénom</Label>
              <Input
                id="rep-first"
                placeholder="Jean"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                data-testid="input-rep-first-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-last">Nom</Label>
              <Input
                id="rep-last"
                placeholder="Tremblay"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                data-testid="input-rep-last-name"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Le représentant sera créé dans Shopify avec le tag <code className="bg-muted px-1 rounded">mapi-rep</code> et commencera avec un solde de $0.00.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!form.email || mutation.isPending}
            data-testid="button-submit-add-rep"
          >
            {mutation.isPending ? "Création..." : "Créer le rep"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credit Dialog ────────────────────────────────────────────────────────────

function CreditDialog({ rep, open, onClose }: { rep: MapiRep; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapi/reps/${rep.id}/credit`, { amount, currency: "CAD", reason });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps", rep.id] });
      toast({ title: "Crédit ajouté", description: `Nouveau solde : ${money(data.rep?.currentBalance)}` });
      setAmount(""); setReason("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un crédit — {fullName(rep)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Montant (CAD)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="500.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-credit-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Raison (optionnel)</Label>
            <Input
              placeholder="Renouvellement mensuel, bonus..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-credit-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            data-testid="button-submit-credit"
          >
            {mutation.isPending ? "En cours..." : "Créditer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Debit Dialog ─────────────────────────────────────────────────────────────

function DebitDialog({ rep, open, onClose }: { rep: MapiRep; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const balance = parseFloat(rep.currentBalance ?? "0");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapi/reps/${rep.id}/debit`, { amount, currency: "CAD", reason });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps", rep.id] });
      toast({ title: "Débit effectué", description: `Nouveau solde : ${money(data.rep?.currentBalance)}` });
      setAmount(""); setReason("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Débiter — {fullName(rep)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Solde actuel : <span className="font-semibold text-foreground">{money(rep.currentBalance)}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Montant (CAD)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={balance}
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-debit-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Raison *</Label>
            <Input
              placeholder="Correction, remboursement..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-debit-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || !reason || mutation.isPending}
            data-testid="button-submit-debit"
          >
            {mutation.isPending ? "En cours..." : "Débiter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rep Detail View ──────────────────────────────────────────────────────────

function RepDetail({ repId, onBack }: { repId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [showCredit, setShowCredit] = useState(false);
  const [showDebit, setShowDebit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [budgetEdit, setBudgetEdit] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);

  const { data, isLoading } = useQuery<{ rep: MapiRep; logs: MapiRepCreditLog[]; shopifyTransactions: any[] }>({
    queryKey: ["/api/mapi/reps", repId],
    queryFn: async () => {
      const res = await fetch(`/api/mapi/reps/${repId}`);
      if (!res.ok) throw new Error("Impossible de charger le rep");
      return res.json();
    },
  });

  const renewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapi/reps/${repId}/monthly-renewal`, {});
      return res.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps", repId] });
      toast({ title: "Renouvellement effectué", description: `Nouveau solde : ${money(d.rep?.currentBalance)}` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mapi/reps/${repId}/deactivate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      toast({ title: "Rep désactivé", description: "Le représentant a été archivé." });
      onBack();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateBudgetMutation = useMutation({
    mutationFn: async (amount: string) => {
      const res = await apiRequest("POST", `/api/mapi/reps/${repId}/budget`, { monthlyBudgetAmount: amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps", repId] });
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      setEditingBudget(false);
      toast({ title: "Budget mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const rep = data?.rep;
  const logs = data?.logs ?? [];
  const shopifyTxns = data?.shopifyTransactions ?? [];

  if (!rep) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-4">
          <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
        </Button>
        <p className="text-muted-foreground">Rep introuvable.</p>
      </div>
    );
  }

  const balance = parseFloat(rep.currentBalance ?? "0");
  const hasMonthlyBudget = rep.monthlyBudgetAmount && parseFloat(rep.monthlyBudgetAmount) > 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1" data-testid="button-back-reps">
          <ArrowLeft className="h-4 w-4 mr-1.5" />Tous les reps
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-rep-name">{fullName(rep)}</h1>
            <p className="text-muted-foreground mt-0.5">{rep.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rep.status === "active" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowCredit(true)} data-testid="button-credit-rep">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Créditer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDebit(true)} disabled={balance <= 0} data-testid="button-debit-rep">
                  <TrendingDown className="h-3.5 w-3.5 mr-1.5" />Débiter
                </Button>
                {hasMonthlyBudget && (
                  <Button size="sm" variant="outline" onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending} data-testid="button-renew-rep">
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {renewMutation.isPending ? "..." : "Renouveler"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge className={rep.status === "active"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0"}>
            {rep.status === "active" ? "Actif" : "Archivé"}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">{rep.shopifyCustomerGid}</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className={balance > 0 ? "border-emerald-200 dark:border-emerald-900/40" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Solde actuel</p>
                <p className="text-3xl font-bold mt-1 tabular-nums" data-testid="text-rep-balance">{money(rep.currentBalance)}</p>
                {rep.lastBalanceRefreshAt && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Mis à jour {new Date(rep.lastBalanceRefreshAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${balance > 0 ? "bg-emerald-500/10" : "bg-muted"}`}>
                <Wallet className={`h-5 w-5 ${balance > 0 ? "text-emerald-500" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Budget mensuel</p>
                {editingBudget ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-sm w-28"
                      value={budgetEdit}
                      onChange={(e) => setBudgetEdit(e.target.value)}
                      data-testid="input-budget-amount"
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={() => updateBudgetMutation.mutate(budgetEdit)} disabled={updateBudgetMutation.isPending}>
                      ✓
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingBudget(false)}>✕</Button>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold mt-1 tabular-nums" data-testid="text-rep-budget">
                      {hasMonthlyBudget ? money(rep.monthlyBudgetAmount) : "—"}
                    </p>
                    {rep.status === "active" && (
                      <button
                        className="text-[10px] text-primary underline mt-1"
                        onClick={() => { setBudgetEdit(rep.monthlyBudgetAmount ?? ""); setEditingBudget(true); }}
                        data-testid="link-edit-budget"
                      >
                        Modifier
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Transactions</p>
            <p className="text-3xl font-bold mt-1">{logs.length + shopifyTxns.length}</p>
            <p className="text-xs text-muted-foreground mt-1">total enregistrées</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Historique des transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shopifyTxns.length === 0 && logs.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">Aucune transaction pour l'instant</p>
          ) : (
            <div className="divide-y divide-border">
              {/* Shopify live transactions */}
              {shopifyTxns.map((txn, i) => (
                <div key={`shopify-${i}`} className="px-6 py-3 flex items-center justify-between gap-4" data-testid={`row-txn-shopify-${i}`}>
                  <div className="flex items-center gap-3">
                    <TxnTypeBadge type={txn.type} />
                    <div>
                      <p className="text-xs text-muted-foreground">{fmtDate(txn.createdAt)}</p>
                      {txn.expiresAt && <p className="text-xs text-amber-600">Expire : {fmtDate(txn.expiresAt)}</p>}
                    </div>
                  </div>
                  <span className={`font-semibold tabular-nums text-sm ${txn.type === "Credit" || txn.type === "DebitRevert" ? "text-emerald-600" : "text-red-500"}`}>
                    {txn.type === "Credit" || txn.type === "DebitRevert" ? "+" : "-"}{money(txn.amount, txn.currency)}
                  </span>
                </div>
              ))}
              {/* Local logs */}
              {logs.map((log) => (
                <div key={log.id} className="px-6 py-3 flex items-center justify-between gap-4" data-testid={`row-txn-log-${log.id}`}>
                  <div className="flex items-center gap-3">
                    <TxnTypeBadge type={log.action} />
                    <div>
                      {log.reason && <p className="text-sm">{log.reason}</p>}
                      <p className="text-xs text-muted-foreground">{fmtDate(String(log.createdAt))}</p>
                    </div>
                  </div>
                  <span className={`font-semibold tabular-nums text-sm ${log.action === "credit" || log.action === "monthly_renewal" ? "text-emerald-600" : "text-red-500"}`}>
                    {log.action === "credit" || log.action === "monthly_renewal" ? "+" : "-"}{money(log.amount, log.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deactivate */}
      {rep.status === "active" && (
        <div className="pt-2 border-t border-border">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeactivate(true)}
            data-testid="button-deactivate-rep"
          >
            <UserX className="h-4 w-4 mr-1.5" />Désactiver ce représentant
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            Débite le solde à zéro et archive le rep. L'historique est conservé.
          </p>
        </div>
      )}

      {/* Dialogs */}
      {showCredit && <CreditDialog rep={rep} open={showCredit} onClose={() => setShowCredit(false)} />}
      {showDebit && <DebitDialog rep={rep} open={showDebit} onClose={() => setShowDebit(false)} />}
      <AlertDialog open={showDeactivate} onOpenChange={setShowDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver {fullName(rep)} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le solde actuel ({money(rep.currentBalance)}) sera débité à zéro et le compte sera archivé.
              Le compte Shopify sera conservé mais le tag <code>mapi-rep</code> sera retiré. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateMutation.mutate()}
              data-testid="button-confirm-deactivate"
            >
              {deactivateMutation.isPending ? "En cours..." : "Désactiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Rep List View ────────────────────────────────────────────────────────────

export default function MapiRepsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAddRep, setShowAddRep] = useState(false);
  const [showBulkRenew, setShowBulkRenew] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  const { data: reps = [], isLoading } = useQuery<MapiRep[]>({
    queryKey: ["/api/mapi/reps"],
    queryFn: async () => {
      const res = await fetch("/api/mapi/reps");
      if (!res.ok) throw new Error("Impossible de charger les reps");
      return res.json();
    },
  });

  const bulkRenewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mapi/reps/bulk-monthly-renewal", {});
      return res.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mapi/reps"] });
      toast({ title: "Renouvellement global effectué", description: `${d.renewed ?? 0} rep(s) renouvelés.` });
      setShowBulkRenew(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  if (selectedRepId) {
    return <RepDetail repId={selectedRepId} onBack={() => setSelectedRepId(null)} />;
  }

  const filtered = reps.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.email.toLowerCase().includes(q) || fullName(r).toLowerCase().includes(q);
  });

  const activeCount = reps.filter((r) => r.status === "active").length;
  const totalBalance = reps.reduce((s, r) => s + parseFloat(r.currentBalance ?? "0"), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Reps MAPI</h1>
          <p className="text-muted-foreground mt-1">Gestion des représentants et de leurs budgets d'échantillons</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkRenew(true)}
            data-testid="button-bulk-renew"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Renouvellement global
          </Button>
          <Button size="sm" onClick={() => setShowAddRep(true)} data-testid="button-add-rep">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter un rep
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Reps actifs</p>
                <p className="text-2xl font-bold mt-1" data-testid="stat-active-reps">{activeCount}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-4.5 w-4.5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total des soldes</p>
                <p className="text-2xl font-bold mt-1 tabular-nums" data-testid="stat-total-balance">{money(totalBalance)}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Wallet className="h-4.5 w-4.5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total reps</p>
                <p className="text-2xl font-bold mt-1">{reps.length}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher par nom ou courriel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-reps"
        />
      </div>

      {/* Reps table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "Aucun résultat pour cette recherche" : "Aucun représentant pour l'instant"}</p>
              {!search && (
                <Button size="sm" className="mt-3" onClick={() => setShowAddRep(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Ajouter le premier rep
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-6 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Représentant</span>
                <span>Courriel</span>
                <span className="text-right">Budget mensuel</span>
                <span className="text-right">Solde actuel</span>
                <span></span>
              </div>
              <div className="divide-y divide-border">
                {filtered.map((rep) => (
                  <div
                    key={rep.id}
                    className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-6 py-3.5 items-center hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedRepId(rep.id)}
                    data-testid={`row-rep-${rep.id}`}
                  >
                    <div>
                      <p className="font-medium text-sm">{fullName(rep)}</p>
                      <Badge className={`mt-0.5 text-[10px] border-0 ${rep.status === "active"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {rep.status === "active" ? "Actif" : "Archivé"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{rep.email}</p>
                    <p className="text-sm tabular-nums text-right text-muted-foreground">
                      {rep.monthlyBudgetAmount ? money(rep.monthlyBudgetAmount) : "—"}
                    </p>
                    <BalanceBadge amount={rep.currentBalance} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddRepDialog open={showAddRep} onClose={() => setShowAddRep(false)} />

      <AlertDialog open={showBulkRenew} onOpenChange={setShowBulkRenew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renouvellement mensuel global</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action va réinitialiser le solde de tous les reps actifs ayant un budget mensuel configuré (débit du solde restant, puis crédit du budget mensuel).
              Cela affecte <strong>{reps.filter((r) => r.status === "active" && r.monthlyBudgetAmount).length} rep(s)</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkRenewMutation.mutate()}
              data-testid="button-confirm-bulk-renew"
            >
              {bulkRenewMutation.isPending ? "En cours..." : "Confirmer le renouvellement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
