import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AsyncContentRegionProps = {
  isLoading: boolean;
  isEmpty: boolean;
  loadingFallback: React.ReactNode;
  emptyFallback: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Libellé pour lecteurs d'écran pendant le chargement. */
  busyLabel?: string;
};

/**
 * Enveloppe liste/table : skeleton + aria-busy, puis empty ou contenu.
 */
export function AsyncContentRegion({
  isLoading,
  isEmpty,
  loadingFallback,
  emptyFallback,
  children,
  className,
  busyLabel = "Chargement en cours",
}: AsyncContentRegionProps) {
  return (
    <div className={cn(className)} aria-busy={isLoading || undefined} aria-live="polite">
      {isLoading ? (
        <div aria-label={busyLabel}>{loadingFallback}</div>
      ) : isEmpty ? (
        emptyFallback
      ) : (
        children
      )}
    </div>
  );
}

/** Skeletons réutilisables pour listes / tableaux. */
export function ListLoadingSkeleton({
  rows = 5,
  rowClassName = "h-14 w-full rounded-lg",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className="p-4 space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}
