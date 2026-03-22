import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  backHref?: string;
  className?: string;
}

function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  backHref,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="text-[#A8A29E]" />}
                  {isLast || !crumb.href ? (
                    <span
                      className={cn(
                        isLast ? "font-medium text-[#1C1917]" : "text-[#78716C]"
                      )}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.href}
                      className="text-[#78716C] hover:text-[#1C1917] transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              to={backHref}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917] transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </Link>
          )}
          <div>
            <h1 className="text-2xl font-bold text-[#1C1917]">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-[#78716C]">{subtitle}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { PageHeader };
