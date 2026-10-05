# Page override — Layout global (admin + portail)

> Règles UX qui s’appliquent à `App.tsx`, `app-sidebar.tsx`, et shells de page.

## Structure

- Skip link vers `#main-content` (visible au focus clavier).
- En-tête mobile sticky: hauteur fixe documentée ; contenu scrollable ne doit pas passer **sous** la barre sans padding.
- **Touch target minimum 44×44px** pour `SidebarTrigger`, cloche notifications, actions header mobile.

## Sidebar

- Conserver `SidebarProvider` au niveau layout (déjà OK).
- État actif: conserver contraste primary / `matchPaths` pour sous-routes boutique.
- Notifications: badge + libellé accessible avec count contextualisé.

## Bannières contexte

- **View-as:** primary band — message + « Quitter l’aperçu ».
- **Admin sur portail:** amber band — « Retour à l’admin ».
- Ne pas empiler plus d’une bannière pleine largeur sans réduire padding page.

## Thème

- Tokens depuis `index.css` uniquement — pas de hex ad hoc dans les layouts.
- Glass / blur: headers mobile et modales seulement.

## Motion

- Transitions UI 150–300ms.
- Respect `prefers-reduced-motion: reduce` pour blur animé et skeleton pulse.
