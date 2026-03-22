import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
}

function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  width = 384,
}: DrawerProps) {
  const w = typeof width === "number" ? `${width}px` : width;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
          )}
          style={{ width: w }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E7E5E0] px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-[#1C1917]">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

          {/* Sticky footer */}
          {footer && (
            <div className="border-t border-[#E7E5E0] px-6 py-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Drawer };
