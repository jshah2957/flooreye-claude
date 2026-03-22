/** Shared severity color map used across the mobile app */
export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#991B1B",
  high: "#DC2626",
  medium: "#D97706",
  low: "#2563EB",
};

/** Background colors for severity badges */
export const SEVERITY_BG_COLORS: Record<string, string> = {
  critical: "#FEE2E2",
  high: "#FEE2E2",
  medium: "#FEF3C7",
  low: "#DBEAFE",
};

/** Status badge colors */
export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: "#DBEAFE", text: "#2563EB" },
  acknowledged: { bg: "#FEF3C7", text: "#D97706" },
  resolved: { bg: "#DCFCE7", text: "#16A34A" },
  escalated: { bg: "#F3E8FF", text: "#7C3AED" },
};

/** App brand colors */
export const BRAND = {
  primary: "#0D9488",
  background: "#F8F7F4",
  surface: "#FFFFFF",
  border: "#E7E5E0",
  textPrimary: "#1C1917",
  textSecondary: "#78716C",
  danger: "#DC2626",
  success: "#16A34A",
};
