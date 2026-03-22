import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium",
  {
    variants: {
      variant: {
        default: "bg-gray-100 text-gray-700",
        success: "bg-[#DCFCE7] text-[#16A34A]",
        danger: "bg-[#FEE2E2] text-[#DC2626]",
        warning: "bg-[#FEF3C7] text-[#D97706]",
        info: "bg-[#DBEAFE] text-[#2563EB]",
        edge: "bg-[#F3E8FF] text-[#7C3AED]",
        hybrid: "bg-[#CFFAFE] text-[#0891B2]",
        outline: "border border-[#E7E5E0] bg-transparent text-[#1C1917]",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

const DOT_COLORS: Record<string, string> = {
  default: "bg-gray-500",
  success: "bg-[#16A34A]",
  danger: "bg-[#DC2626]",
  warning: "bg-[#D97706]",
  info: "bg-[#2563EB]",
  edge: "bg-[#7C3AED]",
  hybrid: "bg-[#0891B2]",
  outline: "bg-[#78716C]",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  const v = variant ?? "default";

  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            DOT_COLORS[v],
            "animate-pulse"
          )}
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
