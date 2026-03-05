import { useQuery } from "@tanstack/react-query";
import type { ActivityLog } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ScrollText, Search, CheckCircle2, XCircle, Info } from "lucide-react";
import { useState } from "react";

const TYPE_LABELS: Record<string, string> = {
  shopify_auto_sync: "Auto Sync",
  shopify_import: "Shopify Import",
  zoho_push: "Zoho Push",
  zoho_inventory_sync: "Zoho Inventory",
  contact_invite: "Invite Sent",
  contact_revoke: "Access Revoked",
  contact_delete: "Contact Deleted",
  product_delete: "Product Deleted",
  restock_request: "Restock Request",
};

const TYPE_COLORS: Record<string, string> = {
  shopify_auto_sync: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  shopify_import: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
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

export default function AdminLogs() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    refetchInterval: 30_000,
  });

  const filtered = logs?.filter((l) => {
    const matchesSearch = l.message.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || l.type === typeFilter;
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const allTypes = Array.from(new Set(logs?.map((l) => l.type) ?? []));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Activity Log</h1>
        <p className="text-muted-foreground mt-1">Scheduled functions, syncs, and changes across the app</p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search log messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-logs"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-type-filter">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {allTypes.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered && filtered.length > 0 ? (
                filtered.map((log) => (
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
    </div>
  );
}
