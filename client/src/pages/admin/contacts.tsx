import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Mail, Building2, Phone, Send, Search, Eye, ShieldOff, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";
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

export default function AdminContacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (contactId: number) => {
      await apiRequest("POST", `/api/contacts/${contactId}/resend-invite`);
    },
    onSuccess: () => {
      toast({ title: "Invite resent", description: "The invitation email has been sent again." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resend invite.", variant: "destructive" });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async (contactId: number) => {
      await apiRequest("POST", `/api/contacts/${contactId}/revoke-access`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Access revoked", description: "The contact's login access has been removed." });
      setRevokeTarget(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke access.", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      await apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted", description: "The contact has been permanently removed." });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete contact.", variant: "destructive" });
    },
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
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold" data-testid="text-total-contacts">{contacts?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold" data-testid="text-active-contacts">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invited</p>
              <p className="text-2xl font-bold" data-testid="text-invited-contacts">{invitedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div className="relative flex-1 max-w-sm">
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
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y">
              {filtered.map((contact) => (
                <div key={contact.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid={`row-contact-${contact.id}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium" data-testid={`text-contact-name-${contact.id}`}>{contact.name}</p>
                      <Badge
                        variant={contact.status === "active" ? "default" : "secondary"}
                        data-testid={`badge-status-${contact.id}`}
                      >
                        {contact.status === "active" ? "Active" : "Invited"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {contact.companyName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                          {contact.companyName}
                        </span>
                      )}
                      <span className="flex items-center gap-1 min-w-0">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </span>
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                          {contact.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <Link href={`/portal/profile?viewAs=${contact.id}`}>
                      <Button size="sm" variant="outline" data-testid={`button-view-as-${contact.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View As
                      </Button>
                    </Link>
                    {contact.status === "invited" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resendInviteMutation.mutate(contact.id)}
                        disabled={resendInviteMutation.isPending}
                        data-testid={`button-resend-${contact.id}`}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Resend Invite
                      </Button>
                    )}
                    {contact.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                        onClick={() => setRevokeTarget(contact)}
                        data-testid={`button-revoke-${contact.id}`}
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                        Revoke Access
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(contact)}
                      data-testid={`button-delete-${contact.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">No contacts found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Contacts are created when Zoho CRM sends a webhook.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Access Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove their ability to log in to the client portal. Their contact record will remain and you can reinvite them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => revokeTarget && revokeAccessMutation.mutate(revokeTarget.id)}
              data-testid="button-confirm-revoke"
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Contact Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the contact and all their associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteTarget && deleteContactMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Delete Contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
