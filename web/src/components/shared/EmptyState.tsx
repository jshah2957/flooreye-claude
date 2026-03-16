import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] py-16">
      <Icon size={40} className="mb-3 text-[#78716C]" />
      <h3 className="mb-1 text-base font-semibold text-[#1C1917]">{title}</h3>
      <p className="mb-4 text-sm text-[#78716C]">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
