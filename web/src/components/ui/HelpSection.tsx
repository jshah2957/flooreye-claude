import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

interface HelpSectionProps {
  title?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

/**
 * Collapsible help/instructions section for page headers.
 * Provides contextual guidance for users on how to use the page.
 */
export default function HelpSection({ title = "How does this work?", children, defaultOpen = false }: HelpSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
      >
        <HelpCircle size={14} />
        {title}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50/50 p-4 text-sm text-gray-600 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
