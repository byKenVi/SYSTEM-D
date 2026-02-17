import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, Building2, MapPin, Save } from "lucide-react";
import { useState, useEffect } from "react";

export default function PortalProfile({ viewAsContactId }: { viewAsContactId?: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isViewAs = !!viewAsContactId;

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "profile"]
      : ["/api/portal/profile"],
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  useEffect(() => {
    if (contact) {
      setName(contact.name || "");
      setPhone(contact.phone || "");
      setCompanyName(contact.companyName || "");
      setCompanyAddress(contact.companyAddress || "");
    }
  }, [contact]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/portal/profile", {
        name,
        phone,
        companyName,
        companyAddress,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/profile"] });
      toast({ title: "Saved", description: "Your profile has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    },
  });

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Profile</h1>
        <p className="text-muted-foreground mt-1">View and manage your account information</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 mb-4">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <h3 className="font-semibold text-lg" data-testid="text-profile-name">
              {user?.firstName} {user?.lastName}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="text-profile-email">
              {user?.email}
            </p>
            {contact?.companyName && (
              <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span>{contact.companyName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <h3 className="font-semibold">Contact Information</h3>
            <p className="text-sm text-muted-foreground">{isViewAs ? "Read-only view of client details" : "Update your details below"}</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Full Name
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isViewAs}
                  data-testid="input-profile-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email
                </Label>
                <Input
                  value={contact?.email || user?.email || ""}
                  disabled
                  className="opacity-60"
                  data-testid="input-profile-email"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isViewAs}
                  placeholder="Phone number"
                  data-testid="input-profile-phone"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Company Name
                </Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isViewAs}
                  placeholder="Company name"
                  data-testid="input-profile-company"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Company Address
                </Label>
                <Input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  disabled={isViewAs}
                  placeholder="Company address"
                  data-testid="input-profile-address"
                />
              </div>
            </div>
            {!isViewAs && (
              <Button
                className="mt-6"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                data-testid="button-save-profile"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
