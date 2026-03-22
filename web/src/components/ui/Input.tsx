import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-[#1C1917]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {LeftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <LeftIcon size={16} className="text-[#78716C]" />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#A8A29E] outline-none transition-colors",
              "focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]"
                : "border-[#E7E5E0]",
              LeftIcon && "pl-9",
              RightIcon && "pr-9",
              className
            )}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-helper`
                : undefined
            }
            {...props}
          />
          {RightIcon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <RightIcon size={16} className="text-[#78716C]" />
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-[#DC2626]" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="mt-1 text-xs text-[#78716C]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
