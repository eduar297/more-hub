import type { DateRange, Period } from "@/components/admin/period-selector";
import {
    currentWeekMonday,
    currentYear,
    currentYearMonth,
    dayLabel,
    monthLabel,
    rangeLabel,
    shiftDay,
    shiftMonth,
    shiftWeek,
    todayISO,
    weekLabel,
} from "@/utils/format";
import { useCallback, useMemo, useState } from "react";

export interface PeriodNavigation {
  period: Period;
  selectedDay: string;
  selectedMonth: string;
  selectedYear: string;
  selectedWeekStart: string;
  dateRange: DateRange;
  calendarOpen: boolean;
  periodLabel: string;
  canGoForward: boolean;

  setPeriod: (p: Period) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  openCalendar: () => void;
  closeCalendar: () => void;

  selectDay: (d: string) => void;
  selectMonth: (m: string) => void;
  selectYear: (y: string) => void;
  selectWeek: (w: string) => void;
  selectRange: (r: DateRange) => void;
}

export function usePeriodNavigation(
  initialPeriod: Period = "month",
): PeriodNavigation {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekMonday);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: todayISO(),
    to: todayISO(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const periodLabel = useMemo(() => {
    if (period === "day") return dayLabel(selectedDay);
    if (period === "week") return weekLabel(selectedWeekStart);
    if (period === "month") return monthLabel(selectedMonth);
    if (period === "year") return selectedYear;
    return rangeLabel(dateRange.from, dateRange.to);
  }, [
    period,
    selectedDay,
    selectedWeekStart,
    selectedMonth,
    selectedYear,
    dateRange,
  ]);

  const canGoForward = useMemo(() => {
    if (period === "day") return selectedDay < todayISO();
    if (period === "week") return shiftWeek(selectedWeekStart, 1) <= todayISO();
    if (period === "month") return selectedMonth < currentYearMonth();
    if (period === "year")
      return Number(selectedYear) < new Date().getFullYear();
    return false;
  }, [period, selectedDay, selectedWeekStart, selectedMonth, selectedYear]);

  const navigateBack = useCallback(() => {
    if (period === "day") setSelectedDay((d) => shiftDay(d, -1));
    else if (period === "week") setSelectedWeekStart((w) => shiftWeek(w, -1));
    else if (period === "month") setSelectedMonth((m) => shiftMonth(m, -1));
    else if (period === "year") setSelectedYear((y) => String(Number(y) - 1));
  }, [period]);

  const navigateForward = useCallback(() => {
    if (period === "day") {
      setSelectedDay((d) => {
        const next = shiftDay(d, 1);
        return next <= todayISO() ? next : d;
      });
    } else if (period === "week") {
      setSelectedWeekStart((w) => {
        const next = shiftWeek(w, 1);
        return next <= todayISO() ? next : w;
      });
    } else if (period === "month") {
      setSelectedMonth((m) => {
        const next = shiftMonth(m, 1);
        return next <= currentYearMonth() ? next : m;
      });
    } else if (period === "year") {
      setSelectedYear((y) => {
        const next = String(Number(y) + 1);
        return Number(next) <= new Date().getFullYear() ? next : y;
      });
    }
  }, [period]);

  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);

  const selectDay = useCallback((d: string) => setSelectedDay(d), []);
  const selectMonth = useCallback((m: string) => setSelectedMonth(m), []);
  const selectYear = useCallback((y: string) => setSelectedYear(y), []);
  const selectWeek = useCallback((w: string) => setSelectedWeekStart(w), []);
  const selectRange = useCallback((r: DateRange) => setDateRange(r), []);

  return {
    period,
    selectedDay,
    selectedMonth,
    selectedYear,
    selectedWeekStart,
    dateRange,
    calendarOpen,
    periodLabel,
    canGoForward,
    setPeriod,
    navigateBack,
    navigateForward,
    openCalendar,
    closeCalendar,
    selectDay,
    selectMonth,
    selectYear,
    selectWeek,
    selectRange,
  };
}
