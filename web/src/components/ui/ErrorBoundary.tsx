import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4]">
          <div className="max-w-md rounded-lg border border-[#E7E5E0] bg-white p-8 text-center shadow-sm">
            <AlertTriangle size={48} className="mx-auto mb-4 text-[#D97706]" />
            <h1 className="mb-2 text-lg font-semibold text-[#1C1917]">Something went wrong</h1>
            <p className="mb-4 text-sm text-[#78716C]">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/dashboard";
              }}
              className="inline-flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
            >
              <RotateCcw size={14} />
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
