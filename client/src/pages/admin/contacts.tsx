import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Mail, Building2, Phone, Send, Search, Eye } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminContacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

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
            <>
              {/* Mobile: card list */}
              <div className="md:hidden divide-y">
                {filtered.map((contact) => (
                  <div key={contact.id} className="p-4 space-y-3" data-testid={`row-contact-${contact.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium" data-testid={`text-contact-name-${contact.id}`}>{contact.name}</p>
                        {contact.companyName && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" /> {contact.companyName}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={contact.status === "active" ? "default" : "secondary"}
                        data-testid={`badge-status-${contact.id}`}
                      >
                        {contact.status === "active" ? "Active" : "Invited"}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </p>
                      {contact.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                          {contact.phone}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
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
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden lg:table-cell">Company</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="hidden lg:table-cell">Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((contact) => (
                      <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                        <TableCell className="font-medium" data-testid={`text-contact-name-${contact.id}`}>
                          {contact.name}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {contact.companyName || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{contact.email}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            {contact.phone ? (
                              <>
                                <Phone className="h-3.5 w-3.5" />
                                {contact.phone}
                              </>
                            ) : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={contact.status === "active" ? "default" : "secondary"}
                            data-testid={`badge-status-${contact.id}`}
                          >
                            {contact.status === "active" ? "Active" : "Invited"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
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
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
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
    </div>
  );
}
