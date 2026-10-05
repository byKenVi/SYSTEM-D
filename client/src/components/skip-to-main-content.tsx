/** Lien d'évitement clavier — visible au focus uniquement. */
export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById("main-content");
        main?.focus({ preventScroll: false });
        main?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      Aller au contenu principal
    </a>
  );
}
