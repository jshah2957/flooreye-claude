import * as RadixTabs from "@radix-ui/react-tabs";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Tabs({ tabs, value, onValueChange, children, className }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List
        className="relative flex border-b border-[#E7E5E0]"
        aria-label="Tabs"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.value === value;

          return (
            <RadixTabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-inset",
                isActive
                  ? "text-[#0D9488]"
                  : "text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              {Icon && <Icon size={16} />}
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0D9488] px-1.5 text-xs text-white">
                  {tab.badge}
                </span>
              )}
              {/* Animated underline indicator */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488] animate-in fade-in-0 slide-in-from-bottom-1" />
              )}
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>

      {children}
    </RadixTabs.Root>
  );
}

function TabContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Content
      value={value}
      className={cn(
        "mt-4 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-inset",
        "data-[state=active]:animate-in data-[state=active]:fade-in-0",
        className
      )}
    >
      {children}
    </RadixTabs.Content>
  );
}

export { Tabs, TabContent };
