import { useState, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ComponentType<{ size?: number; className?: string }>;
  onRowClick?: (row: T) => void;
  pagination?: PaginationConfig;
  className?: string;
}

type SortDir = "asc" | "desc";

function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data found",
  emptyIcon: EmptyIcon,
  onRowClick,
  pagination,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  // Loading skeleton
  if (loading) {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-[#E7E5E0]", className)}>
        <table className="hidden w-full md:table">
          <thead>
            <tr className="border-b border-[#E7E5E0] bg-[#FAFAF9]">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#78716C]">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-[#E7E5E0]">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-24 animate-pulse rounded bg-[#E7E5E0]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Mobile loading */}
        <div className="space-y-3 p-4 md:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[#E7E5E0] p-4">
              <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-[#E7E5E0]" />
              <div className="mb-2 h-3 w-1/2 animate-pulse rounded bg-[#E7E5E0]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#E7E5E0]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] py-16", className)}>
        {EmptyIcon && <EmptyIcon size={40} className="mb-3 text-[#78716C]" />}
        <p className="text-sm text-[#78716C]">{emptyMessage}</p>
      </div>
    );
  }

  // Pagination helpers
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0;
  const pageStart = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const pageEnd = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  function renderPageButtons() {
    if (!pagination) return null;
    const pages: number[] = [];
    const current = pagination.page;
    const start = Math.max(1, current - 2);
    const end = Math.min(totalPages, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages.map((p) => (
      <button
        key={p}
        onClick={() => pagination.onPageChange(p)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded text-sm",
          p === current
            ? "bg-[#0D9488] text-white"
            : "text-[#78716C] hover:bg-[#F1F0ED]"
        )}
        aria-current={p === current ? "page" : undefined}
      >
        {p}
      </button>
    ));
  }

  const getCellValue = (row: T, col: Column<T>) => {
    if (col.render) return col.render(row);
    return row[col.key] != null ? String(row[col.key]) : "—";
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-[#E7E5E0]", className)}>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E7E5E0] bg-[#FAFAF9]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#78716C]",
                    col.sortable && "cursor-pointer select-none hover:text-[#1C1917]"
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    col.sortable && sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="inline-flex flex-col">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ChevronsUpDown size={14} className="text-[#A8A29E]" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-[#E7E5E0] transition-colors",
                  onRowClick && "cursor-pointer hover:bg-[#FAFAF9]"
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-[#1C1917]">
                    {getCellValue(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 p-4 md:hidden">
        {sortedData.map((row, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border border-[#E7E5E0] bg-white p-4",
              onRowClick && "cursor-pointer hover:bg-[#FAFAF9]"
            )}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between py-1">
                <span className="text-xs font-medium uppercase text-[#78716C]">{col.header}</span>
                <span className="text-sm text-[#1C1917]">{getCellValue(row, col)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#E7E5E0] px-4 py-3">
          <span className="text-sm text-[#78716C]">
            Showing {pageStart}–{pageEnd} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            {renderPageButtons()}
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded text-[#78716C] hover:bg-[#F1F0ED] disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { DataTable };
