import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, Building2, MapPin, Save, Users, Shield, Briefcase, Camera } from "lucide-react";
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

  const { data: relatedContacts = [] } = useQuery<Contact[]>({
    queryKey: viewAsContactId
      ? ["/api/admin/view-as", viewAsContactId, "related-contacts"]
      : ["/api/portal/related-contacts"],
    enabled: !!contact,
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  useEffect(() => {
    if (contact) {
      const authName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
      setName(contact.name || authName);
      setPhone(contact.phone || "");
      setCompanyName(contact.companyName || "");
      setCompanyAddress(contact.companyAddress || "");
    }
  }, [contact, user]);

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
      toast({ title: "Profil mis à jour", description: "Vos modifications ont été enregistrées avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour le profil.", variant: "destructive" });
    },
  });

  const displayName = isViewAs
    ? (contact?.name || `Contact #${viewAsContactId}`)
    : `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "";

  const displayEmail = isViewAs ? (contact?.email || "") : (user?.email || "");

  const initials = isViewAs
    ? (contact?.name || "C").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "U";

  if (isLoading) {
    return (
      <div className="space-y-6 w-full max-w-6xl mx-auto">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in w-full max-w-6xl mx-auto pb-12">
      
      {/* Header section with gradient background */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border p-8 shadow-sm">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]" />
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
          <div className="h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              <Shield className="h-3.5 w-3.5" /> Identité Sécurisée
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              Profil & Entreprise
            </h1>
            <p className="text-muted-foreground mt-3 text-lg">
              Gérez vos informations de contact et les détails de facturation de votre entreprise.
            </p>
          </div>
          
          <Button 
            size="lg" 
            className="shadow-lg shadow-primary/20 font-bold shrink-0"
            onClick={() => {
              if (isViewAs) {
                toast({ title: "Mode Aperçu", description: "Les modifications ne sont pas sauvegardées en mode aperçu." });
                return;
              }
              updateMutation.mutate();
            }}
            disabled={updateMutation.isPending}
            data-testid="button-save-profile"
          >
            <Save className="h-5 w-5 mr-2" />
            {updateMutation.isPending ? "Sauvegarde..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Avatar & ID */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border/50 shadow-sm overflow-hidden bg-card relative">
            <div className="h-32 bg-muted border-b border-border/50 absolute top-0 left-0 right-0" />
            <CardContent className="p-8 pt-16 flex flex-col items-center text-center relative z-10">
              <div className="relative group mb-6">
                <Avatar className="h-32 w-32 ring-4 ring-background shadow-xl">
                  <AvatarImage src={isViewAs ? undefined : (user?.profileImageUrl || undefined)} className="object-cover" />
                  <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!isViewAs && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
              
              <h3 className="font-bold text-2xl tracking-tight mb-1" data-testid="text-profile-name">
                {displayName}
              </h3>
              <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5" data-testid="text-profile-email">
                {displayEmail}
              </p>
              
              {contact?.companyName && (
                <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-lg bg-muted/50 border border-border/50">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-bold text-sm">{contact.companyName}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Contacts */}
          {relatedContacts.length > 0 && (
            <Card className="border-border/50 shadow-sm" data-testid="card-related-contacts">
              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Équipe {contact?.companyName ? `chez ${contact.companyName}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {relatedContacts.map((rc) => {
                    const rcInitials = (rc.name || rc.email || "C")
                      .split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <div key={rc.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors" data-testid={`row-related-contact-${rc.id}`}>
                        <Avatar className="h-10 w-10 flex-shrink-0 border border-border shadow-sm">
                          <AvatarFallback className="text-xs font-bold bg-background text-muted-foreground">{rcInitials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate text-foreground" data-testid={`text-related-name-${rc.id}`}>{rc.name || "Membre"}</p>
                          {rc.email && (
                            <p className="text-[10px] font-medium text-muted-foreground truncate" data-testid={`text-related-email-${rc.id}`}>{rc.email}</p>
                          )}
                        </div>
                        {rc.phone && (
                          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md shrink-0">
                            <Phone className="h-3 w-3" />
                            <span data-testid={`text-related-phone-${rc.id}`}>{rc.phone}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Form Fields */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
              <h3 className="font-bold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Informations Personnelles
              </h3>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nom Complet</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 text-base font-medium shadow-none focus-visible:ring-1"
                    data-testid="input-profile-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Adresse Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={contact?.email || user?.email || ""}
                      disabled
                      className="pl-11 h-12 text-base font-medium bg-muted/50 text-muted-foreground border-transparent shadow-none"
                      data-testid="input-profile-email"
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="pl-11 h-12 text-base font-medium shadow-none focus-visible:ring-1"
                      data-testid="input-profile-phone"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
              <h3 className="font-bold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" /> Informations d'Entreprise
              </h3>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raison Sociale</Label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Nom de l'entité légale"
                      className="pl-11 h-12 text-base font-medium shadow-none focus-visible:ring-1"
                      data-testid="input-profile-company"
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Adresse de Facturation / Siège</Label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      placeholder="Adresse complète"
                      className="pl-11 h-12 text-base font-medium shadow-none focus-visible:ring-1"
                      data-testid="input-profile-address"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
