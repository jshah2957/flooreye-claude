import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZE_MAP;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            SIZE_MAP[size]
          )}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-[#1C1917]">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-[#78716C]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">{children}</div>

          {footer && (
            <div className="mt-4 flex justify-end gap-3 border-t border-[#E7E5E0] pt-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Modal };
