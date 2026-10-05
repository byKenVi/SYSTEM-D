import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type PageHeaderCrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  items: PageHeaderCrumb[];
  /** Titre h1 ; par défaut le libellé du dernier fil d'Ariane. */
  title?: string;
  titleTestId?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ items, title, titleTestId, description, actions, className }: PageHeaderProps) {
  if (items.length === 0) return null;

  const current = items[items.length - 1];
  const heading = title ?? current.label;

  return (
    <header className={cn("space-y-3", className)}>
      <Breadcrumb>
        <BreadcrumbList>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <span key={`${item.label}-${index}`} className="contents">
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="font-medium text-foreground max-w-[min(100%,14rem)] truncate sm:max-w-xs">
                      {item.label}
                    </BreadcrumbPage>
                  ) : item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href} className="cursor-pointer transition-colors hover:text-foreground">
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate" data-testid={titleTestId}>
            {heading}
          </h1>
          {description ? (
            <div className="text-sm text-muted-foreground leading-relaxed">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Fil d'Ariane compact (ex. barre sticky) sans bloc titre dupliqué. */
export function PageBreadcrumb({ items, className }: { items: PageHeaderCrumb[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="text-xs sm:text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={`${item.label}-${index}`} className="contents">
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-medium text-foreground truncate max-w-[10rem] sm:max-w-none">
                    {item.label}
                  </BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} className="cursor-pointer">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
