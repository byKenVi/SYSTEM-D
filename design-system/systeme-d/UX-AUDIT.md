# Audit UX — Système D

> Généré avec le skill **ui-ux-pro-max** (2026-10-05).  
> Stack détectée: React 18, Vite, Tailwind, shadcn/ui, TanStack Query, wouter.  
> **UI validée** — ce document cible l’**expérience utilisateur**, pas un rebranding.

## Synthèse

| Zone | État | Priorité |
|------|------|----------|
| Navigation sidebar + mobile | Bonne base (SidebarProvider, états actifs, view-as) | P1 — cohérence mobile + repères |
| Feedback chargement | Skeletons présents sur dashboard/auth | P1 — uniformiser + `aria-busy` |
| États vides | Présents mais hétérogènes | P1 — pattern unique + CTA |
| Formulaires métier | Nombreux (`forms/*`, éditeur) | P1 — erreurs inline + résumé |
| Accessibilité | Partielle (quelques `aria-label`) | P1 — skip link, focus, badges |
| Fil d’Ariane | Composant shadcn **non utilisé** | P2 — détails / commandes / clients |
| Motion | `tailwindcss-animate`, pas de `prefers-reduced-motion` global | P2 |
| Données temps réel | Polling 30s notifications | P3 — fraîcheur + état stale |

---

## P1 — À traiter en premier (impact UX maximal)

### 1. Repère de localisation (navigation)

**Constat:** 3 niveaux fréquents (ex. Boutique → Client → Commande) sans fil d’Ariane. Le composant `breadcrumb.tsx` existe mais n’est importé nulle part.

**Recommandation (skill: Navigation / Breadcrumbs):**
- Ajouter un fil d’Ariane sur les pages **détail** (`order-detail`, `customer-detail`, `product-detail`, `contact-detail`, `systemd-product-detail`).
- Garder la sidebar pour le niveau 1 ; le breadcrumb pour niveaux 2–4.
- Lien « Retour » explicite en mobile si le breadcrumb est tronqué.

### 2. Cibles tactiles mobile incohérentes

**Constat:** En-tête admin mobile: `SidebarTrigger` **h-11 w-11** ; portail client: **h-9 w-9** ; cloche notifications portail **h-9** (skill: min ~44×44px).

**Recommandation:**
- Token partagé `--touch-target: 2.75rem` (44px) pour triggers, icon buttons mobile, actions primaires barre sticky.
- Harmoniser admin vs portail.

### 3. Zone principale & clavier

**Constat:** Pas de lien « Aller au contenu » ; navigation sidebar longue (9+ entrées admin).

**Recommandation (skill: Skip Links):**
- `<a href="#main-content" className="sr-only focus:not-sr-only …">` dans `AdminLayout` / `ClientLayout`.
- `id="main-content"` + `tabIndex={-1}` sur le conteneur de page pour focus après skip.

### 4. États vides — pattern unique

**Constat:** Mélange de `<p>` gris, parfois titre + CTA (`portal/forms`, `portal/livraisons`), parfois texte seul (`admin/notifications`, `admin/forms`).

**Recommandation (skill: Empty States):**
- Composant `EmptyState`: icône Lucide, titre, description courte, **une** action primaire + option secondaire.
- Messages orientés **prochaine étape** (ex. notifications: « Les alertes commandes et livraisons apparaîtront ici » + lien paramètres si pertinent).

### 5. Chargement & perception de performance

**Constat:** Auth/dashboard utilisent Skeleton ; d’autres listes peuvent flasher ou rester vides sans `aria-busy`.

**Recommandation (skill: Loading Indicators):**
- Règle: toute requête liste > ~200ms → skeleton **même structure** que la liste/table.
- Conteneur liste: `aria-busy={isLoading}` + `aria-live="polite"` sur message de fin de chargement si contenu dynamique.
- Éviter spinner plein écran sauf auth initiale.

### 6. Formulaires & soumissions

**Constat:** react-hook-form + zod ; risque de feedback toast-only sur erreurs multiples (skill: Focusable Error Summary).

**Recommandation:**
- Erreur **sous le champ** + `aria-describedby` / `role="alert"` sur le message.
- Au submit invalide: résumé en haut (`tabIndex={-1}`, focus programmé), liens `#field-id`.
- Bouton submit: état loading disabled + libellé « Enregistrement… ».

### 7. Notifications & badges

**Constat:** Badges visuels (sidebar, mobile bell) ; `aria-label="Notifications"` sans nombre contextualisé.

**Recommandation (skill: Contextual Live Badge Updates):**
- `aria-label={`Notifications${count ? `, ${count} non lues` : ''}`}` sur les contrôles.
- Éviter plusieurs `aria-live` concurrents ; une region `role="status"` pour mises à jour toast si nécessaire.

### 8. Mode « view-as » / admin sur portail

**Constat:** Bannières claires (`ViewAsBanner`, `AdminPortalBanner`) — bon UX.

**Amélioration:**
- Réduire la charge cognitive: une seule couleur sémantique « mode aperçu » documentée dans `pages/layout.md`.
- Désactiver actions destructives ou paiement en view-as (si pas déjà fait) avec message inline.

---

## P2 — Polish & cohérence

### Hiérarchie titres
- Une **h1** par page (titre écran), sections en h2/h3 sans sauter de niveau (skill: Heading Hierarchy).
- Vérifier dashboards où plusieurs `CardTitle` peuvent concurrencer la h1.

### Tables & listes (shadcn)
- Tri/filtre/pagination: pattern **DataTable** (TanStack Table) pour `commandes`, `contacts`, `orders`, `inventaire` — réduit charge cognitive vs tables custom.
- Lignes cliquables: `cursor-pointer`, hover 150–200ms, focus visible (ring).

### Statuts commande / livraison
- Ne pas reposer **uniquement** sur la couleur (badges colorés) — conserver le libellé texte (`STATUS_LABELS` déjà bien amorcé côté portail).

### Motion
- Skill recommande stagger léger sur grilles dashboard — **optionnel** avec Framer déjà en deps.
- Obligatoire: `@media (prefers-reduced-motion: reduce)` dans `index.css` pour désactiver `animate-pulse` agressif et transitions non essentielles.

### Glassmorphism (skill)
- Déjà partiellement présent (`backdrop-blur-sm` headers mobile). Limiter aux **barres sticky / modales** pour ne pas nuire à la lisibilité des tableaux denses (anti-pattern skill sur data tables).

---

## P3 — Opérations & confiance

### Données « live »
- Skill *Real-Time / Operations*: afficher **heure de dernière sync** sur dashboard admin (Zoho/Shopify) quand métriques dépendent du sync.
- État **stale** si sync > seuil (ex. 24h) avec CTA « Synchroniser ».

### Deep linking
- `viewAs=` déjà en query — documenter et conserver dans les liens internes (boutique, commandes).
- Filtres listes: envisager query params pour partage/bookmark (skill: Deep Linking).

---

## Checklist pré-livraison (web — adaptée du skill)

Avant chaque lot de changements UI:

- [ ] Contraste texte ≥ 4.5:1 (light **et** dark) sur nouvelles surfaces
- [ ] Focus visible sur tous les contrôles interactifs
- [ ] Cibles tactiles ≥ 44px sur mobile
- [ ] Pas de scroll horizontal 375px
- [ ] États empty/loading/error pour chaque vue liste
- [ ] `prefers-reduced-motion` respecté
- [ ] Icônes Lucide uniquement ; boutons icône avec nom accessible
- [ ] `cursor-pointer` sur cartes/lignes cliquables

---

## Prochaines étapes suggérées (implémentation)

Ordre recommandé pour les « gros changements » à venir:

1. ~~**Fondations layout:** skip link, `#main-content`, touch targets mobile, `EmptyState`, utilitaire loading `aria-busy`.~~ **Fait (2026-10-05)** — voir `client/src/components/{skip-to-main-content,empty-state,async-content-region}.tsx`, `App.tsx`, `index.css` (reduced-motion).
2. ~~**Navigation (amorcé):** breadcrumbs + `PageHeader` / `PageBreadcrumb`.~~ **Partiel** — admin/portail `contact-detail`, `order-detail`, `customer-detail` ; reste: produits, `local-order-detail`, `form-editor`.
3. ~~**Listes (amorcé):** `EmptyState` + `AsyncContentRegion`.~~ **Partiel** — forms, notifications, commandes admin/portail, livraisons admin/portail ; reste: contacts, inventaire, orders/boutique.
4. **Listes à fort trafic:** DataTable commandes/contacts/orders.
5. **Formulaires:** contrat erreurs (inline + summary) dans `form-editor` et forms métier.
6. **Dashboards:** fraîcheur des données + empty/loading unifiés.
7. ~~**Motion a11y:** reduced-motion global.~~ **Fait** — `index.css`.

Fichiers d’override par page: créer `design-system/systeme-d/pages/<nom>.md` au fur et à mesure des chantiers.
