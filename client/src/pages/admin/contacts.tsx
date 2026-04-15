import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  Eye,
  ShieldOff,
  Trash2,
  Send,
  MoreHorizontal,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List,
  Mail,
  Phone,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Fragment, useState, useMemo } from "react";

type ViewMode = "table" | "card";
type GroupBy = "none" | "company" | "status";

export default function AdminContacts() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [viewMode, setViewModeRaw] = useState<ViewMode>(
    () => (localStorage.getItem("contacts_viewMode") as ViewMode) || "table"
  );
  const [groupBy, setGroupByRaw] = useState<GroupBy>(
    () => (localStorage.getItem("contacts_groupBy") as GroupBy) || "none"
  );
  const [revokeTarget, setRevokeTarget] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const setViewMode = (v: ViewMode) => {
    localStorage.setItem("contacts_viewMode", v);
    setViewModeRaw(v);
  };
  const setGroupBy = (v: GroupBy) => {
    localStorage.setItem("contacts_groupBy", v);
    setGroupByRaw(v);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3.5 w-3.5 ml-1" />
      : <ChevronDown className="h-3.5 w-3.5 ml-1" />;
  };

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (contactId: number) =>
      apiRequest("POST", `/api/contacts/${contactId}/resend-invite`),
    onSuccess: () =>
      toast({ title: "Invite sent", description: "The invitation email has been sent." }),
    onError: () =>
      toast({ title: "Error", description: "Failed to send invite.", variant: "destructive" }),
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async (contactId: number) =>
      apiRequest("POST", `/api/contacts/${contactId}/revoke-access`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Access revoked", description: "The contact's login access has been removed." });
      setRevokeTarget(null);
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to revoke access.", variant: "destructive" }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) =>
      apiRequest("DELETE", `/api/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted", description: "The contact has been permanently removed." });
      setDeleteTarget(null);
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to delete contact.", variant: "destructive" }),
  });

  const filtered = contacts
    ?.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.companyName || "").toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => {
      if (!sortKey) return 0;
      let aVal = "";
      let bVal = "";
      if (sortKey === "name") { aVal = a.name; bVal = b.name; }
      else if (sortKey === "company") { aVal = a.companyName || ""; bVal = b.companyName || ""; }
      else if (sortKey === "email") { aVal = a.email; bVal = b.email; }
      else if (sortKey === "status") { aVal = a.status; bVal = b.status; }
      else if (sortKey === "phone") { aVal = a.phone || ""; bVal = b.phone || ""; }
      else if (sortKey === "created") { aVal = a.createdAt ? new Date(a.createdAt).toISOString() : ""; bVal = b.createdAt ? new Date(b.createdAt).toISOString() : ""; }
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const grouped = useMemo(() => {
    if (!filtered || groupBy === "none") return null;
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const key =
        groupBy === "company"
          ? c.companyName || ""
          : groupBy === "status"
          ? c.status
          : "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "") return 1;
        if (b === "") return -1;
        return a.localeCompare(b);
      });
  }, [filtered, groupBy]);

  const groupLabel = (key: string) => {
    if (key === "") {
      return groupBy === "company" ? "No Company" : "Unknown";
    }
    if (groupBy === "status") {
      return key === "active" ? "Active" : key === "revoked" ? "Revoked" : "Invited";
    }
    return key;
  };

  function ContactRow({ contact }: { contact: Contact }) {
    return (
      <TableRow
        key={contact.id}
        data-testid={`row-contact-${contact.id}`}
        className="cursor-pointer"
        onClick={() => navigate(`/admin/contacts/${contact.id}`)}
      >
        <TableCell className="font-medium">
          {contact.companyName || <span className="text-muted-foreground/40">—</span>}
        </TableCell>
        <TableCell className="text-muted-foreground" data-testid={`text-contact-name-${contact.id}`}>
          {contact.name}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {contact.email}
        </TableCell>
        <TableCell>
          <Badge
            variant={contact.status === "active" ? "default" : contact.status === "revoked" ? "destructive" : "secondary"}
            data-testid={`badge-status-${contact.id}`}
          >
            {contact.status === "active" ? "Active" : contact.status === "revoked" ? "Revoked" : "Invited"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm" data-testid={`text-contact-phone-${contact.id}`}>
          {contact.phone || <span className="opacity-40">—</span>}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm whitespace-nowrap" data-testid={`text-contact-created-${contact.id}`}>
          {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : <span className="opacity-40">—</span>}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <ContactActions contact={contact} />
        </TableCell>
      </TableRow>
    );
  }

  function ContactCard({ contact }: { contact: Contact }) {
    const initials = contact.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
    return (
      <Card
        className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
        data-testid={`card-contact-${contact.id}`}
        onClick={() => navigate(`/admin/contacts/${contact.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary">{initials}</span>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="font-semibold text-sm leading-tight" data-testid={`text-contact-name-${contact.id}`}>
                {contact.name}
              </p>
              {contact.companyName ? (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.companyName}</p>
              ) : (
                <p className="text-xs text-muted-foreground/30 mt-0.5 italic">No company</p>
              )}
            </div>
            <span onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
              <ContactActions contact={contact} />
            </span>
          </div>
          <Separator className="my-3" />
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{contact.email}</span>
            </div>
            {contact.phone ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{contact.phone}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/30">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>No phone</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={contact.status === "revoked" ? "destructive" : "secondary"}
              className={`text-[10px] px-1.5 py-0 h-4${contact.status === "active" ? " bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-500/20" : ""}`}
              data-testid={`badge-status-${contact.id}`}
            >
              {contact.status === "active" ? "Active" : contact.status === "revoked" ? "Revoked" : "Invited"}
            </Badge>
            <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums" data-testid={`text-contact-created-${contact.id}`}>
              {contact.createdAt
                ? new Date(contact.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  function ContactActions({ contact }: { contact: Contact }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-actions-${contact.id}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Link href={`/portal/profile?viewAs=${contact.id}`}>
            <DropdownMenuItem data-testid={`button-view-as-${contact.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              View as client
            </DropdownMenuItem>
          </Link>
          {(contact.status === "invited" || contact.status === "revoked") && (
            <DropdownMenuItem
              onClick={() => resendInviteMutation.mutate(contact.id)}
              disabled={resendInviteMutation.isPending}
              data-testid={`button-resend-${contact.id}`}
            >
              <Send className="h-4 w-4 mr-2" />
              Send invite
            </DropdownMenuItem>
          )}
          {contact.status === "active" && (
            <DropdownMenuItem
              className="text-amber-600 focus:text-amber-600"
              onClick={() => setRevokeTarget(contact)}
              data-testid={`button-revoke-${contact.id}`}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Revoke access
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(contact)}
            data-testid={`button-delete-${contact.id}`}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete contact
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage client contacts and invitations</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
              data-testid="input-search-contacts"
            />
          </div>

          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[150px]" data-testid="select-group-by">
              <SelectValue placeholder="Group by…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-md overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none h-9 px-3 ${viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setViewMode("table")}
              data-testid="button-view-table"
            >
              <List className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none h-9 px-3 ${viewMode === "card" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setViewMode("card")}
              data-testid="button-view-card"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Table View ── */}
      {viewMode === "table" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-hide">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {(["company", "name", "email", "status", "phone", "created"] as const).map((col) => (
                      <TableHead key={col}>
                        <button
                          type="button"
                          className="flex items-center font-medium hover:text-foreground transition-colors"
                          onClick={() => handleSort(col)}
                          data-testid={`sort-${col}`}
                        >
                          {col === "name" ? "Name" : col === "company" ? "Company" : col === "email" ? "Email" : col === "status" ? "Status" : col === "phone" ? "Phone" : "Created"}
                          <SortIcon col={col} />
                        </button>
                      </TableHead>
                    ))}
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered && filtered.length > 0 ? (
                    grouped ? (
                      grouped.map(([key, contacts]) => (
                        <Fragment key={`group-${key}`}>
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={7} className="py-2 px-4 bg-muted/40 border-b">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {groupLabel(key)}
                              </span>
                              <span className="ml-2 text-xs text-muted-foreground/50">{contacts.length}</span>
                            </TableCell>
                          </TableRow>
                          {contacts.map((contact) => (
                            <ContactRow key={contact.id} contact={contact} />
                          ))}
                        </Fragment>
                      ))
                    ) : (
                      filtered.map((contact) => (
                        <ContactRow key={contact.id} contact={contact} />
                      ))
                    )
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-36 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No contacts found</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Contacts are created when Zoho CRM sends a webhook</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Card View ── */}
      {viewMode === "card" && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2 mt-1" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            grouped ? (
              <div className="space-y-6">
                {grouped.map(([key, contacts]) => (
                  <div key={key || "__empty__"}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{groupLabel(key)}</span>
                      <span className="text-xs text-muted-foreground/50">{contacts.length}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {contacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((contact) => <ContactCard key={contact.id} contact={contact} />)}
            </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No contacts found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Contacts are created when Zoho CRM sends a webhook</p>
            </div>
          )}
        </>
      )}

      {/* Revoke Access Confirmation */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke access for {revokeTarget?.name}?</DialogTitle>
            <DialogDescription>
              This will remove their ability to log in to the client portal. Their contact record will remain and you can resend an invite later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => revokeTarget && revokeAccessMutation.mutate(revokeTarget.id)}
              disabled={revokeAccessMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the contact and all their associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteContactMutation.mutate(deleteTarget.id)}
              disabled={deleteContactMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
