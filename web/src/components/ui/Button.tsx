import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[#0D9488] text-white hover:bg-[#0F766E] focus-visible:ring-[#0D9488]",
        secondary:
          "border border-[#E7E5E0] bg-white text-[#1C1917] hover:bg-[#F1F0ED] focus-visible:ring-[#0D9488]",
        danger:
          "bg-[#DC2626] text-white hover:bg-red-700 focus-visible:ring-[#DC2626]",
        ghost:
          "bg-transparent text-[#1C1917] hover:bg-[#F1F0ED] focus-visible:ring-[#0D9488]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      disabled,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : LeftIcon ? (
          <LeftIcon size={16} />
        ) : null}
        {children}
        {!loading && RightIcon && <RightIcon size={16} />}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
