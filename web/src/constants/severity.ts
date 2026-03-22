/** Severity, confidence and status color constants for the web UI. */

export const SEVERITY_COLORS = {
  critical: { text: "#991B1B", bg: "#FEE2E2", border: "#991B1B" },
  high: { text: "#DC2626", bg: "#FEE2E2", border: "#DC2626" },
  medium: { text: "#D97706", bg: "#FEF3C7", border: "#D97706" },
  low: { text: "#2563EB", bg: "#DBEAFE", border: "#2563EB" },
} as const;

export const CONFIDENCE_COLORS = {
  HIGH_THRESHOLD: 0.7,
  MEDIUM_THRESHOLD: 0.5,
  HIGH: "#16A34A",
  MEDIUM: "#D97706",
  LOW: "#DC2626",
} as const;

export const STATUS_COLORS = {
  online: { text: "#16A34A", bg: "#DCFCE7" },
  offline: { text: "#DC2626", bg: "#FEE2E2" },
  triggered: { text: "#D97706", bg: "#FEF3C7" },
  idle: { text: "#78716C", bg: "#F5F5F4" },
} as const;

export const SEVERITY_BORDER_CLASSES: Record<string, string> = {
  critical: "border-l-4 border-l-[#991B1B]",
  high: "border-l-4 border-l-[#DC2626]",
  medium: "border-l-4 border-l-[#D97706]",
  low: "border-l-4 border-l-[#2563EB]",
} as const;

export const NOTIFICATION_SEVERITY_BG: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#D97706]",
  low: "bg-[#2563EB]",
} as const;

/**
 * Return a Tailwind text color class for a confidence value.
 */
export function confidenceColorClass(conf: number): string {
  if (conf >= CONFIDENCE_COLORS.HIGH_THRESHOLD) return `text-[${CONFIDENCE_COLORS.HIGH}]`;
  if (conf >= CONFIDENCE_COLORS.MEDIUM_THRESHOLD) return `text-[${CONFIDENCE_COLORS.MEDIUM}]`;
  return `text-[${CONFIDENCE_COLORS.LOW}]`;
}
