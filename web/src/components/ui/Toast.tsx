import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, X, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
  };

  const iconMap = {
    success: <CheckCircle2 size={16} className="text-[#16A34A]" />,
    error: <XCircle size={16} className="text-[#DC2626]" />,
    warning: <AlertTriangle size={16} className="text-[#D97706]" />,
    info: <Info size={16} className="text-[#2563EB]" />,
  };

  const bgMap = {
    success: "border-[#16A34A]/20 bg-[#DCFCE7]",
    error: "border-[#DC2626]/20 bg-[#FEE2E2]",
    warning: "border-[#D97706]/20 bg-[#FEF3C7]",
    info: "border-[#2563EB]/20 bg-[#DBEAFE]",
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right ${bgMap[t.type]}`}
          >
            {iconMap[t.type]}
            <span className="text-sm font-medium text-[#1C1917]">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="ml-2 text-[#78716C] hover:text-[#1C1917]">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
