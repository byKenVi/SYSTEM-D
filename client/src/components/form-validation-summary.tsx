import { forwardRef } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type FormValidationSummaryProps = {
  errors: string[];
  className?: string;
  title?: string;
};

/** Résumé d'erreurs focusable après échec de soumission (complète les messages inline). */
export const FormValidationSummary = forwardRef<HTMLDivElement, FormValidationSummaryProps>(
  function FormValidationSummary({ errors, className, title = "Corrigez les points suivants" }, ref) {
    if (errors.length === 0) return null;

    return (
      <div
        ref={ref}
        role="alert"
        tabIndex={-1}
        className={cn(
          "rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
          className,
        )}
        aria-labelledby="form-validation-summary-title"
      >
        <h2
          id="form-validation-summary-title"
          className="text-sm font-semibold text-destructive flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {title}
        </h2>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-sm text-destructive/90">
          {errors.map((message, index) => (
            <li key={`${index}-${message}`}>{message}</li>
          ))}
        </ul>
      </div>
    );
  },
);
