import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Warehouse, Package, BarChart3, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="Système D" className="h-10 w-auto object-contain rounded-sm" data-testid="text-app-name" />
          </div>
          <div className="flex items-center gap-3">
            <a href="/api/login">
              <Button data-testid="button-login">Connexion</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-accent text-accent-foreground text-sm">
                <Zap className="h-3.5 w-3.5" />
                Gestion d'entreposage et de stockage
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight tracking-tight">
                Gérez votre
                <span className="text-primary"> inventaire</span> en toute confiance
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-lg">
                Un portail client et un panneau d'administration complets pour les entreprises d'entreposage.
                Importez des produits depuis Shopify, synchronisez avec Zoho Inventory et gérez les demandes de réapprovisionnement facilement.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <a href="/api/login">
                  <Button size="lg" data-testid="button-get-started">
                    Commencer <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 flex-wrap">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Sécurisé et fiable</span>
                <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" /> Synchronisation en temps réel</span>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="rounded-md overflow-hidden bg-gradient-to-br from-primary/10 via-accent/30 to-primary/5 p-8 aspect-square flex items-center justify-center">
                <div className="space-y-4 w-full max-w-xs">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Produits synchronisés</p>
                        <p className="text-2xl font-bold">1 248</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Articles en stock</p>
                        <p className="text-2xl font-bold">34 521</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Warehouse className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Clients actifs</p>
                        <p className="text-2xl font-bold">42</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-3">Tout ce dont vous avez besoin</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Simplifiez vos opérations d'entreposage avec des outils puissants conçus pour les entreprises de stockage modernes.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Package,
                title: "Intégration Shopify",
                desc: "Importez des produits directement depuis les boutiques Shopify de vos clients en un clic.",
              },
              {
                icon: BarChart3,
                title: "Synchronisation Zoho Inventory",
                desc: "Poussez des produits vers Zoho Inventory et gardez les quantités synchronisées en temps réel.",
              },
              {
                icon: Warehouse,
                title: "Gestion des réapprovisionnements",
                desc: "Les clients peuvent demander des réapprovisionnements qui créent automatiquement des bons de commande.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="hover-elevate">
                <CardContent className="p-6 space-y-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap text-sm text-muted-foreground">
          <p>SYSTÈME D — Gestion d'entreposage et de stockage</p>
          <p>Propulsé par Replit</p>
        </div>
      </footer>
    </div>
  );
}
