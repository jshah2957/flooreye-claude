import { Link } from "react-router-dom";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: "/" | ">";
  className?: string;
}

function Breadcrumbs({ items, separator = "/", className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  const SepIcon =
    separator === ">"
      ? () => <ChevronRight size={14} className="text-[#A8A29E]" />
      : () => <span className="text-[#A8A29E]">/</span>;

  // On mobile, collapse middle items if more than 3
  const shouldCollapse = items.length > 3;
  const visibleItems: BreadcrumbItem[] = shouldCollapse
    ? [items[0]!, { label: "...", href: undefined }, items[items.length - 1]!]
    : items;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      {/* Desktop: all items */}
      <ol className="hidden items-center gap-1 text-sm sm:flex">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <SepIcon />}
              {isLast || !item.href ? (
                <span
                  className={cn(
                    isLast ? "font-medium text-[#1C1917]" : "text-[#78716C]"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-[#78716C] hover:text-[#1C1917] transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: collapsed */}
      <ol className="flex items-center gap-1 text-sm sm:hidden">
        {visibleItems.map((item, i) => {
          const isLast = i === visibleItems.length - 1;
          const isEllipsis = item.label === "...";
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <SepIcon />}
              {isEllipsis ? (
                <MoreHorizontal size={14} className="text-[#A8A29E]" />
              ) : isLast || !item.href ? (
                <span
                  className={cn(
                    isLast ? "font-medium text-[#1C1917]" : "text-[#78716C]"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-[#78716C] hover:text-[#1C1917] transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Breadcrumbs };
