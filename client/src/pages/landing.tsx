import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Warehouse, Package, BarChart3, ArrowRight, ShieldCheck, Zap,
  Activity, Bell, FileText, RefreshCw, Truck, ClipboardList,
  CheckCircle2, Clock, Eye, Download, Users, Settings2,
  ChevronRight, Star, TrendingUp, AlertCircle, PackageCheck,
} from "lucide-react";
import { SiShopify, SiZoho } from "react-icons/si";
import logoSrc from "@assets/logo_no_bg.png";

const FORM_TYPES = [
  { code: "ENT", label: "Entreposage", color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-500/30 dark:text-blue-400", dot: "bg-blue-500", desc: "Réception et mise en stockage de marchandises" },
  { code: "TRI", label: "Tri", color: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-500/30 dark:text-purple-400", dot: "bg-purple-500", desc: "Opérations de tri et classement d'articles" },
  { code: "INS", label: "Inspection", color: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/30 dark:text-amber-400", dot: "bg-amber-500", desc: "Vérification qualité avec critères et photos" },
  { code: "F015", label: "Co-packing", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-500/30 dark:text-emerald-400", dot: "bg-emerald-500", desc: "Suivi de temps, picks et conditionnement" },
  { code: "LIV", label: "Livraison", color: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-500/30 dark:text-orange-400", dot: "bg-orange-500", desc: "Destinations, expéditions et facturation" },
];

const STATUS_STEPS = [
  { label: "Brouillon", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  { label: "Soumis", icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "En révision", icon: Eye, color: "text-amber-500", bg: "bg-amber-500/10" },
  { label: "Approuvé", icon: Star, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Complété", icon: PackageCheck, color: "text-primary", bg: "bg-primary/10" },
];

const FEATURES = [
  {
    icon: FileText,
    color: "bg-blue-500/10 text-blue-500",
    title: "5 Types de Demandes",
    desc: "Entreposage, tri, inspection, co-packing et livraison. Chaque formulaire adapté à son processus métier avec numérotation automatique.",
  },
  {
    icon: RefreshCw,
    color: "bg-emerald-500/10 text-emerald-500",
    title: "Sync Shopify Automatique",
    desc: "Importation de produits, variantes et commandes. Synchronisation bidirectionnelle des niveaux de stock à fréquence configurable.",
  },
  {
    icon: BarChart3,
    color: "bg-purple-500/10 text-purple-500",
    title: "Zoho Inventory",
    desc: "Création automatique de bons de travail Zoho à l'approbation. Stock Zoho comme source de vérité, poussé vers Shopify en retour.",
  },
  {
    icon: Bell,
    color: "bg-amber-500/10 text-amber-500",
    title: "Notifications Temps Réel",
    desc: "Alertes instantanées par catégorie — compte, livraison, commande, inventaire. Son configurable par type. Marquer comme lu.",
  },
  {
    icon: Download,
    color: "bg-orange-500/10 text-orange-500",
    title: "Génération PDF",
    desc: "Export PDF professionnel pour chaque demande. En-tête Système-D, tableaux structurés, images d'inspection intégrées, numéros de révision.",
  },
  {
    icon: Activity,
    color: "bg-rose-500/10 text-rose-500",
    title: "Journal d'Activité",
    desc: "Traçabilité complète de toutes les opérations : syncs Shopify, pushes Zoho, invitations clients, soumissions et changements de statut.",
  },
];

const ADMIN_FEATURES = [
  "Tableau de bord avec KPIs clients",
  "Gestion des contacts & intégrations Shopify par client",
  "Traitement des demandes avec approbation et prix",
  "Création de bons de travail Zoho à l'approbation",
  "Envoi de notifications ciblées aux clients",
  "Journal d'activité complet & logs de synchronisation",
];

const CLIENT_FEATURES = [
  "Portail personnel avec statistiques et historique",
  "Soumission de demandes de service en ligne",
  "Suivi en temps réel du statut de chaque dossier",
  "Gestion des produits et demandes de réapprovisionnement",
  "Téléchargement PDF de tous les documents approuvés",
  "Préférences de notifications par catégorie et son",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 overflow-x-hidden">

      {/* ─── NAV ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Système D" className="h-8 w-auto object-contain drop-shadow-[0_0_8px_rgba(239,95,24,0.4)]" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a>
            <a href="#integrations" className="hover:text-foreground transition-colors">Intégrations</a>
            <a href="#forms" className="hover:text-foreground transition-colors">Demandes</a>
            <a href="#portals" className="hover:text-foreground transition-colors">Portails</a>
          </div>
          <a href="/api/login">
            <Button className="font-semibold px-6 shadow-lg shadow-primary/20" data-testid="button-login">
              Accès Portail <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
        </div>
      </nav>

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center pt-16" style={{ background: "hsl(240 14% 8%)" }}>
        {/* Grid bg */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(239,95,24,0.15),transparent)]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-wide uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Plateforme logistique connectée
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] text-white">
                Votre entrepôt,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-amber-400">
                  piloté au millimètre.
                </span>
              </h1>

              <p className="text-lg leading-relaxed max-w-xl font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
                Portail client unifié, pannel administrateur complet, intégrations Shopify et Zoho Inventory, 
                gestion de demandes avec workflow d'approbation et génération PDF automatique.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
                <a href="/api/login">
                  <Button size="lg" className="h-14 px-8 text-base font-bold shadow-xl shadow-primary/30" data-testid="button-get-started">
                    Ouvrir le portail <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
                <a href="#features">
                  <Button size="lg" variant="ghost" className="h-14 px-6 text-base font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                    Découvrir les fonctionnalités
                  </Button>
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
                {[
                  { n: "5", label: "Types de demandes" },
                  { n: "2", label: "Intégrations natives" },
                  { n: "∞", label: "Clients & portails" },
                ].map((s) => (
                  <div key={s.label} className="space-y-1">
                    <p className="text-3xl font-mono font-bold text-white">{s.n}</p>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — dashboard preview cards */}
            <div className="relative hidden lg:flex flex-col gap-4">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent rounded-3xl blur-3xl -z-10" />

              {/* Activity card */}
              <div className="rounded-2xl border p-5 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-white">Journal d'activité</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Temps réel</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En ligne
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Sync Shopify — Mapei", time: "à l'instant", icon: RefreshCw, c: "text-emerald-400" },
                    { label: "Bon de travail Zoho créé · TRI-042", time: "il y a 3m", icon: CheckCircle2, c: "text-blue-400" },
                    { label: "Inventaire synchronisé — 48 articles", time: "il y a 7m", icon: BarChart3, c: "text-purple-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <item.icon className={`h-3.5 w-3.5 ${item.c}`} />
                        <span className="font-medium text-white/70">{item.label}</span>
                      </div>
                      <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Form statuses */}
                <div className="rounded-2xl border p-5 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Demandes actives</p>
                  <div className="space-y-2.5">
                    {[
                      { code: "TRI-042", status: "En révision", c: "text-amber-400 bg-amber-400/10" },
                      { code: "ENT-018", status: "Approuvé", c: "text-emerald-400 bg-emerald-400/10" },
                      { code: "LIV-007", status: "Soumis", c: "text-blue-400 bg-blue-400/10" },
                    ].map((f) => (
                      <div key={f.code} className="flex items-center justify-between">
                        <span className="font-mono text-xs text-white/60">{f.code}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.c}`}>{f.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inventory */}
                <div className="rounded-2xl border p-5 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Inventaire</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">Shopify</span>
                        <span className="font-mono text-white/80">1 284</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-emerald-500 w-[72%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">Zoho</span>
                        <span className="font-mono text-white/80">926</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-primary w-[52%]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* ─── FEATURES ─────────────────────────────────────────────────── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold tracking-widest uppercase">
              <Zap className="h-3.5 w-3.5" /> Fonctionnalités
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Tout ce dont votre<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">entrepôt a besoin.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Une seule plateforme pour connecter vos opérations, vos clients et vos systèmes tiers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="group p-7 rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-5 ${f.color}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS ─────────────────────────────────────────────── */}
      <section id="integrations" className="py-28 px-6 bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background text-xs font-bold tracking-widest uppercase text-muted-foreground">
              Intégrations natives
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Connecté à votre<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">écosystème existant.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Shopify */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="p-8 pb-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-xl bg-[#96bf48]/10 border border-[#96bf48]/30 flex items-center justify-center">
                    <SiShopify className="h-7 w-7 text-[#96bf48]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Shopify</h3>
                    <p className="text-sm text-muted-foreground">Sync bidirectionnel</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {[
                    "Import de produits et variantes avec images",
                    "Synchronisation des commandes clients",
                    "Writeback stock Zoho → Shopify automatique",
                    "Fréquence de sync configurable (15 min → 24h)",
                    "Support multi-boutiques par client",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-[#96bf48] mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-8 py-4 bg-muted/40 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Connexion via Admin API Token · OAuth write_inventory
                </div>
              </div>
            </div>

            {/* Zoho */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="p-8 pb-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                    <SiZoho className="h-7 w-7 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Zoho Inventory</h3>
                    <p className="text-sm text-muted-foreground">Bons de travail & stock</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {[
                    "Création automatique de contacts Zoho",
                    "Articles de service générés à l'approbation",
                    "Bons de commande avec quantité et prix (CAD)",
                    "Sync inventaire Zoho → app → Shopify",
                    "Support multi-régions (US/EU/IN/AU/JP/CA)",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-8 py-4 bg-muted/40 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  OAuth 2.0 Authorization Code · Token auto-refresh
                </div>
              </div>
            </div>
          </div>

          {/* Writeback flow */}
          <div className="mt-12 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border/60 bg-card p-7">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Flux de synchronisation inventaire
              </p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {[
                  { label: "Shopify", icon: SiShopify, color: "bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/30" },
                  { arrow: "→" },
                  { label: "Portail", icon: Warehouse, color: "bg-primary/10 text-primary border-primary/30" },
                  { arrow: "⇄" },
                  { label: "Zoho", icon: SiZoho, color: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
                  { arrow: "→" },
                  { label: "Shopify", icon: SiShopify, color: "bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/30" },
                ].map((step, i) => (
                  "arrow" in step ? (
                    <span key={i} className="text-lg text-muted-foreground/50 font-mono">{step.arrow}</span>
                  ) : (
                    <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${step.color}`}>
                      {step.icon && <step.icon className="h-4 w-4" />}
                      <span className="text-sm font-bold">{step.label}</span>
                    </div>
                  )
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                Zoho Inventory devient la source de vérité pour les quantités. Les niveaux de stock se propagent automatiquement vers Shopify selon la fréquence configurée.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FORMS SYSTEM ─────────────────────────────────────────────── */}
      <section id="forms" className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold tracking-widest uppercase">
                <ClipboardList className="h-3.5 w-3.5" /> Système de demandes
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
                5 types de demandes,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">un seul workflow.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Chaque demande suit un cycle de vie complet, de la soumission à la complétion, avec notifications email à chaque étape et génération PDF automatique.
              </p>

              {/* Status flow */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Flux de statut</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {STATUS_STEPS.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${s.bg} ${s.color}`}>
                        <s.icon className="h-3 w-3" />
                        {s.label}
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                {[
                  { icon: Download, label: "Export PDF professionnel", desc: "En-tête, tableaux, images intégrées" },
                  { icon: RefreshCw, label: "Lien TRI → Inspection", desc: "Création automatique à la soumission" },
                  { icon: Bell, label: "Emails automatiques", desc: "Confirmation + changements de statut" },
                  { icon: FileText, label: "Sauvegarde automatique", desc: "Brouillons enregistrés toutes les 30s" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form types cards */}
            <div className="space-y-3">
              {FORM_TYPES.map((ft) => (
                <div key={ft.code} className="flex items-center gap-5 p-5 rounded-2xl border border-border/60 bg-card hover:border-primary/30 hover:bg-primary/[0.02] transition-all group">
                  <div className={`px-3 py-2 rounded-xl border font-mono font-bold text-sm shrink-0 ${ft.color}`}>
                    {ft.code}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base group-hover:text-primary transition-colors">{ft.label}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{ft.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── PORTALS ──────────────────────────────────────────────────── */}
      <section id="portals" className="py-28 px-6 bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background text-xs font-bold tracking-widest uppercase text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Deux interfaces dédiées
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Un outil pour chaque rôle.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Le panneau administrateur et le portail client sont séparés, adaptés et sécurisés selon les droits de chacun.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Admin */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="p-7 pb-6 border-b border-border/50">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Panneau Administrateur</h3>
                    <p className="text-sm text-muted-foreground">Contrôle total des opérations</p>
                  </div>
                </div>
              </div>
              <div className="p-7">
                <ul className="space-y-3">
                  {ADMIN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 py-4 bg-primary/5 border-t border-primary/10">
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest">
                  <ShieldCheck className="h-3.5 w-3.5" /> Accès Administrateur uniquement
                </div>
              </div>
            </div>

            {/* Client */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="p-7 pb-6 border-b border-border/50">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Portail Client</h3>
                    <p className="text-sm text-muted-foreground">Suivi en autonomie, 24/7</p>
                  </div>
                </div>
              </div>
              <div className="p-7">
                <ul className="space-y-3">
                  {CLIENT_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <div className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="h-3 w-3 text-blue-500" />
                      </div>
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 py-4 bg-blue-500/5 border-t border-blue-500/10">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-widest">
                  <ShieldCheck className="h-3.5 w-3.5" /> Accès par invitation · Données isolées par client
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section className="relative py-32 px-6 overflow-hidden" style={{ background: "hsl(240 14% 8%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(239,95,24,0.12),transparent)]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Système opérationnel
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            Prêt à centraliser<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-amber-400">
              vos opérations ?
            </span>
          </h2>
          <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            Connectez-vous pour accéder à votre portail ou contacter l'équipe Système-D pour une intégration sur mesure.
          </p>
          <a href="/api/login">
            <Button size="lg" className="h-14 px-10 text-base font-bold shadow-2xl shadow-primary/30 mt-2" data-testid="button-cta-login">
              Accéder au portail <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </a>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="py-12 px-6 bg-background border-t border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt="Système D" className="h-7 w-auto object-contain grayscale opacity-40" />
              <div>
                <p className="text-sm font-bold tracking-widest uppercase text-muted-foreground">Système-D</p>
                <p className="text-xs text-muted-foreground/50">© 2025 Services Système-D · Logistics Québec</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground/50">
              <div className="flex items-center gap-2">
                <SiShopify className="h-3.5 w-3.5" />
                <span>Shopify Partner</span>
              </div>
              <div className="flex items-center gap-2">
                <SiZoho className="h-3.5 w-3.5" />
                <span>Zoho Inventory</span>
              </div>
              <span className="font-mono">servicessystemed.app</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
