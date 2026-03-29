// DEAD CODE — DUPLICATE. Safe to delete. Verified 2026-03-29.
// This is an older, simpler error boundary. The active version is at:
//   web/src/components/ui/ErrorBoundary.tsx (with Lucide icons, fullPage mode)
// App.tsx imports from ui/ErrorBoundary (line 7), not this shared/ version.
// grep "from.*shared/ErrorBoundary" or "from.*shared.*ErrorBoundary": 0 matches.
// Removing this file has zero impact. The ui/ version handles all error catching.
import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("FloorEye Error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 text-4xl text-[#DC2626]">!</div>
            <h2 className="mb-2 text-lg font-semibold text-[#1C1917]">
              Something went wrong
            </h2>
            <p className="mb-4 max-w-md text-center text-sm text-[#78716C]">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="rounded-md bg-[#0D9488] px-4 py-2 text-sm text-white hover:bg-[#0F766E]"
            >
              Reload Page
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
