import { useState } from "react";
import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmText?: string; // If set, user must type this to confirm
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  if (!open) return null;

  const canConfirm = confirmText ? typed === confirmText : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1C1917]">{title}</h3>
          <button onClick={onCancel} className="text-[#78716C] hover:text-[#1C1917]">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-[#78716C]">{description}</p>

        {confirmText && (
          <div className="mb-4">
            <p className="mb-2 text-sm text-[#1C1917]">
              Type <span className="font-semibold">{confirmText}</span> to confirm:
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              setTyped("");
            }}
            disabled={!canConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              destructive
                ? "bg-[#DC2626] hover:bg-red-700"
                : "bg-[#0D9488] hover:bg-[#0F766E]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
