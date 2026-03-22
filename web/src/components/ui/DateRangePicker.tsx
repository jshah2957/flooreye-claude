import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar, ChevronDown } from "lucide-react";
import { format, subDays, startOfMonth, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface Preset {
  label: string;
  from: Date;
  to: Date;
}

const DEFAULT_PRESETS: Preset[] = [
  { label: "Today", from: startOfDay(new Date()), to: endOfDay(new Date()) },
  { label: "Last 7d", from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) },
  { label: "Last 30d", from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) },
  { label: "This month", from: startOfMonth(new Date()), to: endOfDay(new Date()) },
];

export interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  onChange: (range: DateRange) => void;
  presets?: Preset[];
  className?: string;
}

function DateRangePicker({
  from,
  to,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const formatDate = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");

  const displayText =
    from && to
      ? `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`
      : "Select date range";

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({ from: val ? new Date(val + "T00:00:00") : null, to });
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({ from, to: val ? new Date(val + "T23:59:59") : null });
  };

  const applyPreset = (preset: Preset) => {
    onChange({ from: preset.from, to: preset.to });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border border-[#E7E5E0] bg-white px-3 text-sm text-[#1C1917] transition-colors hover:bg-[#F1F0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]",
            className
          )}
        >
          <Calendar size={16} className="text-[#78716C]" />
          <span className={from ? "text-[#1C1917]" : "text-[#A8A29E]"}>
            {displayText}
          </span>
          <ChevronDown size={14} className="text-[#78716C]" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-lg border border-[#E7E5E0] bg-white p-4 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          sideOffset={8}
          align="start"
        >
          {/* Quick presets */}
          <div className="mb-3 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="rounded-md border border-[#E7E5E0] px-2.5 py-1 text-xs font-medium text-[#78716C] transition-colors hover:border-[#0D9488] hover:text-[#0D9488]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#78716C]">From</label>
              <input
                type="date"
                value={formatDate(from)}
                onChange={handleFromChange}
                className="h-9 rounded-md border border-[#E7E5E0] px-2 text-sm text-[#1C1917] outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>
            <span className="mt-5 text-[#A8A29E]">–</span>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#78716C]">To</label>
              <input
                type="date"
                value={formatDate(to)}
                onChange={handleToChange}
                className="h-9 rounded-md border border-[#E7E5E0] px-2 text-sm text-[#1C1917] outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { DateRangePicker };
