// ── Money formatting ──────────────────────────────────────────────────────────

export function fmtMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 10_000) return (abs / 1_000).toFixed(1) + "k";
  return abs.toFixed(2);
}

// ── Date constants ────────────────────────────────────────────────────────────

export const MONTH_NAMES_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export const MONTH_NAMES_FULL = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// ── Date helpers ──────────────────────────────────────────────────────────────

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

export function shiftMonth(ym: string, delta: number): string {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftDay(date: string, delta: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}

export function dayLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(ym: string): number {
  const { year, month } = parseYearMonth(ym);
  return new Date(year, month, 0).getDate();
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortDayLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function rangeLabel(from: string, to: string): string {
  return `${shortDayLabel(from)} — ${shortDayLabel(to)}`;
}

// ── Week helpers ──────────────────────────────────────────────────────────────

/** ISO date of the Monday of the week that contains `dateStr`. */
export function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun, 1=Mon...
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** ISO date of the Monday of the current week. */
export function currentWeekMonday(): string {
  return getMondayISO(todayISO());
}

/** Shift a week-start (Monday) by `delta` weeks. */
export function shiftWeek(weekMon: string, delta: number): string {
  return shiftDay(weekMon, delta * 7);
}

/** ISO date of the Sunday that ends the week starting on `weekMon`. */
export function weekEndISO(weekMon: string): string {
  return shiftDay(weekMon, 6);
}

/** Human label like "23 - 29 Mar" or "28 Mar - 3 Abr". */
export function weekLabel(weekMon: string): string {
  const start = new Date(weekMon + "T12:00:00");
  const end = new Date(weekMon + "T12:00:00");
  end.setDate(end.getDate() + 6);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = MONTH_NAMES_SHORT[start.getMonth()];
  const endMonth = MONTH_NAMES_SHORT[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${startDay} - ${endDay} ${endMonth}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}
