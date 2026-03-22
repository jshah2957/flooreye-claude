import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInternal(value);
  }, [value]);

  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(val);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternal(val);
    debouncedOnChange(val);
  };

  const handleClear = () => {
    setInternal("");
    onChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClear();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search size={16} className="text-[#78716C]" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={internal}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-[#E7E5E0] bg-white pl-9 pr-9 text-sm text-[#1C1917] placeholder:text-[#A8A29E] outline-none transition-colors focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
        aria-label={placeholder}
      />
      {internal && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#78716C] hover:text-[#1C1917]"
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export { SearchInput };
