import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Warehouse, Package, BarChart3, ArrowRight, ShieldCheck, Zap, Server, Activity, Lock } from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      {/* Grid Pattern Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 dark:opacity-[0.05]" />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Système D" className="h-8 w-auto object-contain drop-shadow-[0_0_8px_rgba(239,95,24,0.4)]" data-testid="text-app-name" />
            <span className="font-bold tracking-widest text-sm uppercase">Système-D</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/api/login">
              <Button variant="default" className="font-semibold px-6 shadow-lg shadow-primary/20" data-testid="button-login">
                Accès Portail
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24 px-6 min-h-screen flex flex-col justify-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 animate-in">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold tracking-wide uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Opérations Logistiques Connectées
              </div>
              
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                Contrôle total sur votre <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
                  chaîne logistique
                </span>
              </h1>
              
              <p className="text-muted-foreground text-lg md:text-xl leading-relaxed max-w-xl font-medium">
                La plateforme de commandement pour l'entreposage moderne. 
                Synchronisation temps réel avec Shopify et Zoho, gestion d'inventaire chirurgicale et portal client unifié.
              </p>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4">
                <a href="/api/login">
                  <Button size="lg" className="h-14 px-8 text-base font-bold shadow-xl shadow-primary/20" data-testid="button-get-started">
                    Ouvrir le terminal <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-8 border-t border-border/50">
                <div className="space-y-1">
                  <p className="text-3xl font-mono font-bold text-foreground">99.9%</p>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Uptime</p>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-mono font-bold text-foreground">&lt;100ms</p>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Latence Sync</p>
                </div>
              </div>
            </div>
            
            <div className="relative hidden lg:block animate-in-delayed">
              {/* Decorative elements behind cards */}
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
              
              <div className="relative grid grid-cols-2 gap-4">
                <Card className="col-span-2 bg-card/80 backdrop-blur-xl border-border/50 shadow-2xl">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Activity className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Flux Opérationnel</p>
                          <p className="text-xs text-muted-foreground">En direct</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">Connecté</Badge>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: "Sync Shopify", time: "à l'instant", status: "success" },
                        { label: "Mise à jour Inventaire", time: "il y a 2m", status: "success" },
                        { label: "Nouveau Bon de Travail", time: "il y a 5m", status: "success" }
                      ].map((log, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="font-medium">{log.label}</span>
                          </div>
                          <span className="text-muted-foreground font-mono text-xs">{log.time}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-card/80 backdrop-blur-xl border-border/50 shadow-xl">
                  <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Server className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-mono font-bold">12k+</p>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Articles Actifs</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-card/80 backdrop-blur-xl border-border/50 shadow-xl">
                  <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Lock className="h-6 w-6 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-mono font-bold">SOC2</p>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Conformité</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      <section className="py-32 px-6 bg-muted/30 border-y border-border/50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Package,
                title: "Écosystème Connecté",
                desc: "Intégration native bidirectionnelle avec Shopify. Vos produits, commandes et clients synchronisés instantanément.",
              },
              {
                icon: BarChart3,
                title: "Inventaire Maîtrisé",
                desc: "Poussée des données vers Zoho Inventory avec précision chirurgicale. Gardez le contrôle total sur vos quantités.",
              },
              {
                icon: Warehouse,
                title: "Commandement Central",
                desc: "Un portail unifié pour vos clients. Soumissions, suivis de livraison et réapprovisionnements gérés depuis une interface unique.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="bg-card/50 backdrop-blur border-border/50 hover:border-primary/50 transition-colors">
                <CardContent className="p-8 space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-xl">{feature.title}</h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Système D" className="h-6 w-auto object-contain grayscale opacity-50" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">© 2025 Système-D Logistics</p>
          </div>
          <p className="text-xs font-mono text-muted-foreground">SYSTEM_OPERATIONAL // SECURE_CONNECTION</p>
        </div>
      </footer>

      {/* Helper Badge component for landing */}
      <style>{`
        .Badge {
          display: inline-flex;
          align-items: center;
          border-radius: 9999px;
          padding: 0.25rem 0.625rem;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1;
        }
      `}</style>
      <script dangerouslySetInnerHTML={{
        __html: `
          function Badge({ className, children }) {
            return <div className={"Badge " + className}>{children}</div>
          }
        `
      }} />
    </div>
  );
}

function Badge({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </div>
  );
}
