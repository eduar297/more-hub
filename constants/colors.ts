/**
 * Centralized color palettes for charts, category metadata, and store theming.
 *
 * These are raw hex values because react-native-gifted-charts and other
 * non-Tamagui consumers require plain strings. For UI elements, prefer
 * Tamagui theme tokens ($blue10, $green10, etc.) instead of importing from here.
 */

// ── Generic chart palette (10 colors) ────────────────────────────────────────

export const CHART_PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
] as const;

// ── Store color palette ──────────────────────────────────────────────────────

export const STORE_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#84cc16",
] as const;

// ── Expense category colors ──────────────────────────────────────────────────

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  TRANSPORT: "#f97316",
  ELECTRICITY: "#eab308",
  RENT: "#ec4899",
  REPAIRS: "#ef4444",
  SUPPLIES: "#22c55e",
  OTHER: "#888888",
};

// ── Feature / slide theme colors ─────────────────────────────────────────────

export const BRAND_COLORS = {
  blue: { solid: "#3b82f6", light: "#dbeafe", dark: "#1e3a5f" },
  green: { solid: "#22c55e", light: "#dcfce7", dark: "#14532d" },
  purple: { solid: "#a855f7", light: "#f3e8ff", dark: "#3b0764" },
  amber: { solid: "#f59e0b", light: "#fef3c7", dark: "#451a03" },
  red: { solid: "#ef4444", light: "#fef2f2", dark: "#2d1515" },
} as const;

// ── BCG matrix class colors (pricing-analysis) ──────────────────────────────

export const CLASS_META_COLORS: Record<string, string> = {
  star: "#eab308",
  cow: "#22c55e",
  question: "#3b82f6",
  dog: "#ef4444",
};

// ── Purchase suggestion colors ───────────────────────────────────────────────

export const URGENCY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  low: "#f59e0b",
  ok: "#22c55e",
  overstock: "#8b5cf6",
};

export const TREND_COLORS: Record<string, string> = {
  rising: "#22c55e",
  stable: "#6b7280",
  falling: "#ef4444",
};

// ── Sales analysis colors ────────────────────────────────────────────────────

export const STAGNANT_COLORS: Record<string, string> = {
  no_sales: "#ef4444",
  heavy_drop: "#f97316",
  slowing: "#eab308",
};

export const DISCOUNT_COLORS: Record<string, string> = {
  possible: "#22c55e",
  tight: "#f59e0b",
  none: "#6b7280",
};

export const AFFINITY_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#6b7280",
};

// ── Semantic status colors (sync, severity, medals) ──────────────────────────

export const SEVERITY_COLORS = {
  danger: { solid: "#ef4444", bg: "#fef2f2", darkBg: "#2d1515" },
  warning: { solid: "#f59e0b", bg: "#fffbeb", darkBg: "#451a03" },
  success: { solid: "#22c55e", bg: "#dcfce7", darkBg: "#14532d" },
  info: { solid: "#3b82f6", bg: "#dbeafe", darkBg: "#1e3a5f" },
} as const;

export const SYNC_STATUS_COLORS = {
  connecting: "#f59e0b",
  sending: "#3b82f6",
  receiving: "#3b82f6",
  complete: "#22c55e",
  error: "#ef4444",
  idle: "#6b7280",
} as const;

export const MEDAL_COLORS = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
} as const;

export const PAYMENT_COLORS = {
  cash: { solid: "#22c55e", light: "#dcfce7" },
  card: { solid: "#8b5cf6", light: "#dbeafe" },
} as const;

// ── Chart axis/label colors ──────────────────────────────────────────────────

export const AXIS_LABEL_COLOR = "#888";
export const AXIS_LINE_COLOR = "#555";
export const PLACEHOLDER_BG = "#e5e7eb";

// ── Translucent / overlay colors ─────────────────────────────────────────────

/** Sheet / dialog backdrop */
export const OVERLAY = "rgba(0,0,0,0.5)";
/** Heavier backdrop for login / period sheets */
export const OVERLAY_HEAVY = "rgba(0,0,0,0.55)";
/** Dense scrim for readable text on busy backgrounds */
export const SCRIM = "rgba(0,0,0,0.75)";
/** Subtle icon-button / placeholder background */
export const ICON_BTN_BG = "rgba(128,128,128,0.12)";
/** Very light blue tint for highlighted rows */
export const BLUE_TINT = "rgba(59,130,246,0.08)";
/** White at 20 % – faint borders / backgrounds */
export const WHITE_FADED = "rgba(255,255,255,0.2)";
/** White at 75 % – soft text on dark backgrounds */
export const WHITE_SOFT = "rgba(255,255,255,0.75)";
/** Black at 15 % – subtle border in light mode */
export const BORDER_SUBTLE = "rgba(0,0,0,0.15)";
