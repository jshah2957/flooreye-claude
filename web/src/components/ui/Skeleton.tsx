import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "avatar" | "table-row";
  width?: string | number;
  height?: string | number;
}

function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;

  const baseClasses = "animate-pulse bg-[#E7E5E0]";

  switch (variant) {
    case "avatar":
      return (
        <div
          className={cn(baseClasses, "h-10 w-10 rounded-full", className)}
          style={style}
          role="status"
          aria-label="Loading"
        />
      );
    case "card":
      return (
        <div
          className={cn(baseClasses, "h-[180px] w-full rounded-lg", className)}
          style={style}
          role="status"
          aria-label="Loading"
        />
      );
    case "table-row":
      return (
        <div
          className={cn("flex items-center gap-4 py-3", className)}
          role="status"
          aria-label="Loading"
        >
          <div className={cn(baseClasses, "h-4 w-32 rounded")} />
          <div className={cn(baseClasses, "h-4 w-24 rounded")} />
          <div className={cn(baseClasses, "h-4 w-20 rounded")} />
          <div className={cn(baseClasses, "h-4 w-16 rounded")} />
        </div>
      );
    case "text":
    default:
      return (
        <div
          className={cn(baseClasses, "h-4 w-full rounded", className)}
          style={style}
          role="status"
          aria-label="Loading"
        />
      );
  }
}

function SkeletonText({ className, width }: { className?: string; width?: string | number }) {
  return <Skeleton variant="text" className={className} width={width} />;
}

function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton variant="card" className={className} />;
}

function SkeletonAvatar({ className, width, height }: { className?: string; width?: string | number; height?: string | number }) {
  return <Skeleton variant="avatar" className={className} width={width} height={height} />;
}

function SkeletonTableRow({ className }: { className?: string }) {
  return <Skeleton variant="table-row" className={className} />;
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar, SkeletonTableRow };
