import { EXPENSE_CATEGORY_COLORS } from "@/constants/colors";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";
import { exportFinancePDF } from "@/utils/export";
import {
  daysInMonth,
  fmtMoney,
  fmtMoneyFull,
  MONTH_NAMES_SHORT,
  shiftDay,
  shiftMonth,
  shiftWeek,
  shortDayLabel,
  weekEndISO,
} from "@/utils/format";
import {
  Download,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Image, ScrollView } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import {
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";
import { AdminBarChart } from "./admin-bar-chart";
import { PeriodSelector } from "./period-selector";

export function FinanceSection() {
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();

  const nav = usePeriodNavigation();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<
    {
      workerId: number;
      workerName: string;
      workerPhotoUri: string | null;
      totalSales: number;
      ticketCount: number;
      avgTicket: number;
    }[]
  >([]);

  // P&L data
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesTickets, setSalesTickets] = useState(0);
  const [purchTotal, setPurchTotal] = useState(0);
  const [purchTransport, setPurchTransport] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<
    { category: ExpenseCategory; total: number }[]
  >([]);

  // Yearly trends
  const [yearSalesTrend, setYearSalesTrend] = useState<
    { month: number; total: number; tickets: number }[]
  >([]);
  const [yearPurchaseTrend, setYearPurchaseTrend] = useState<
    { month: number; total: number; transport: number }[]
  >([]);
  const [yearExpenseTrend, setYearExpenseTrend] = useState<
    { month: number; total: number }[]
  >([]);

  // Day/week/range chart data
  const [hourlySales, setHourlySales] = useState<
    { hour: number; total: number; tickets: number }[]
  >([]);
  const [weekDailyData, setWeekDailyData] = useState<
    { label: string; income: number; outflow: number }[]
  >([]);
  const [monthDailySales, setMonthDailySales] = useState<
    { day: number; total: number }[]
  >([]);
  const [monthDailyTrend, setMonthDailyTrend] = useState<
    { day: number; income: number; outflow: number }[]
  >([]);
  const [rangeDailyData, setRangeDailyData] = useState<
    { label: string; income: number; outflow: number }[]
  >([]);
  const [dayHourlyTrend, setDayHourlyTrend] = useState<
    { hour: number; income: number; outflow: number }[]
  >([]);

  // Previous period comparison
  const [prevSales, setPrevSales] = useState(0);
  const [prevEgresos, setPrevEgresos] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (nav.period === "day") {
        const [
          daySumm,
          dayP,
          dayE,
          dayExpCat,
          hourly,
          dayPurchases,
          dayExpenses,
        ] = await Promise.all([
          ticketRepo.daySummary(nav.selectedDay),
          purchaseRepo.daySummary(nav.selectedDay),
          expenseRepo.dayTotal(nav.selectedDay),
          expenseRepo.daySummaryByCategory(nav.selectedDay),
          ticketRepo.hourlySales(nav.selectedDay),
          purchaseRepo.findByDay(nav.selectedDay),
          expenseRepo.findByDay(nav.selectedDay),
        ]);
        setSalesTotal(daySumm.totalSales);
        setSalesTickets(daySumm.ticketCount);
        setPurchTotal(dayP.totalSpent);
        setPurchTransport(dayP.totalTransport);
        setExpenseTotal(dayE);
        setExpensesByCategory(dayExpCat);
        setHourlySales(hourly);
        // Build hourly income/outflow for day trend
        const hourMap = new Map(hourly.map((h) => [h.hour, h.total]));
        const purchByHour = new Map<number, number>();
        for (const p of dayPurchases) {
          const h = new Date(p.createdAt).getHours();
          purchByHour.set(h, (purchByHour.get(h) ?? 0) + p.total);
        }
        const expByHour = new Map<number, number>();
        for (const e of dayExpenses) {
          const h = new Date(e.createdAt).getHours();
          expByHour.set(h, (expByHour.get(h) ?? 0) + e.amount);
        }
        setDayHourlyTrend(
          Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            income: hourMap.get(i) ?? 0,
            outflow: (purchByHour.get(i) ?? 0) + (expByHour.get(i) ?? 0),
          })).filter((d) => d.income > 0 || d.outflow > 0),
        );
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        const [wkTickets, wkPurch, wkExp, wkExpCat, wkPurchases, wkExpenses] =
          await Promise.all([
            ticketRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
            purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
            expenseRepo.rangeTotal(nav.selectedWeekStart, wkEnd),
            expenseRepo.rangeSummaryByCategory(nav.selectedWeekStart, wkEnd),
            purchaseRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
            expenseRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          ]);
        setSalesTotal(wkTickets.reduce((s, t) => s + t.total, 0));
        setSalesTickets(wkTickets.length);
        setPurchTotal(wkPurch.totalSpent);
        setPurchTransport(wkPurch.totalTransport);
        setExpenseTotal(wkExp);
        setExpensesByCategory(wkExpCat);
        // Build daily income/outflow for week chart
        const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
        const purchByDate = new Map<string, number>();
        for (const p of wkPurchases) {
          const dk = p.createdAt.slice(0, 10);
          purchByDate.set(dk, (purchByDate.get(dk) ?? 0) + p.total);
        }
        const expByDate = new Map<string, number>();
        for (const e of wkExpenses) {
          expByDate.set(e.date, (expByDate.get(e.date) ?? 0) + e.amount);
        }
        const daily = Array.from({ length: 7 }, (_, i) => {
          const dayKey = shiftDay(nav.selectedWeekStart, i);
          const dayIncome = wkTickets
            .filter((t) => t.createdAt.slice(0, 10) === dayKey)
            .reduce((s, t) => s + t.total, 0);
          const dayOutflow =
            (purchByDate.get(dayKey) ?? 0) + (expByDate.get(dayKey) ?? 0);
          return {
            label: DAY_LABELS[i],
            income: dayIncome,
            outflow: dayOutflow,
          };
        });
        setWeekDailyData(daily);
      } else if (nav.period === "month") {
        const [
          monthS,
          monthP,
          monthE,
          expByCat,
          monthDaily,
          monthPurchases,
          monthExpenses,
        ] = await Promise.all([
          ticketRepo.monthlySummary(nav.selectedMonth),
          purchaseRepo.monthlySummary(nav.selectedMonth),
          expenseRepo.monthlyTotal(nav.selectedMonth),
          expenseRepo.monthlySummaryByCategory(nav.selectedMonth),
          ticketRepo.dailySales(nav.selectedMonth),
          purchaseRepo.findByMonth(nav.selectedMonth),
          expenseRepo.findByMonth(nav.selectedMonth),
        ]);
        setSalesTotal(monthS.totalSales);
        setSalesTickets(monthS.ticketCount);
        setPurchTotal(monthP.totalSpent);
        setPurchTransport(monthP.totalTransport);
        setExpenseTotal(monthE);
        setExpensesByCategory(expByCat);
        setMonthDailySales(monthDaily);
        // Build daily income/outflow for the month
        const numDays = daysInMonth(nav.selectedMonth);
        const salesMap = new Map(monthDaily.map((d) => [d.day, d.total]));
        const purchByDay = new Map<number, number>();
        for (const p of monthPurchases) {
          const d = new Date(p.createdAt).getDate();
          purchByDay.set(d, (purchByDay.get(d) ?? 0) + p.total);
        }
        const expByDay = new Map<number, number>();
        for (const e of monthExpenses) {
          const d = new Date(e.date + "T12:00:00").getDate();
          expByDay.set(d, (expByDay.get(d) ?? 0) + e.amount);
        }
        const trend = Array.from({ length: numDays }, (_, i) => ({
          day: i + 1,
          income: salesMap.get(i + 1) ?? 0,
          outflow: (purchByDay.get(i + 1) ?? 0) + (expByDay.get(i + 1) ?? 0),
        }));
        setMonthDailyTrend(trend);
      } else if (nav.period === "year") {
        const yearStart = `${nav.selectedYear}-01-01`;
        const yearEnd = `${nav.selectedYear}-12-31`;
        const [ySales, yPurch, yExp, yExpCat] = await Promise.all([
          ticketRepo.monthlySalesForYear(nav.selectedYear),
          purchaseRepo.monthlyTotalsForYear(nav.selectedYear),
          expenseRepo.monthlyTotalsForYear(nav.selectedYear),
          expenseRepo.rangeSummaryByCategory(yearStart, yearEnd),
        ]);
        setYearSalesTrend(ySales);
        setYearPurchaseTrend(yPurch);
        setYearExpenseTrend(yExp);
        setSalesTotal(ySales.reduce((s, y) => s + y.total, 0));
        setSalesTickets(ySales.reduce((s, y) => s + y.tickets, 0));
        setPurchTotal(yPurch.reduce((s, y) => s + y.total, 0));
        setPurchTransport(yPurch.reduce((s, y) => s + y.transport, 0));
        setExpenseTotal(yExp.reduce((s, y) => s + y.total, 0));
        setExpensesByCategory(yExpCat);
      } else {
        // range
        const [rangeTickets, rangePurch, rangeExp, rangeExpCat] =
          await Promise.all([
            ticketRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to),
            purchaseRepo.rangeSummary(nav.dateRange.from, nav.dateRange.to),
            expenseRepo.rangeTotal(nav.dateRange.from, nav.dateRange.to),
            expenseRepo.rangeSummaryByCategory(
              nav.dateRange.from,
              nav.dateRange.to,
            ),
          ]);
        setSalesTotal(rangeTickets.reduce((s, t) => s + t.total, 0));
        setSalesTickets(rangeTickets.length);
        setPurchTotal(rangePurch.totalSpent);
        setPurchTransport(rangePurch.totalTransport);
        setExpenseTotal(rangeExp);
        setExpensesByCategory(rangeExpCat);
        // Build daily income for range chart
        const dayCount =
          Math.round(
            (new Date(nav.dateRange.to + "T12:00:00").getTime() -
              new Date(nav.dateRange.from + "T12:00:00").getTime()) /
              86400000,
          ) + 1;
        const rangeDaily = Array.from({ length: dayCount }, (_, i) => {
          const dayKey = shiftDay(nav.dateRange.from, i);
          const dayIncome = rangeTickets
            .filter((t) => t.createdAt.slice(0, 10) === dayKey)
            .reduce((s, t) => s + t.total, 0);
          return {
            label: shortDayLabel(dayKey)
              .replace(/\sde\s/g, " ")
              .slice(0, 6),
            income: dayIncome,
            outflow: 0,
          };
        });
        setRangeDailyData(rangeDaily);
      }
    } finally {
      setLoading(false);
    }
  }, [
    nav.period,
    nav.selectedDay,
    nav.selectedMonth,
    nav.selectedWeekStart,
    nav.selectedYear,
    nav.dateRange,
    ticketRepo,
    purchaseRepo,
    expenseRepo,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Load previous period comparison data (non-blocking)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (nav.period === "day") {
            const prevDay = shiftDay(nav.selectedDay, -1);
            const [pS, pP, pE] = await Promise.all([
              ticketRepo.daySummary(prevDay),
              purchaseRepo.daySummary(prevDay),
              expenseRepo.dayTotal(prevDay),
            ]);
            setPrevSales(pS.totalSales);
            setPrevEgresos(pP.totalSpent + pE);
          } else if (nav.period === "week") {
            const prevWk = shiftWeek(nav.selectedWeekStart, -1);
            const prevWkEnd = weekEndISO(prevWk);
            const [pT, pP, pE] = await Promise.all([
              ticketRepo.findByDateRange(prevWk, prevWkEnd),
              purchaseRepo.rangeSummary(prevWk, prevWkEnd),
              expenseRepo.rangeTotal(prevWk, prevWkEnd),
            ]);
            setPrevSales(pT.reduce((s, t) => s + t.total, 0));
            setPrevEgresos(pP.totalSpent + pE);
          } else if (nav.period === "month") {
            const prevMonth = shiftMonth(nav.selectedMonth, -1);
            const [pS, pP, pE] = await Promise.all([
              ticketRepo.monthlySummary(prevMonth),
              purchaseRepo.monthlySummary(prevMonth),
              expenseRepo.monthlyTotal(prevMonth),
            ]);
            setPrevSales(pS.totalSales);
            setPrevEgresos(pP.totalSpent + pE);
          } else if (nav.period === "year") {
            const prevYear = String(Number(nav.selectedYear) - 1);
            const [pS, pP, pE] = await Promise.all([
              ticketRepo.monthlySalesForYear(prevYear),
              purchaseRepo.monthlyTotalsForYear(prevYear),
              expenseRepo.monthlyTotalsForYear(prevYear),
            ]);
            setPrevSales(pS.reduce((s, y) => s + y.total, 0));
            setPrevEgresos(
              pP.reduce((s, y) => s + y.total, 0) +
                pE.reduce((s, y) => s + y.total, 0),
            );
          } else {
            setPrevSales(0);
            setPrevEgresos(0);
          }
        } catch {
          setPrevSales(0);
          setPrevEgresos(0);
        }
      })();
    }, [
      nav.period,
      nav.selectedDay,
      nav.selectedMonth,
      nav.selectedWeekStart,
      nav.selectedYear,
      ticketRepo,
      purchaseRepo,
      expenseRepo,
    ]),
  );

  // Load worker leaderboard for the period
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          let from: string;
          let to: string;
          if (nav.period === "day") {
            from = nav.selectedDay;
            to = nav.selectedDay;
          } else if (nav.period === "week") {
            from = nav.selectedWeekStart;
            to = weekEndISO(nav.selectedWeekStart);
          } else if (nav.period === "month") {
            from = `${nav.selectedMonth}-01`;
            to = `${nav.selectedMonth}-${String(
              daysInMonth(nav.selectedMonth),
            ).padStart(2, "0")}`;
          } else if (nav.period === "year") {
            from = `${nav.selectedYear}-01-01`;
            to = `${nav.selectedYear}-12-31`;
          } else {
            from = nav.dateRange.from;
            to = nav.dateRange.to;
          }
          const data = await ticketRepo.workerLeaderboard(from, to);
          setLeaderboard(data);
        } catch {
          setLeaderboard([]);
        }
      })();
    }, [
      nav.period,
      nav.selectedDay,
      nav.selectedWeekStart,
      nav.selectedMonth,
      nav.selectedYear,
      nav.dateRange,
      ticketRepo,
    ]),
  );

  const purchaseMerchandise = purchTotal - purchTransport;
  const totalEgresos = purchTotal + expenseTotal;
  const profit = salesTotal - totalEgresos;
  const profitMargin =
    salesTotal > 0 ? ((profit / salesTotal) * 100).toFixed(1) : "0.0";

  const egresoItems = useMemo(() => {
    const items: { label: string; value: number; color: string }[] = [];
    if (purchaseMerchandise > 0)
      items.push({
        label: "Compras",
        value: purchaseMerchandise,
        color: "#3b82f6",
      });
    if (purchTransport > 0)
      items.push({
        label: "Transporte",
        value: purchTransport,
        color: "#a855f7",
      });
    for (const ec of expensesByCategory) {
      items.push({
        label: EXPENSE_CATEGORIES[ec.category],
        value: ec.total,
        color: EXPENSE_CATEGORY_COLORS[ec.category] ?? "#888",
      });
    }
    return items;
  }, [purchaseMerchandise, purchTransport, expensesByCategory]);

  const pieTotalEgresos = egresoItems.reduce((s, i) => s + i.value, 0);
  const pieData = egresoItems.map((i) => ({ value: i.value, color: i.color }));

  // Yearly trend data
  const yearlyTrendData = useMemo(() => {
    const salesMap = new Map(yearSalesTrend.map((s) => [s.month, s.total]));
    const purchMap = new Map(yearPurchaseTrend.map((p) => [p.month, p.total]));
    const expMap = new Map(yearExpenseTrend.map((e) => [e.month, e.total]));
    return Array.from({ length: 12 }, (_, i) => {
      const income = salesMap.get(i + 1) ?? 0;
      const outflow = (purchMap.get(i + 1) ?? 0) + (expMap.get(i + 1) ?? 0);
      return { month: i + 1, income, outflow };
    }).filter((item) => item.income > 0 || item.outflow > 0);
  }, [yearSalesTrend, yearPurchaseTrend, yearExpenseTrend]);

  const groupedBarData = useMemo(() => {
    const data: {
      value: number;
      label?: string;
      frontColor: string;
      spacing?: number;
      labelTextStyle?: object;
      labelWidth?: number;
    }[] = [];
    for (const item of yearlyTrendData) {
      data.push({
        value: item.income,
        label: MONTH_NAMES_SHORT[item.month - 1],
        frontColor: "#22c55e",
        spacing: 2,
        labelTextStyle: { fontSize: 10, color: "#888" },
        labelWidth: 30,
      });
      data.push({
        value: item.outflow,
        frontColor: "#ef4444",
        spacing: 14,
      });
    }
    return data;
  }, [yearlyTrendData]);

  const profitTrendData = useMemo(
    () =>
      yearlyTrendData.map((item) => ({
        value: item.income - item.outflow,
        label: MONTH_NAMES_SHORT[item.month - 1],
        frontColor: item.income - item.outflow >= 0 ? "#22c55e" : "#ef4444",
        labelTextStyle: { fontSize: 10, color: "#888" },
        labelWidth: 28,
      })),
    [yearlyTrendData],
  );

  // Monthly daily grouped bar data (Ingresos vs Egresos by day)
  const monthGroupedBarData = useMemo(() => {
    const data: {
      value: number;
      label?: string;
      frontColor: string;
      spacing?: number;
      labelTextStyle?: object;
      labelWidth?: number;
    }[] = [];
    for (const item of monthDailyTrend.filter(
      (d) => d.income > 0 || d.outflow > 0,
    )) {
      data.push({
        value: item.income,
        label: String(item.day),
        frontColor: "#22c55e",
        spacing: 2,
        labelTextStyle: { fontSize: 9, color: "#888" },
      });
      data.push({
        value: item.outflow,
        frontColor: "#ef4444",
        spacing: 10,
      });
    }
    return data;
  }, [monthDailyTrend]);

  // Monthly daily profit trend data
  const monthProfitTrendData = useMemo(
    () =>
      monthDailyTrend
        .filter((d) => d.income > 0 || d.outflow > 0)
        .map((item) => ({
          value: item.income - item.outflow,
          label: String(item.day),
          frontColor: item.income - item.outflow >= 0 ? "#22c55e" : "#ef4444",
          labelTextStyle: { fontSize: 9, color: "#888" },
        })),
    [monthDailyTrend],
  );

  // Week daily grouped bar data (Ingresos vs Egresos by day)
  const weekGroupedBarData = useMemo(() => {
    if (!weekDailyData.some((d) => d.income > 0 || d.outflow > 0)) return [];
    const data: {
      value: number;
      label?: string;
      frontColor: string;
      spacing?: number;
      labelTextStyle?: object;
      labelWidth?: number;
    }[] = [];
    for (const item of weekDailyData.filter(
      (d) => d.income > 0 || d.outflow > 0,
    )) {
      data.push({
        value: item.income,
        label: item.label,
        frontColor: "#22c55e",
        spacing: 2,
        labelTextStyle: { fontSize: 10, color: "#888" },
        labelWidth: 30,
      });
      data.push({
        value: item.outflow,
        frontColor: "#ef4444",
        spacing: 14,
      });
    }
    return data;
  }, [weekDailyData]);

  // Week daily profit trend data
  const weekProfitTrendData = useMemo(
    () =>
      weekDailyData.some((d) => d.income > 0 || d.outflow > 0)
        ? weekDailyData
            .filter((d) => d.income > 0 || d.outflow > 0)
            .map((item) => ({
              value: item.income - item.outflow,
              label: item.label,
              frontColor:
                item.income - item.outflow >= 0 ? "#22c55e" : "#ef4444",
              labelTextStyle: { fontSize: 10, color: "#888" },
              labelWidth: 30,
            }))
        : [],
    [weekDailyData],
  );

  // Day hourly grouped bar data (Ingresos vs Egresos by hour)
  const dayGroupedBarData = useMemo(() => {
    const data: {
      value: number;
      label?: string;
      frontColor: string;
      spacing?: number;
      labelTextStyle?: object;
    }[] = [];
    for (const item of dayHourlyTrend) {
      data.push({
        value: item.income,
        label: `${item.hour}h`,
        frontColor: "#22c55e",
        spacing: 2,
        labelTextStyle: { fontSize: 10, color: "#888" },
      });
      data.push({
        value: item.outflow,
        frontColor: "#ef4444",
        spacing: 10,
      });
    }
    return data;
  }, [dayHourlyTrend]);

  // Day hourly profit trend data
  const dayProfitTrendData = useMemo(
    () =>
      dayHourlyTrend.map((item) => ({
        value: item.income - item.outflow,
        label: `${item.hour}h`,
        frontColor: item.income - item.outflow >= 0 ? "#22c55e" : "#ef4444",
        labelTextStyle: { fontSize: 10, color: "#888" },
      })),
    [dayHourlyTrend],
  );

  // Hourly chart for day view
  const hourlyChartData = useMemo(() => {
    if (nav.period !== "day") return [];
    const hourMap = new Map(hourlySales.map((h) => [h.hour, h.total]));
    return Array.from({ length: 24 }, (_, i) => {
      const total = hourMap.get(i) ?? 0;
      return {
        value: total,
        label: `${i}h`,
        frontColor: total > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      };
    }).filter((item) => item.value > 0);
  }, [nav.period, hourlySales]);

  // Week daily income bar chart
  const weekChartData = useMemo(() => {
    if (nav.period !== "week") return [];
    return weekDailyData
      .map((d) => ({
        value: d.income,
        label: d.label,
        frontColor: d.income > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }))
      .filter((item) => item.value > 0);
  }, [nav.period, weekDailyData]);

  // Range daily income bar chart
  const rangeChartData = useMemo(() => {
    if (nav.period !== "range" || rangeDailyData.length === 0) return [];
    return rangeDailyData
      .map((d) => ({
        value: d.income,
        label: d.label,
        frontColor: d.income > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 9, color: "#888" },
      }))
      .filter((item) => item.value > 0);
  }, [nav.period, rangeDailyData]);

  // Month daily income bar chart
  const monthChartData = useMemo(() => {
    if (nav.period !== "month") return [];
    const numDays = daysInMonth(nav.selectedMonth);
    const dayMap = new Map(monthDailySales.map((d) => [d.day, d.total]));
    return Array.from({ length: numDays }, (_, i) => {
      const total = dayMap.get(i + 1) ?? 0;
      return {
        value: total,
        label: String(i + 1),
        frontColor: total > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 9, color: "#888" },
      };
    }).filter((item) => item.value > 0);
  }, [nav.period, nav.selectedMonth, monthDailySales]);

  // Select the active trend data based on period
  const activeGroupedBarData = useMemo(() => {
    switch (nav.period) {
      case "day":
        return dayGroupedBarData;
      case "week":
        return weekGroupedBarData;
      case "month":
        return monthGroupedBarData;
      case "year":
        return groupedBarData;
      default:
        return [];
    }
  }, [
    nav.period,
    dayGroupedBarData,
    weekGroupedBarData,
    monthGroupedBarData,
    groupedBarData,
  ]);

  const activeProfitData = useMemo(() => {
    switch (nav.period) {
      case "day":
        return dayProfitTrendData;
      case "week":
        return weekProfitTrendData;
      case "month":
        return monthProfitTrendData;
      case "year":
        return profitTrendData;
      default:
        return [];
    }
  }, [
    nav.period,
    dayProfitTrendData,
    weekProfitTrendData,
    monthProfitTrendData,
    profitTrendData,
  ]);

  const hasNegativeProfit = activeProfitData.some((d) => d.value < 0);
  const hasPositiveProfit = activeProfitData.some((d) => d.value > 0);
  const profitAbsMax =
    activeProfitData.length > 0
      ? Math.max(
          Math.abs(Math.max(0, ...activeProfitData.map((d) => d.value))),
          Math.abs(Math.min(0, ...activeProfitData.map((d) => d.value))),
        )
      : 0;
  const profitStep = profitAbsMax > 0 ? Math.ceil(profitAbsMax / 3) : 1;
  const profitSectionsAbove = hasPositiveProfit ? 3 : 1;
  const profitSectionsBelow = hasNegativeProfit ? 3 : 0;

  if (loading) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: "center", alignItems: "center" }}
        gap="$3"
      >
        <Spinner size="large" color="$blue10" />
        <Text color="$color10">Cargando…</Text>
      </YStack>
    );
  }

  return (
    <>
      {/* Sticky period selector card */}
      <Card
        mx="$4"
        mb="$2"
        p="$3"
        bg="$color1"
        borderWidth={1}
        borderColor="$borderColor"
        style={{ borderRadius: 16 }}
      >
        <YStack gap="$2">
          <PeriodSelector nav={nav} />
        </YStack>
      </Card>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack p="$4" gap="$4" pb="$10">
          {/* P&L card */}
          <Card
            bg={profit >= 0 ? "$green2" : "$red2"}
            borderWidth={1}
            borderColor={profit >= 0 ? "$green6" : "$red6"}
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                {profit >= 0 ? (
                  <TrendingUp size={18} color="$green10" />
                ) : (
                  <TrendingDown size={18} color="$red10" />
                )}
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Estado de resultados
                </Text>
              </XStack>

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$4" color="$color10">
                  Ingresos (ventas)
                </Text>
                <Text fontSize="$3" fontWeight="600" color="$green10">
                  +${fmtMoneyFull(salesTotal)}
                </Text>
              </XStack>
              <Text fontSize="$2" color="$color8" ml="$4">
                {salesTickets} tickets
              </Text>

              <Separator />

              <Text fontSize="$3" fontWeight="bold" color="$color">
                Egresos
              </Text>

              {purchaseMerchandise > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  ml="$2"
                >
                  <Text fontSize="$3" color="$color10">
                    Compras de mercancía
                  </Text>
                  <Text fontSize="$3" fontWeight="600" color="$red10">
                    -${fmtMoneyFull(purchaseMerchandise)}
                  </Text>
                </XStack>
              )}

              {purchTransport > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  ml="$2"
                >
                  <Text fontSize="$3" color="$color10">
                    Transporte (compras)
                  </Text>
                  <Text fontSize="$3" fontWeight="600" color="$red10">
                    -${fmtMoneyFull(purchTransport)}
                  </Text>
                </XStack>
              )}

              {expensesByCategory.map((ec) => (
                <XStack
                  key={ec.category}
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  ml="$2"
                >
                  <Text fontSize="$3" color="$color10">
                    {EXPENSE_CATEGORIES[ec.category]}
                  </Text>
                  <Text fontSize="$3" fontWeight="600" color="$red10">
                    -${fmtMoneyFull(ec.total)}
                  </Text>
                </XStack>
              ))}

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Total egresos
                </Text>
                <Text fontSize="$3" fontWeight="bold" color="$red10">
                  -${fmtMoneyFull(totalEgresos)}
                </Text>
              </XStack>

              <Separator />

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <YStack>
                  <Text fontSize="$5" fontWeight="bold" color="$color">
                    {profit >= 0 ? "Ganancia neta" : "Pérdida neta"}
                  </Text>
                  <Text fontSize="$2" color="$color10">
                    Margen: {profitMargin}%
                  </Text>
                </YStack>
                <Text
                  fontSize="$5"
                  fontWeight="bold"
                  color={profit >= 0 ? "$green10" : "$red10"}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  flex={1}
                  text="right"
                  ml="$2"
                >
                  {profit >= 0 ? "+" : "-"}${fmtMoneyFull(Math.abs(profit))}
                </Text>
              </XStack>

              {/* ROI */}
              {totalEgresos > 0 && (
                <>
                  <Separator />
                  <XStack
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$2" color="$color10">
                      ROI (retorno sobre inversión)
                    </Text>
                    <Text
                      fontSize="$3"
                      fontWeight="bold"
                      color={profit >= 0 ? "$green10" : "$red10"}
                    >
                      {((profit / totalEgresos) * 100).toFixed(1)}%
                    </Text>
                  </XStack>
                </>
              )}

              {/* Previous period comparison */}
              {nav.period !== "range" && (prevSales > 0 || prevEgresos > 0) && (
                <>
                  <Separator />
                  <Text fontSize="$2" fontWeight="600" color="$color8">
                    vs período anterior
                  </Text>
                  <XStack
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$2" color="$color8">
                      Ingresos ant.
                    </Text>
                    <Text fontSize="$2" color="$color8">
                      ${fmtMoneyFull(prevSales)}
                      {prevSales > 0
                        ? ` (${salesTotal >= prevSales ? "+" : ""}${(
                            ((salesTotal - prevSales) / prevSales) *
                            100
                          ).toFixed(0)}%)`
                        : ""}
                    </Text>
                  </XStack>
                  <XStack
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$2" color="$color8">
                      Egresos ant.
                    </Text>
                    <Text fontSize="$2" color="$color8">
                      ${fmtMoneyFull(prevEgresos)}
                    </Text>
                  </XStack>
                  <XStack
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$2" color="$color8">
                      Resultado ant.
                    </Text>
                    <Text
                      fontSize="$2"
                      fontWeight="600"
                      color={
                        prevSales - prevEgresos >= 0 ? "$green10" : "$red10"
                      }
                    >
                      {prevSales - prevEgresos >= 0 ? "+" : "-"}$
                      {fmtMoneyFull(Math.abs(prevSales - prevEgresos))}
                    </Text>
                  </XStack>
                </>
              )}
            </YStack>
          </Card>

          {/* Export PDF button */}
          <Button
            size="$3"
            bg="$blue3"
            borderWidth={1}
            borderColor="$blue6"
            style={{ borderRadius: 12 }}
            icon={
              exporting ? (
                <Spinner size="small" color="$blue10" />
              ) : (
                <Download size={16} color="$blue10" />
              )
            }
            disabled={exporting}
            opacity={exporting ? 0.6 : 1}
            onPress={async () => {
              setExporting(true);
              try {
                await exportFinancePDF({
                  periodLabel: nav.periodLabel,
                  totalIncome: salesTotal,
                  totalPurchases: purchTotal,
                  totalExpenses: expenseTotal,
                  profit,
                  expensesByCategory: expensesByCategory.map((ec) => ({
                    category: EXPENSE_CATEGORIES[ec.category],
                    amount: ec.total,
                  })),
                  topProducts: [],
                });
              } finally {
                setExporting(false);
              }
            }}
          >
            <Text fontSize="$3" fontWeight="600" color="$blue10">
              {exporting ? "Generando…" : "Exportar reporte PDF"}
            </Text>
          </Button>

          {/* Expense breakdown pie */}
          {pieData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$3">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <ShoppingBag size={16} color="$red10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    Desglose de egresos
                  </Text>
                  <Text fontSize="$3" color="$color10" ml="auto">
                    ${fmtMoney(pieTotalEgresos)}
                  </Text>
                </XStack>
                <YStack style={{ alignItems: "center" }}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={80}
                    innerRadius={48}
                    centerLabelComponent={() => (
                      <YStack
                        style={{
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text fontSize={11} color="$color10">
                          Total
                        </Text>
                        <Text fontSize={16} fontWeight="bold" color="$color">
                          ${fmtMoney(pieTotalEgresos)}
                        </Text>
                      </YStack>
                    )}
                    isAnimated
                    animationDuration={400}
                  />
                </YStack>
                <YStack gap="$2">
                  {egresoItems.map((item, idx) => {
                    const pct =
                      pieTotalEgresos > 0
                        ? ((item.value / pieTotalEgresos) * 100).toFixed(0)
                        : "0";
                    return (
                      <XStack
                        key={idx}
                        style={{ alignItems: "center" }}
                        gap="$2"
                      >
                        <YStack
                          width={12}
                          height={12}
                          style={{
                            borderRadius: 6,
                            backgroundColor: item.color,
                          }}
                        />
                        <Text flex={1} fontSize="$3" color="$color10">
                          {item.label}
                        </Text>
                        <Text fontSize="$3" fontWeight="600" color="$color">
                          ${fmtMoney(item.value)} · {pct}%
                        </Text>
                      </XStack>
                    );
                  })}
                </YStack>
              </YStack>
            </Card>
          )}

          {/* Day: hourly sales chart */}
          {nav.period === "day" && hourlyChartData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Ingresos por hora
                </Text>
                <AdminBarChart
                  data={hourlyChartData}
                  xAxisLabel="Hora"
                  yAxisLabel="Monto ($)"
                />
              </YStack>
            </Card>
          )}

          {/* Week: daily income chart */}
          {nav.period === "week" && weekChartData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Ingresos de la semana
                </Text>
                <AdminBarChart
                  data={weekChartData}
                  xAxisLabel="Día"
                  yAxisLabel="Monto ($)"
                />
              </YStack>
            </Card>
          )}

          {/* Range: daily income chart */}
          {nav.period === "range" && rangeChartData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Ingresos del período
                </Text>
                <AdminBarChart
                  data={rangeChartData}
                  xAxisLabel="Día"
                  yAxisLabel="Monto ($)"
                />
              </YStack>
            </Card>
          )}

          {/* Month: daily income chart */}
          {nav.period === "month" && monthChartData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Ingresos diarios del mes
                </Text>
                <AdminBarChart
                  data={monthChartData}
                  xAxisLabel="Día"
                  yAxisLabel="Monto ($)"
                />
              </YStack>
            </Card>
          )}

          {/* Tendencias — day: by hour, week: by day, month: by day, year: by month */}
          {nav.period !== "range" && (
            <>
              <Text fontSize="$5" fontWeight="bold" color="$color" mt="$2">
                {nav.period === "year"
                  ? `Tendencias ${nav.selectedYear}`
                  : nav.period === "month"
                  ? "Tendencias del mes"
                  : nav.period === "week"
                  ? "Tendencias de la semana"
                  : "Tendencias del día"}
              </Text>

              {/* Income vs Outflow bar chart */}
              {activeGroupedBarData.length > 0 && (
                <Card
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 14 }}
                  p="$4"
                >
                  <YStack gap="$2">
                    <Text fontSize="$3" fontWeight="600" color="$color10">
                      Ingresos vs Egresos
                    </Text>
                    <XStack gap="$4" mb="$2">
                      <XStack style={{ alignItems: "center" }} gap="$1">
                        <YStack
                          width={10}
                          height={10}
                          style={{
                            borderRadius: 5,
                            backgroundColor: "#22c55e",
                          }}
                        />
                        <Text fontSize="$2" color="$color10">
                          Ingresos
                        </Text>
                      </XStack>
                      <XStack style={{ alignItems: "center" }} gap="$1">
                        <YStack
                          width={10}
                          height={10}
                          style={{
                            borderRadius: 5,
                            backgroundColor: "#ef4444",
                          }}
                        />
                        <Text fontSize="$2" color="$color10">
                          Egresos
                        </Text>
                      </XStack>
                    </XStack>
                    <AdminBarChart
                      data={activeGroupedBarData}
                      showLine={false}
                      xAxisLabel={
                        nav.period === "day"
                          ? "Hora"
                          : nav.period === "year"
                          ? "Mes"
                          : "Día"
                      }
                      yAxisLabel="Monto ($)"
                    />
                  </YStack>
                </Card>
              )}

              {/* Profit/Loss trend */}
              {activeProfitData.length > 0 && (
                <Card
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 14 }}
                  p="$4"
                >
                  <YStack gap="$2">
                    <Text fontSize="$3" fontWeight="600" color="$color10">
                      {nav.period === "year"
                        ? "Ganancia/Pérdida por mes"
                        : nav.period === "day"
                        ? "Ganancia/Pérdida por hora"
                        : "Ganancia/Pérdida por día"}
                    </Text>
                    <AdminBarChart
                      data={activeProfitData}
                      stepValue={profitStep}
                      noOfSections={profitSectionsAbove}
                      mostNegativeValue={
                        hasNegativeProfit
                          ? -(profitStep * profitSectionsBelow)
                          : undefined
                      }
                      xAxisLabel={
                        nav.period === "day"
                          ? "Hora"
                          : nav.period === "year"
                          ? "Mes"
                          : "Día"
                      }
                      yAxisLabel="Ganancia ($)"
                    />
                  </YStack>
                </Card>
              )}
            </>
          )}

          {/* Period-aware summary table */}
          {nav.period === "day" &&
            dayHourlyTrend.some((h) => h.income > 0 || h.outflow > 0) && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack p="$4" pb="$2">
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    Desglose del día por hora
                  </Text>
                </YStack>
                <XStack px="$4" py="$2" bg="$color2">
                  <Text
                    width={40}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                  >
                    Hora
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$green10"
                    style={{ textAlign: "right" }}
                  >
                    Ingreso
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$red10"
                    style={{ textAlign: "right" }}
                  >
                    Egreso
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color"
                    style={{ textAlign: "right" }}
                  >
                    Resultado
                  </Text>
                </XStack>
                {dayHourlyTrend
                  .filter((h) => h.income > 0 || h.outflow > 0)
                  .map((h) => {
                    const net = h.income - h.outflow;
                    return (
                      <YStack key={h.hour}>
                        <Separator />
                        <XStack
                          px="$4"
                          py="$2"
                          style={{ alignItems: "center" }}
                        >
                          <Text width={40} fontSize="$3" color="$color">
                            {h.hour}:00
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            color="$green10"
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                          >
                            ${fmtMoney(h.income)}
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            color="$red10"
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                          >
                            ${fmtMoney(h.outflow)}
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            fontWeight="bold"
                            color={net >= 0 ? "$green10" : "$red10"}
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(net))}
                          </Text>
                        </XStack>
                      </YStack>
                    );
                  })}
              </Card>
            )}

          {nav.period === "week" && weekDailyData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              <YStack p="$4" pb="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Desglose de la semana por día
                </Text>
              </YStack>
              <XStack px="$4" py="$2" bg="$color2">
                <Text
                  width={35}
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                >
                  Día
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$green10"
                  style={{ textAlign: "right" }}
                >
                  Ingreso
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$red10"
                  style={{ textAlign: "right" }}
                >
                  Egreso
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$color"
                  style={{ textAlign: "right" }}
                >
                  Resultado
                </Text>
              </XStack>
              {weekDailyData.map((d, idx) => {
                const net = d.income - d.outflow;
                if (d.income === 0 && d.outflow === 0) return null;
                return (
                  <YStack key={idx}>
                    <Separator />
                    <XStack px="$4" py="$2" style={{ alignItems: "center" }}>
                      <Text width={35} fontSize="$3" color="$color">
                        {d.label}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        color="$green10"
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                      >
                        ${fmtMoney(d.income)}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        color="$red10"
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                      >
                        ${fmtMoney(d.outflow)}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        fontWeight="bold"
                        color={net >= 0 ? "$green10" : "$red10"}
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(net))}
                      </Text>
                    </XStack>
                  </YStack>
                );
              })}
            </Card>
          )}

          {nav.period === "month" &&
            monthDailyTrend.some((d) => d.income > 0 || d.outflow > 0) && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack p="$4" pb="$2">
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    Desglose del mes por día
                  </Text>
                </YStack>
                <XStack px="$4" py="$2" bg="$color2">
                  <Text
                    width={35}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                  >
                    Día
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$green10"
                    style={{ textAlign: "right" }}
                  >
                    Ingreso
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$red10"
                    style={{ textAlign: "right" }}
                  >
                    Egreso
                  </Text>
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color"
                    style={{ textAlign: "right" }}
                  >
                    Resultado
                  </Text>
                </XStack>
                {monthDailyTrend
                  .filter((d) => d.income > 0 || d.outflow > 0)
                  .map((d) => {
                    const net = d.income - d.outflow;
                    return (
                      <YStack key={d.day}>
                        <Separator />
                        <XStack
                          px="$4"
                          py="$2"
                          style={{ alignItems: "center" }}
                        >
                          <Text width={35} fontSize="$3" color="$color">
                            {d.day}
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            color="$green10"
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                          >
                            ${fmtMoney(d.income)}
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            color="$red10"
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                          >
                            ${fmtMoney(d.outflow)}
                          </Text>
                          <Text
                            flex={1}
                            fontSize="$3"
                            fontWeight="bold"
                            color={net >= 0 ? "$green10" : "$red10"}
                            style={{ textAlign: "right" }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(net))}
                          </Text>
                        </XStack>
                      </YStack>
                    );
                  })}
              </Card>
            )}

          {nav.period === "year" && yearlyTrendData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              <YStack p="$4" pb="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Desglose anual por mes
                </Text>
              </YStack>
              <XStack px="$4" py="$2" bg="$color2">
                <Text
                  width={35}
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                >
                  Mes
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$green10"
                  style={{ textAlign: "right" }}
                >
                  Ingreso
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$red10"
                  style={{ textAlign: "right" }}
                >
                  Egreso
                </Text>
                <Text
                  flex={1}
                  fontSize="$2"
                  fontWeight="600"
                  color="$color"
                  style={{ textAlign: "right" }}
                >
                  Resultado
                </Text>
              </XStack>
              {yearlyTrendData.map((item, idx) => {
                const netResult = item.income - item.outflow;
                if (item.income === 0 && item.outflow === 0) return null;
                return (
                  <YStack key={idx}>
                    <Separator />
                    <XStack px="$4" py="$2" style={{ alignItems: "center" }}>
                      <Text width={35} fontSize="$3" color="$color">
                        {MONTH_NAMES_SHORT[item.month - 1]}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        color="$green10"
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                      >
                        ${fmtMoney(item.income)}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        color="$red10"
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                      >
                        ${fmtMoney(item.outflow)}
                      </Text>
                      <Text
                        flex={1}
                        fontSize="$3"
                        fontWeight="bold"
                        color={netResult >= 0 ? "$green10" : "$red10"}
                        style={{ textAlign: "right" }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {netResult >= 0 ? "+" : "-"}$
                        {fmtMoney(Math.abs(netResult))}
                      </Text>
                    </XStack>
                  </YStack>
                );
              })}
            </Card>
          )}

          {nav.period === "range" && rangeDailyData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              <YStack p="$4" pb="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Desglose del período
                </Text>
              </YStack>
              <XStack px="$4" py="$2" bg="$color2">
                <Text flex={1} fontSize="$2" fontWeight="600" color="$color10">
                  Fecha
                </Text>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$green10"
                  style={{ width: 80, textAlign: "right" }}
                >
                  Ingresos
                </Text>
              </XStack>
              {rangeDailyData.map((d, idx) => (
                <YStack key={idx}>
                  <Separator />
                  <XStack px="$4" py="$2" style={{ alignItems: "center" }}>
                    <Text flex={1} fontSize="$3" color="$color">
                      {d.label}
                    </Text>
                    <Text
                      fontSize="$3"
                      color="$green10"
                      style={{ width: 80, textAlign: "right" }}
                    >
                      ${fmtMoney(d.income)}
                    </Text>
                  </XStack>
                </YStack>
              ))}
            </Card>
          )}

          {/* Worker leaderboard */}
          {leaderboard.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$3">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <Users size={18} color="$purple10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    Rendimiento del equipo
                  </Text>
                </XStack>

                {leaderboard.map((worker, index) => {
                  const lbTotal = leaderboard.reduce(
                    (s, w) => s + w.totalSales,
                    0,
                  );
                  const medal =
                    index < 3
                      ? (["#FFD700", "#C0C0C0", "#CD7F32"] as const)[index]
                      : null;
                  const pct =
                    lbTotal > 0
                      ? ((worker.totalSales / lbTotal) * 100).toFixed(1)
                      : "0";
                  return (
                    <Card
                      key={worker.workerId}
                      bg="$color1"
                      borderWidth={1}
                      borderColor="$borderColor"
                      style={{ borderRadius: 12 }}
                      overflow="hidden"
                      p="$3"
                    >
                      <XStack style={{ alignItems: "center" }} gap="$3">
                        <YStack
                          width={32}
                          height={32}
                          style={{
                            borderRadius: 16,
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: medal ?? "transparent",
                          }}
                          borderWidth={medal ? 0 : 1}
                          borderColor="$borderColor"
                        >
                          <Text
                            fontSize="$3"
                            fontWeight="bold"
                            color={medal ? "#fff" : "$color10"}
                          >
                            {index + 1}
                          </Text>
                        </YStack>

                        {worker.workerPhotoUri ? (
                          <Image
                            source={{ uri: worker.workerPhotoUri }}
                            style={{ width: 36, height: 36, borderRadius: 18 }}
                          />
                        ) : (
                          <YStack
                            width={36}
                            height={36}
                            bg="$color4"
                            style={{
                              borderRadius: 18,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              fontSize="$4"
                              fontWeight="bold"
                              color="$color10"
                            >
                              {worker.workerName.charAt(0).toUpperCase()}
                            </Text>
                          </YStack>
                        )}

                        <YStack flex={1}>
                          <Text fontSize="$3" fontWeight="bold" color="$color">
                            {worker.workerName}
                          </Text>
                          <Text fontSize="$2" color="$color10">
                            {worker.ticketCount} tickets · prom $
                            {fmtMoney(worker.avgTicket)}
                          </Text>
                        </YStack>

                        <YStack style={{ alignItems: "flex-end" }}>
                          <Text
                            fontSize="$3"
                            fontWeight="bold"
                            color="$green10"
                          >
                            ${fmtMoney(worker.totalSales)}
                          </Text>
                          <Text fontSize="$2" color="$color10">
                            {pct}%
                          </Text>
                        </YStack>
                      </XStack>

                      <YStack
                        mt="$2"
                        height={4}
                        bg="$color3"
                        style={{ borderRadius: 2, overflow: "hidden" }}
                      >
                        <YStack
                          height={4}
                          bg={medal ?? "$blue8"}
                          style={{
                            borderRadius: 2,
                            width: `${
                              lbTotal > 0
                                ? (worker.totalSales / lbTotal) * 100
                                : 0
                            }%` as any,
                          }}
                        />
                      </YStack>
                    </Card>
                  );
                })}
              </YStack>
            </Card>
          )}
        </YStack>
      </ScrollView>
    </>
  );
}
