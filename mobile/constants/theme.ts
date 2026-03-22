/**
 * FloorEye Mobile Theme — Single source of truth for all visual constants.
 * No hardcoded hex colors or magic numbers anywhere else in the app.
 */

// Re-export brand + severity from colors.ts for backward compat
export { BRAND, SEVERITY_COLORS, SEVERITY_BG_COLORS, STATUS_COLORS } from "./colors";

/** Semantic color groups for UI patterns */
export const ERROR = {
  bg: "#FEE2E2",
  text: "#991B1B",
  button: "#991B1B",
} as const;

export const WARNING = {
  bg: "#FEF3C7",
  text: "#92400E",
} as const;

export const INFO = {
  bg: "#DBEAFE",
  text: "#2563EB",
} as const;

export const SUCCESS = {
  bg: "#DCFCE7",
  text: "#16A34A",
} as const;

/** Neutral UI colors */
export const NEUTRAL = {
  border: "#E7E5E0",
  placeholder: "#E5E7EB",
  surface: "#F3F4F6",
  divider: "#F1F0ED",
  inactive: "#D1D5DB",
  black: "#000000",
  white: "#FFFFFF",
} as const;

/** Stat card accent colors */
export const STAT_COLORS = {
  stores: "#2563EB",
  cameras: "#0D9488",
  incidents: "#D97706",
  detections: "#DC2626",
  wetRate: "#0D9488",
} as const;

/** Detection result colors */
export const DETECTION = {
  wet: { bg: "#FEE2E2", text: "#DC2626" },
  dry: { bg: "#DCFCE7", text: "#16A34A" },
  flagged: { bg: "#FEF3C7", text: "#D97706", border: "#F59E0B" },
  unflagged: { bg: "#E5E7EB", text: "#78716C" },
} as const;

/** Action button colors */
export const ACTIONS = {
  acknowledge: "#0D9488",
  resolve: "#16A34A",
  falsePositive: "#F59E0B",
  flag: "#D97706",
  danger: "#DC2626",
} as const;

/** Spacing scale (in px) */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Border radius scale */
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 12,
  full: 9999,
} as const;

/** Font sizes */
export const FONT_SIZE = {
  xs: 10,
  sm: 11,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 18,
  h3: 20,
  h2: 22,
  h1: 24,
} as const;

/** Chart colors for analytics */
export const CHART_COLORS = {
  wet: "#DC2626",
  dry: "#16A34A",
  incidents: "#D97706",
  confidence: "#2563EB",
  uptime: "#0D9488",
  responseTime: "#7C3AED",
  heatmapEmpty: "#F3F4F6",
  heatmapBase: "rgba(220, 38, 38, {opacity})",
} as const;
