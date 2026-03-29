// DEAD CODE — Safe to delete. Verified 2026-03-29.
// This skeleton loading page is exported from ui/index.ts (line 41) but never
// imported by any page, route, or component. The app uses a Loader2 spinner in
// ProtectedRoute/PublicRoute for loading states, not this full-page skeleton.
// grep "LoadingPage" across web/src/: only this file and ui/index.ts barrel export.
// If deleted, also remove the export line from ui/index.ts.
// Removing this file has zero impact on any loading UI.
import { cn } from "@/lib/utils";

function LoadingPage({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-screen w-full", className)} role="status" aria-label="Loading page">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 flex-shrink-0 border-r border-[#E7E5E0] bg-white p-4 lg:block">
        {/* Logo */}
        <div className="mb-8 h-8 w-32 animate-pulse rounded bg-[#E7E5E0]" />
        {/* Nav items */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-2 flex items-center gap-3 rounded-md px-3 py-2">
            <div className="h-5 w-5 animate-pulse rounded bg-[#E7E5E0]" />
            <div className="h-4 w-24 animate-pulse rounded bg-[#E7E5E0]" />
          </div>
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden bg-[#FAFAF9]">
        {/* Header skeleton */}
        <div className="flex h-16 items-center justify-between border-b border-[#E7E5E0] bg-white px-6">
          <div className="h-6 w-48 animate-pulse rounded bg-[#E7E5E0]" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-[#E7E5E0]" />
            <div className="h-4 w-24 animate-pulse rounded bg-[#E7E5E0]" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="p-6">
          {/* Page title */}
          <div className="mb-6">
            <div className="mb-2 h-8 w-64 animate-pulse rounded bg-[#E7E5E0]" />
            <div className="h-4 w-96 animate-pulse rounded bg-[#E7E5E0]" />
          </div>

          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
                <div className="mb-3 h-4 w-20 animate-pulse rounded bg-[#E7E5E0]" />
                <div className="mb-1 h-8 w-16 animate-pulse rounded bg-[#E7E5E0]" />
                <div className="h-3 w-24 animate-pulse rounded bg-[#E7E5E0]" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className="rounded-lg border border-[#E7E5E0] bg-white">
            <div className="border-b border-[#E7E5E0] px-4 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-[#E7E5E0]" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-[#E7E5E0] px-4 py-3">
                <div className="h-4 w-32 animate-pulse rounded bg-[#E7E5E0]" />
                <div className="h-4 w-24 animate-pulse rounded bg-[#E7E5E0]" />
                <div className="h-4 w-20 animate-pulse rounded bg-[#E7E5E0]" />
                <div className="h-4 w-16 animate-pulse rounded bg-[#E7E5E0]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { LoadingPage };
