import { PeriodSelector } from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { ICON_BTN_BG } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import {
  daysInMonth,
  fmtMoney,
  fmtMoneyFull,
  MONTH_NAMES_SHORT,
  shiftDay,
  shiftMonth,
  shiftWeek,
  weekEndISO,
} from "@/utils/format";
import {
  runPurchaseSuggestions,
  type PurchaseReport,
} from "@/utils/purchase-suggestions";
import { runSalesAnalysis, type SalesReport } from "@/utils/sales-analysis";
import {
  AlertTriangle,
  Award,
  BarChart3,
  ChevronRight,
  DollarSign,
  PackageX,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Spinner, Text, XStack, YStack } from "tamagui";

export function OverviewSection() {
  const db = useSQLiteContext();
  const { currentStore } = useStore();
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();
  const productRepo = useProductRepository();

  const nav = usePeriodNavigation();
  const [loading, setLoading] = useState(true);

  // Data states
  const [salesTotal, setSalesTotal] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);

  // Previous period data (for delta %)
  const [prevSales, setPrevSales] = useState(0);
  const [prevTickets, setPrevTickets] = useState(0);
  const [prevPurchases, setPrevPurchases] = useState(0);
  const [prevExpenses, setPrevExpenses] = useState(0);

  // Chart data
  const [dailySalesData, setDailySalesData] = useState<
    { day: number; total: number }[]
  >([]);
  const [hourlySales, setHourlySales] = useState<
    { hour: number; total: number; tickets: number }[]
  >([]);
  const [yearlySales, setYearlySales] = useState<
    { month: number; total: number; tickets: number }[]
  >([]);

  // Stock alerts
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  // Business intelligence alerts (loaded once on focus, not per-period)
  const [bizAlerts, setBizAlerts] = useState<{
    criticalStock: number;
    capitalLocked: number;
    lowMarginCount: number;
    noSalesCount: number;
    risingCount: number;
  } | null>(null);
  const [purchReport, setPurchReport] = useState<PurchaseReport | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [alertModal, setAlertModal] = useState<
    "critical" | "capital" | "noSales" | "lowMargin" | "rising" | null
  >(null);

  // Mini leaderboard
  const [topWorkers, setTopWorkers] = useState<
    {
      workerId: number;
      workerName: string;
      workerPhotoUri: string | null;
      totalSales: number;
      ticketCount: number;
      avgTicket: number;
    }[]
  >([]);

  const periodRange = useMemo(() => {
    if (nav.period === "day")
      return { from: nav.selectedDay, to: nav.selectedDay };
    if (nav.period === "week")
      return {
        from: nav.selectedWeekStart,
        to: weekEndISO(nav.selectedWeekStart),
      };
    if (nav.period === "month") {
      const days = daysInMonth(nav.selectedMonth);
      return {
        from: `${nav.selectedMonth}-01`,
        to: `${nav.selectedMonth}-${String(days).padStart(2, "0")}`,
      };
    }
    if (nav.period === "year")
      return {
        from: `${nav.selectedYear}-01-01`,
        to: `${nav.selectedYear}-12-31`,
      };
    return { from: nav.dateRange.from, to: nav.dateRange.to };
  }, [
    nav.period,
    nav.selectedDay,
    nav.selectedWeekStart,
    nav.selectedMonth,
    nav.selectedYear,
    nav.dateRange,
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Stock alerts
      const prods = await productRepo.findAll();
      setOutOfStockCount(prods.filter((p) => p.stockBaseQty <= 0).length);
      setLowStockCount(
        prods.filter((p) => p.stockBaseQty > 0 && p.stockBaseQty <= 5).length,
      );

      // Mini leaderboard
      const lb = await ticketRepo.workerLeaderboard(
        periodRange.from,
        periodRange.to,
      );
      setTopWorkers(lb.slice(0, 3));

      if (nav.period === "day") {
        const prevDay = shiftDay(nav.selectedDay, -1);
        const [daySumm, hourly, dayPurch, dayExp, pSales, pPurch, pExp] =
          await Promise.all([
            ticketRepo.daySummary(nav.selectedDay),
            ticketRepo.hourlySales(nav.selectedDay),
            purchaseRepo.daySummary(nav.selectedDay),
            expenseRepo.dayTotal(nav.selectedDay),
            ticketRepo.daySummary(prevDay),
            purchaseRepo.daySummary(prevDay),
            expenseRepo.dayTotal(prevDay),
          ]);
        setSalesTotal(daySumm.totalSales);
        setTicketCount(daySumm.ticketCount);
        setHourlySales(hourly);
        setPurchasesTotal(dayPurch.totalSpent);
        setExpensesTotal(dayExp);
        setPrevSales(pSales.totalSales);
        setPrevTickets(pSales.ticketCount);
        setPrevPurchases(pPurch.totalSpent);
        setPrevExpenses(pExp);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        const prevWkStart = shiftWeek(nav.selectedWeekStart, -1);
        const prevWkEnd = weekEndISO(prevWkStart);
        const [wkTickets, wkPurch, wkExp, pTickets, pPurch, pExp] =
          await Promise.all([
            ticketRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
            purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
            expenseRepo.rangeTotal(nav.selectedWeekStart, wkEnd),
            ticketRepo.findByDateRange(prevWkStart, prevWkEnd),
            purchaseRepo.rangeSummary(prevWkStart, prevWkEnd),
            expenseRepo.rangeTotal(prevWkStart, prevWkEnd),
          ]);
        setSalesTotal(wkTickets.reduce((s, t) => s + t.total, 0));
        setTicketCount(wkTickets.length);
        setPurchasesTotal(wkPurch.totalSpent);
        setExpensesTotal(wkExp);
        setPrevSales(pTickets.reduce((s, t) => s + t.total, 0));
        setPrevTickets(pTickets.length);
        setPrevPurchases(pPurch.totalSpent);
        setPrevExpenses(pExp);
        const weekDailyTotals = Array.from({ length: 7 }, (_, i) => {
          const dayKey = shiftDay(nav.selectedWeekStart, i);
          return {
            day: i + 1,
            total: wkTickets
              .filter((t) => t.createdAt.slice(0, 10) === dayKey)
              .reduce((s, t) => s + t.total, 0),
          };
        });
        setDailySalesData(weekDailyTotals);
      } else if (nav.period === "month") {
        const prevMonth = shiftMonth(nav.selectedMonth, -1);
        const [monthSumm, daily, monthP, monthE, pSumm, pP, pE] =
          await Promise.all([
            ticketRepo.monthlySummary(nav.selectedMonth),
            ticketRepo.dailySales(nav.selectedMonth),
            purchaseRepo.monthlySummary(nav.selectedMonth),
            expenseRepo.monthlyTotal(nav.selectedMonth),
            ticketRepo.monthlySummary(prevMonth),
            purchaseRepo.monthlySummary(prevMonth),
            expenseRepo.monthlyTotal(prevMonth),
          ]);
        setSalesTotal(monthSumm.totalSales);
        setTicketCount(monthSumm.ticketCount);
        setDailySalesData(daily);
        setPurchasesTotal(monthP.totalSpent);
        setExpensesTotal(monthE);
        setPrevSales(pSumm.totalSales);
        setPrevTickets(pSumm.ticketCount);
        setPrevPurchases(pP.totalSpent);
        setPrevExpenses(pE);
      } else if (nav.period === "year") {
        const prevYear = String(Number(nav.selectedYear) - 1);
        const [yearSales, yearPurch, yearExp, pSales, pPurch, pExp] =
          await Promise.all([
            ticketRepo.monthlySalesForYear(nav.selectedYear),
            purchaseRepo.monthlyTotalsForYear(nav.selectedYear),
            expenseRepo.monthlyTotalsForYear(nav.selectedYear),
            ticketRepo.monthlySalesForYear(prevYear),
            purchaseRepo.monthlyTotalsForYear(prevYear),
            expenseRepo.monthlyTotalsForYear(prevYear),
          ]);
        setYearlySales(yearSales);
        setSalesTotal(yearSales.reduce((s, y) => s + y.total, 0));
        setTicketCount(yearSales.reduce((s, y) => s + y.tickets, 0));
        setPurchasesTotal(yearPurch.reduce((s, y) => s + y.total, 0));
        setExpensesTotal(yearExp.reduce((s, y) => s + y.total, 0));
        setPrevSales(pSales.reduce((s, y) => s + y.total, 0));
        setPrevTickets(pSales.reduce((s, y) => s + y.tickets, 0));
        setPrevPurchases(pPurch.reduce((s, y) => s + y.total, 0));
        setPrevExpenses(pExp.reduce((s, y) => s + y.total, 0));
      } else {
        // range
        const [rangeTickets, rangePurch, rangeExp] = await Promise.all([
          ticketRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to),
          purchaseRepo.rangeSummary(nav.dateRange.from, nav.dateRange.to),
          expenseRepo.rangeTotal(nav.dateRange.from, nav.dateRange.to),
        ]);
        setSalesTotal(rangeTickets.reduce((s, t) => s + t.total, 0));
        setTicketCount(rangeTickets.length);
        setPurchasesTotal(rangePurch.totalSpent);
        setExpensesTotal(rangeExp);
        setPrevSales(0);
        setPrevTickets(0);
        setPrevPurchases(0);
        setPrevExpenses(0);
        const dayCount =
          Math.round(
            (new Date(nav.dateRange.to + "T12:00:00").getTime() -
              new Date(nav.dateRange.from + "T12:00:00").getTime()) /
              86400000,
          ) + 1;
        const rangeDailyTotals = Array.from({ length: dayCount }, (_, i) => {
          const dayKey = shiftDay(nav.dateRange.from, i);
          return {
            day: i + 1,
            total: rangeTickets
              .filter((t) => t.createdAt.slice(0, 10) === dayKey)
              .reduce((s, t) => s + t.total, 0),
          };
        });
        setDailySalesData(rangeDailyTotals);
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
    periodRange,
    ticketRepo,
    purchaseRepo,
    expenseRepo,
    productRepo,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Business intelligence — heavier queries, loaded once on focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [pReport, sReport] = await Promise.all([
            runPurchaseSuggestions(db, 15, currentStore?.id),
            runSalesAnalysis(db, currentStore?.id),
          ]);
          if (cancelled) return;
          const lowMargin = pReport.suggestions.filter(
            (s) => s.marginPct < 0.1 && s.marginPct >= 0,
          ).length;
          setBizAlerts({
            criticalStock: pReport.criticalCount,
            capitalLocked: sReport.totalCapitalLocked,
            lowMarginCount: lowMargin,
            noSalesCount: sReport.noSalesCount,
            risingCount: pReport.risingCount,
          });
          setPurchReport(pReport);
          setSalesReport(sReport);
        } catch {
          /* non-critical */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db, currentStore?.id]),
  );

  const profit = salesTotal - purchasesTotal - expensesTotal;
  const avgTicket = ticketCount > 0 ? salesTotal / ticketCount : 0;

  // Delta % vs previous period
  const pctDelta = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
  const showDelta = nav.period !== "range";
  const salesDelta = showDelta ? pctDelta(salesTotal, prevSales) : undefined;
  const ticketsDelta = showDelta
    ? pctDelta(ticketCount, prevTickets)
    : undefined;
  const prevAvg = prevTickets > 0 ? prevSales / prevTickets : 0;
  const avgDelta = showDelta ? pctDelta(avgTicket, prevAvg) : undefined;
  const prevProfit = prevSales - prevPurchases - prevExpenses;
  const profitDelta = showDelta ? pctDelta(profit, prevProfit) : undefined;

  // Best/worst day and peak hour insights
  const insights = useMemo(() => {
    const result: { label: string; value: string; color: string }[] = [];
    if (nav.period === "day" && hourlySales.length > 0) {
      const active = hourlySales.filter((h) => h.total > 0);
      if (active.length > 0) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        result.push({
          label: "Hora pico",
          value: `${best.hour}:00 · $${fmtMoney(best.total)}`,
          color: "$green10",
        });
      }
    }
    if (
      (nav.period === "week" || nav.period === "month") &&
      dailySalesData.length > 0
    ) {
      const active = dailySalesData.filter((d) => d.total > 0);
      if (active.length >= 2) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        const worst = active.reduce((a, b) => (b.total < a.total ? b : a));
        if (nav.period === "week") {
          const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
          result.push({
            label: "Mejor día",
            value: `${DAY_LABELS[best.day - 1]} · $${fmtMoney(best.total)}`,
            color: "$green10",
          });
          result.push({
            label: "Peor día",
            value: `${DAY_LABELS[worst.day - 1]} · $${fmtMoney(worst.total)}`,
            color: "$red10",
          });
        } else {
          result.push({
            label: "Mejor día",
            value: `Día ${best.day} · $${fmtMoney(best.total)}`,
            color: "$green10",
          });
          result.push({
            label: "Peor día",
            value: `Día ${worst.day} · $${fmtMoney(worst.total)}`,
            color: "$red10",
          });
        }
      }
    }
    if (nav.period === "year" && yearlySales.length > 0) {
      const active = yearlySales.filter((m) => m.total > 0);
      if (active.length >= 2) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        const worst = active.reduce((a, b) => (b.total < a.total ? b : a));
        result.push({
          label: "Mejor mes",
          value: `${MONTH_NAMES_SHORT[best.month - 1]} · $${fmtMoney(
            best.total,
          )}`,
          color: "$green10",
        });
        result.push({
          label: "Peor mes",
          value: `${MONTH_NAMES_SHORT[worst.month - 1]} · $${fmtMoney(
            worst.total,
          )}`,
          color: "$red10",
        });
      }
    }
    return result;
  }, [nav.period, hourlySales, dailySalesData, yearlySales]);

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" gap="$3">
        <Spinner size="large" color="$blue10" />
        <Text color="$color10">Cargando…</Text>
      </YStack>
    );
  }

  const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const lbTotal = topWorkers.reduce((s, w) => s + w.totalSales, 0);

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

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        <YStack p="$4" gap="$4">
          {/* KPI Row 1 */}
          <XStack gap="$3">
            <StatCard
              label="Ventas"
              value={`$${fmtMoney(salesTotal)}`}
              detail={`$${fmtMoneyFull(salesTotal)}`}
              color="$green10"
              icon={<DollarSign size={16} color="$green10" />}
              delta={salesDelta}
            />
            <StatCard
              label="Tickets"
              value={ticketCount}
              color="$blue10"
              icon={<BarChart3 size={16} color="$blue10" />}
              delta={ticketsDelta}
            />
          </XStack>

          {/* KPI Row 2 */}
          <XStack gap="$3">
            <StatCard
              label={profit >= 0 ? "Ganancia" : "Pérdida"}
              value={`${profit >= 0 ? "" : "-"}$${fmtMoney(Math.abs(profit))}`}
              detail={`${profit >= 0 ? "" : "-"}$${fmtMoneyFull(
                Math.abs(profit),
              )}`}
              color={profit >= 0 ? "$green10" : "$red10"}
              bg={profit >= 0 ? "$green2" : "$red2"}
              borderColor={profit >= 0 ? "$green6" : "$red6"}
              icon={
                profit >= 0 ? (
                  <TrendingUp size={16} color="$green10" />
                ) : (
                  <TrendingDown size={16} color="$red10" />
                )
              }
              delta={profitDelta}
            />

            <StatCard
              label="Promedio"
              value={`$${fmtMoney(avgTicket)}`}
              detail={`$${fmtMoneyFull(avgTicket)}`}
              color="$purple10"
              icon={<TrendingUp size={16} color="$purple10" />}
              delta={avgDelta}
            />
          </XStack>

          {/* Insights */}
          {insights.length > 0 && (
            <XStack gap="$3" flexWrap="wrap">
              {insights.map((ins) => (
                <Card
                  key={ins.label}
                  flex={1}
                  minWidth="45%"
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 12 }}
                  p="$3"
                >
                  <Text fontSize="$1" color="$color10">
                    {ins.label}
                  </Text>
                  <Text
                    fontSize="$3"
                    fontWeight="bold"
                    color={ins.color as any}
                  >
                    {ins.value}
                  </Text>
                </Card>
              ))}
            </XStack>
          )}

          {/* Stock alerts */}
          {(outOfStockCount > 0 || lowStockCount > 0) && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <XStack gap="$4" flexWrap="wrap">
                {outOfStockCount > 0 && (
                  <XStack gap="$2" items="center">
                    <PackageX size={18} color="$red10" />
                    <Text fontSize="$3" fontWeight="bold" color="$red10">
                      {outOfStockCount}
                    </Text>
                    <Text fontSize="$3" color="$color10">
                      sin stock
                    </Text>
                  </XStack>
                )}
                {lowStockCount > 0 && (
                  <XStack gap="$2" items="center">
                    <AlertTriangle size={18} color="$orange10" />
                    <Text fontSize="$3" fontWeight="bold" color="$orange10">
                      {lowStockCount}
                    </Text>
                    <Text fontSize="$3" color="$color10">
                      stock bajo
                    </Text>
                  </XStack>
                )}
              </XStack>
            </Card>
          )}

          {/* Mini leaderboard (top 3) */}
          {topWorkers.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$3">
                <XStack gap="$2" items="center">
                  <Award size={18} color="$yellow10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    Top vendedores
                  </Text>
                </XStack>
                {topWorkers.map((w, i) => {
                  const pct =
                    lbTotal > 0
                      ? ((w.totalSales / lbTotal) * 100).toFixed(0)
                      : "0";
                  return (
                    <XStack key={w.workerId} gap="$3" items="center">
                      <YStack
                        width={26}
                        height={26}
                        rounded={13}
                        justify="center"
                        items="center"
                        bg={MEDAL_COLORS[i] as any}
                      >
                        <Text fontSize="$2" fontWeight="bold" color="#fff">
                          {i + 1}
                        </Text>
                      </YStack>
                      {w.workerPhotoUri ? (
                        <Image
                          source={{ uri: w.workerPhotoUri }}
                          style={{ width: 30, height: 30, borderRadius: 15 }}
                        />
                      ) : (
                        <YStack
                          width={30}
                          height={30}
                          bg="$color4"
                          rounded={15}
                          justify="center"
                          items="center"
                        >
                          <Text
                            fontSize="$3"
                            fontWeight="bold"
                            color="$color10"
                          >
                            {w.workerName.charAt(0).toUpperCase()}
                          </Text>
                        </YStack>
                      )}
                      <Text
                        flex={1}
                        fontSize="$3"
                        color="$color"
                        numberOfLines={1}
                      >
                        {w.workerName}
                      </Text>
                      <Text fontSize="$3" fontWeight="bold" color="$green10">
                        ${fmtMoney(w.totalSales)}
                      </Text>
                      <Text fontSize="$2" color="$color10">
                        {pct}%
                      </Text>
                    </XStack>
                  );
                })}
              </YStack>
            </Card>
          )}

          {/* Business intelligence alerts */}
          {bizAlerts &&
            (bizAlerts.criticalStock > 0 ||
              bizAlerts.capitalLocked > 0 ||
              bizAlerts.lowMarginCount > 0 ||
              bizAlerts.noSalesCount > 0 ||
              bizAlerts.risingCount > 0) && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                p="$4"
              >
                <YStack gap="$3">
                  <XStack gap="$2" items="center">
                    <Zap size={18} color="$blue10" />
                    <Text fontSize="$4" fontWeight="bold" color="$color">
                      Inteligencia del negocio
                    </Text>
                  </XStack>
                  <XStack gap="$3" flexWrap="wrap">
                    {bizAlerts.criticalStock > 0 && (
                      <Pressable
                        style={{ flex: 1, minWidth: "45%" }}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setAlertModal("critical");
                        }}
                      >
                        <Card
                          bg="$red2"
                          borderWidth={1}
                          borderColor="$red6"
                          style={{ borderRadius: 12 }}
                          p="$3"
                        >
                          <XStack gap="$2" items="center">
                            <ShoppingCart size={14} color="$red10" />
                            <Text fontSize="$1" color="$red10">
                              Compra urgente
                            </Text>
                          </XStack>
                          <Text
                            fontSize="$5"
                            fontWeight="bold"
                            color="$red10"
                            mt="$1"
                          >
                            {bizAlerts.criticalStock}
                          </Text>
                          <XStack justify="space-between" items="center">
                            <Text fontSize="$1" color="$color10">
                              productos con ≤3 días
                            </Text>
                            <ChevronRight size={12} color="$red10" />
                          </XStack>
                        </Card>
                      </Pressable>
                    )}
                    {bizAlerts.capitalLocked > 0 && (
                      <Pressable
                        style={{ flex: 1, minWidth: "45%" }}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setAlertModal("capital");
                        }}
                      >
                        <Card
                          bg="$orange2"
                          borderWidth={1}
                          borderColor="$orange6"
                          style={{ borderRadius: 12 }}
                          p="$3"
                        >
                          <XStack gap="$2" items="center">
                            <DollarSign size={14} color="$orange10" />
                            <Text fontSize="$1" color="$orange10">
                              Capital inmovilizado
                            </Text>
                          </XStack>
                          <Text
                            fontSize="$5"
                            fontWeight="bold"
                            color="$orange10"
                            mt="$1"
                          >
                            ${fmtMoney(bizAlerts.capitalLocked)}
                          </Text>
                          <XStack justify="space-between" items="center">
                            <Text fontSize="$1" color="$color10">
                              en productos estancados
                            </Text>
                            <ChevronRight size={12} color="$orange10" />
                          </XStack>
                        </Card>
                      </Pressable>
                    )}
                    {bizAlerts.noSalesCount > 0 && (
                      <Pressable
                        style={{ flex: 1, minWidth: "45%" }}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setAlertModal("noSales");
                        }}
                      >
                        <Card
                          bg="$yellow2"
                          borderWidth={1}
                          borderColor="$yellow6"
                          style={{ borderRadius: 12 }}
                          p="$3"
                        >
                          <XStack gap="$2" items="center">
                            <PackageX size={14} color="$yellow10" />
                            <Text fontSize="$1" color="$yellow10">
                              Sin ventas
                            </Text>
                          </XStack>
                          <Text
                            fontSize="$5"
                            fontWeight="bold"
                            color="$yellow10"
                            mt="$1"
                          >
                            {bizAlerts.noSalesCount}
                          </Text>
                          <XStack justify="space-between" items="center">
                            <Text fontSize="$1" color="$color10">
                              productos (+30 días)
                            </Text>
                            <ChevronRight size={12} color="$yellow10" />
                          </XStack>
                        </Card>
                      </Pressable>
                    )}
                    {bizAlerts.lowMarginCount > 0 && (
                      <Pressable
                        style={{ flex: 1, minWidth: "45%" }}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setAlertModal("lowMargin");
                        }}
                      >
                        <Card
                          bg="$purple2"
                          borderWidth={1}
                          borderColor="$purple6"
                          style={{ borderRadius: 12 }}
                          p="$3"
                        >
                          <XStack gap="$2" items="center">
                            <TrendingDown size={14} color="$purple10" />
                            <Text fontSize="$1" color="$purple10">
                              Margen bajo
                            </Text>
                          </XStack>
                          <Text
                            fontSize="$5"
                            fontWeight="bold"
                            color="$purple10"
                            mt="$1"
                          >
                            {bizAlerts.lowMarginCount}
                          </Text>
                          <XStack justify="space-between" items="center">
                            <Text fontSize="$1" color="$color10">
                              productos {"<"}10%
                            </Text>
                            <ChevronRight size={12} color="$purple10" />
                          </XStack>
                        </Card>
                      </Pressable>
                    )}
                    {bizAlerts.risingCount > 0 && (
                      <Pressable
                        style={{ flex: 1, minWidth: "45%" }}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setAlertModal("rising");
                        }}
                      >
                        <Card
                          bg="$green2"
                          borderWidth={1}
                          borderColor="$green6"
                          style={{ borderRadius: 12 }}
                          p="$3"
                        >
                          <XStack gap="$2" items="center">
                            <TrendingUp size={14} color="$green10" />
                            <Text fontSize="$1" color="$green10">
                              Tendencia ↑
                            </Text>
                          </XStack>
                          <Text
                            fontSize="$5"
                            fontWeight="bold"
                            color="$green10"
                            mt="$1"
                          >
                            {bizAlerts.risingCount}
                          </Text>
                          <XStack justify="space-between" items="center">
                            <Text fontSize="$1" color="$color10">
                              productos en alza
                            </Text>
                            <ChevronRight size={12} color="$green10" />
                          </XStack>
                        </Card>
                      </Pressable>
                    )}
                  </XStack>
                </YStack>
              </Card>
            )}
        </YStack>
      </ScrollView>

      {/* ── Alert detail modal ── */}
      <BizAlertModal
        alertType={alertModal}
        onClose={() => setAlertModal(null)}
        purchReport={purchReport}
        salesReport={salesReport}
        fmtMoney={fmtMoney}
      />
    </>
  );
}

/* ── Alert detail modal ─────────────────────────────────────────────────── */
type AlertType = "critical" | "capital" | "noSales" | "lowMargin" | "rising";

const ALERT_META: Record<
  AlertType,
  {
    title: string;
    accent: string;
    bg: string;
    Icon: typeof ShoppingCart;
  }
> = {
  critical: {
    title: "Compra urgente",
    accent: "$red10",
    bg: "$red2",
    Icon: ShoppingCart,
  },
  capital: {
    title: "Capital inmovilizado",
    accent: "$orange10",
    bg: "$orange2",
    Icon: DollarSign,
  },
  noSales: {
    title: "Sin ventas (+30 días)",
    accent: "$yellow10",
    bg: "$yellow2",
    Icon: PackageX,
  },
  lowMargin: {
    title: "Margen bajo (<10%)",
    accent: "$purple10",
    bg: "$purple2",
    Icon: TrendingDown,
  },
  rising: {
    title: "Tendencia en alza",
    accent: "$green10",
    bg: "$green2",
    Icon: TrendingUp,
  },
};

function BizAlertModal({
  alertType,
  onClose,
  purchReport,
  salesReport,
  fmtMoney: fmt,
}: {
  alertType: AlertType | null;
  onClose: () => void;
  purchReport: PurchaseReport | null;
  salesReport: SalesReport | null;
  fmtMoney: (n: number) => string;
}) {
  const colors = useColors();

  const meta = alertType ? ALERT_META[alertType] : null;

  const rows = useMemo(() => {
    if (!alertType || (!purchReport && !salesReport)) return [];

    switch (alertType) {
      case "critical":
        return (
          purchReport?.suggestions
            .filter((s) => s.urgency === "critical")
            .map((s) => ({
              key: s.product.id,
              name: s.product.name,
              photo: s.product.photoUri,
              lines: [
                `${Math.round(s.daysOfStock)} días de stock`,
                `Comprar ${Math.round(s.suggestedQty)} uds · $${fmt(
                  s.estimatedCost,
                )}`,
                `Venta diaria: ${s.dailySalesRate.toFixed(1)} uds`,
              ],
            })) ?? []
        );
      case "capital":
        return (
          salesReport?.stagnant.map((s) => ({
            key: s.product.id,
            name: s.product.name,
            photo: s.product.photoUri,
            lines: [
              `Capital: $${fmt(s.capitalLocked)}`,
              s.daysSinceLastSale != null
                ? `Última venta hace ${s.daysSinceLastSale} días`
                : "Sin ventas registradas",
              `Stock: ${Math.round(s.product.stockBaseQty)} uds`,
            ],
          })) ?? []
        );
      case "noSales":
        return (
          salesReport?.stagnant
            .filter(
              (s) => s.daysSinceLastSale == null || s.daysSinceLastSale > 30,
            )
            .map((s) => ({
              key: s.product.id,
              name: s.product.name,
              photo: s.product.photoUri,
              lines: [
                s.daysSinceLastSale != null
                  ? `${s.daysSinceLastSale} días sin vender`
                  : "Nunca vendido",
                `Capital: $${fmt(s.capitalLocked)}`,
                `Stock: ${Math.round(s.product.stockBaseQty)} uds`,
              ],
            })) ?? []
        );
      case "lowMargin":
        return (
          purchReport?.suggestions
            .filter((s) => s.marginPct < 0.1 && s.marginPct >= 0)
            .map((s) => ({
              key: s.product.id,
              name: s.product.name,
              photo: s.product.photoUri,
              lines: [
                `Margen: ${(s.marginPct * 100).toFixed(1)}%`,
                `Costo: $${fmt(s.avgUnitCost)} → Venta: $${fmt(
                  s.product.salePrice,
                )}`,
                `Ganancia: $${fmt(s.profitPerUnit)}/ud`,
              ],
            })) ?? []
        );
      case "rising":
        return (
          purchReport?.suggestions
            .filter((s) => s.salesTrend === "rising")
            .map((s) => ({
              key: s.product.id,
              name: s.product.name,
              photo: s.product.photoUri,
              lines: [
                `Tendencia: ×${s.trendFactor.toFixed(2)}`,
                `Venta diaria: ${s.dailySalesRate.toFixed(1)} uds`,
                `Aporte ingresos: ${(s.revenueShare * 100).toFixed(1)}%`,
              ],
            })) ?? []
        );
      default:
        return [];
    }
  }, [alertType, purchReport, salesReport, fmt]);

  if (!alertType || !meta) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top"]}
        style={{ flex: 1, backgroundColor: colors.modalBg }}
      >
        {/* Header */}
        <XStack
          p="$3"
          px="$4"
          style={{ alignItems: "center", justifyContent: "space-between" }}
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack style={{ alignItems: "center" }} gap="$2">
            <meta.Icon size={18} color={meta.accent as any} />
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: colors.text }}
            >
              {meta.title}
            </Text>
          </XStack>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: ICON_BTN_BG,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={colors.text as any} />
          </TouchableOpacity>
        </XStack>

        {/* Product list */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        >
          {rows.length === 0 && (
            <Text color="$color8" text="center" mt="$4">
              Sin datos disponibles
            </Text>
          )}
          {rows.map((row) => (
            <Card
              key={row.key}
              bg={meta.bg as any}
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 12 }}
              p="$3"
            >
              <XStack gap="$3" items="center">
                {row.photo ? (
                  <Image
                    source={{ uri: row.photo }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                    }}
                  />
                ) : (
                  <YStack
                    width={44}
                    height={44}
                    rounded={10}
                    bg="$color3"
                    items="center"
                    justify="center"
                  >
                    <Text fontSize="$2" color="$color8">
                      📦
                    </Text>
                  </YStack>
                )}
                <YStack flex={1} gap="$1">
                  <Text
                    fontSize="$3"
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.lines.map((line, i) => (
                    <Text key={i} fontSize="$2" color="$color10">
                      {line}
                    </Text>
                  ))}
                </YStack>
              </XStack>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
