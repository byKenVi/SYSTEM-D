import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Users, Mail, Search, Eye, ShieldOff, Trash2, Send, MoreHorizontal, Link2, Link2Off } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function AdminContacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

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

  const filtered = contacts?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.companyName || "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = contacts?.filter((c) => c.status === "active").length || 0;
  const invitedCount = contacts?.filter((c) => c.status === "invited").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Contacts</h1>
        <p className="text-muted-foreground mt-1">Manage client contacts and invitations</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold" data-testid="text-total-contacts">{contacts?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold" data-testid="text-active-contacts">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invited</p>
              <p className="text-xl font-bold" data-testid="text-invited-contacts">{invitedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-contacts"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zoho CRM</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered && filtered.length > 0 ? (
                filtered.map((contact) => (
                  <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                    <TableCell className="font-medium" data-testid={`text-contact-name-${contact.id}`}>
                      {contact.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.companyName || <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={contact.status === "active" ? "default" : "secondary"}
                        data-testid={`badge-status-${contact.id}`}
                      >
                        {contact.status === "active" ? "Active" : "Invited"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contact.zohoCrmContactId ? (
                        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700" data-testid={`badge-zoho-synced-${contact.id}`}>
                          <Link2 className="h-3 w-3" />
                          Synced
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid={`badge-zoho-unsynced-${contact.id}`}>
                          <Link2Off className="h-3 w-3" />
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
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
                          {contact.status === "invited" && (
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
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-36 text-center">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No contacts found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Contacts are created when Zoho CRM sends a webhook</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
