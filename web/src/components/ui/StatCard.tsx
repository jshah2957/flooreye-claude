import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: "up" | "down";
  loading?: boolean;
  className?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendDirection,
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <div
        className={cn("rounded-lg border border-[#E7E5E0] bg-white p-4", className)}
        role="status"
        aria-label="Loading stat"
      >
        <div className="mb-3 h-4 w-20 animate-pulse rounded bg-[#E7E5E0]" />
        <div className="mb-1 h-8 w-16 animate-pulse rounded bg-[#E7E5E0]" />
        <div className="h-3 w-24 animate-pulse rounded bg-[#E7E5E0]" />
      </div>
    );
  }

  const trendColor =
    trendDirection === "up" ? "text-[#16A34A]" : trendDirection === "down" ? "text-[#DC2626]" : "text-[#78716C]";

  const TrendIcon = trendDirection === "up" ? TrendingUp : trendDirection === "down" ? TrendingDown : null;

  return (
    <div className={cn("rounded-lg border border-[#E7E5E0] bg-white p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-[#78716C]">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F1F0ED]">
          <Icon size={16} className="text-[#78716C]" />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#1C1917]">{value}</div>
      {trend && (
        <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", trendColor)}>
          {TrendIcon && <TrendIcon size={14} />}
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

export { StatCard };
