import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, Package, Truck } from "lucide-react";
import logoSrc from "@assets/logo_no_bg.png";

const portalActions = [
  {
    icon: ClipboardList,
    title: "Demander un service",
    description: "Soumettez un bon de travail ou une demande opérationnelle et suivez son approbation.",
  },
  {
    icon: Package,
    title: "Commander des produits",
    description: "Consultez vos produits et le catalogue Système D, puis commandez avec le crédit associé à votre compte.",
  },
  {
    icon: Truck,
    title: "Suivre vos opérations",
    description: "Retrouvez vos commandes, soumissions et livraisons dans un portail unique.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      <nav className="border-b border-white/10 bg-[#121218]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <img src={logoSrc} alt="Système D" className="h-9 w-auto object-contain rounded-md bg-white/90 px-2 py-0.5" />
          <a href="/api/login">
            <Button className="font-semibold" data-testid="button-login">
              Accéder au portail <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden bg-[#121218] px-4 py-20 sm:px-6 sm:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,rgba(239,95,24,0.18),transparent)]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-primary">Portail client Système D</p>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Gérez vos demandes, commandes et livraisons au même endroit.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
              Connectez-vous pour consulter vos produits, passer des commandes, soumettre des demandes et suivre vos opérations.
            </p>
            <a href="/api/login" className="mt-9 inline-block">
              <Button size="lg" className="h-12 px-8 text-base font-bold shadow-xl shadow-primary/25" data-testid="button-get-started">
                Accéder au portail <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {portalActions.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border/60 bg-muted/25 px-4 py-12 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-7 text-center md:flex-row md:text-left">
            <div>
              <h2 className="text-xl font-bold">Tout est prêt dans votre portail</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Créez une demande, consultez vos commandes et suivez vos livraisons depuis un seul espace.
              </p>
            </div>
            <a href="/api/login">
              <Button variant="outline" className="font-semibold">Accéder au portail <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </a>
          </div>
        </section>
      </main>

      <footer className="px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <img src={logoSrc} alt="Système D" className="h-7 w-auto object-contain opacity-60" />
          <p>© {new Date().getFullYear()} Services Système D · Portail logistique</p>
        </div>
      </footer>
    </div>
  );
}
