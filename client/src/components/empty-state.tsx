import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  /** Moins de padding vertical (ex. à l'intérieur d'une carte). */
  compact?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-12 px-6" : "py-16 px-6",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-full bg-muted/50 flex items-center justify-center mb-5",
          compact ? "h-16 w-16" : "h-20 w-20",
        )}
        aria-hidden
      >
        <Icon className={cn("text-muted-foreground/60", compact ? "h-8 w-8" : "h-10 w-10")} />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-md mt-2 leading-relaxed">{description}</p>
      ) : null}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
