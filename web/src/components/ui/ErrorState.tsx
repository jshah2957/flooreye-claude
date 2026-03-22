import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  fullPage?: boolean;
  className?: string;
}

function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  fullPage = false,
  className,
}: ErrorStateProps) {
  const content = (
    <div className={cn("flex flex-col items-center justify-center text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE2E2]">
        <AlertTriangle size={28} className="text-[#DC2626]" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-[#1C1917]">{title}</h3>
      <p className="mb-4 max-w-md text-sm text-[#78716C]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9] p-6">
        {content}
      </div>
    );
  }

  return <div className="py-16">{content}</div>;
}

export { ErrorState };
