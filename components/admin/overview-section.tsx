import { PeriodSelector } from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { useStore } from "@/contexts/store-context";
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
import { runPurchaseSuggestions } from "@/utils/purchase-suggestions";
import { runSalesAnalysis } from "@/utils/sales-analysis";
import {
    AlertTriangle,
    Award,
    BarChart3,
    DollarSign,
    PackageX,
    ShoppingCart,
    TrendingDown,
    TrendingUp,
    Zap,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Image, ScrollView } from "react-native";
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
          const [purchReport, salesReport] = await Promise.all([
            runPurchaseSuggestions(db, 15, currentStore?.id),
            runSalesAnalysis(db, currentStore?.id),
          ]);
          if (cancelled) return;
          const lowMargin = purchReport.suggestions.filter(
            (s) => s.marginPct < 0.1 && s.marginPct >= 0,
          ).length;
          setBizAlerts({
            criticalStock: purchReport.criticalCount,
            capitalLocked: salesReport.totalCapitalLocked,
            lowMarginCount: lowMargin,
            noSalesCount: salesReport.noSalesCount,
            risingCount: purchReport.risingCount,
          });
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

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack p="$4" gap="$4" pb="$10">
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
            <StatCard
              label="Promedio"
              value={`$${fmtMoney(avgTicket)}`}
              detail={`$${fmtMoneyFull(avgTicket)}`}
              color="$purple10"
              icon={<TrendingUp size={16} color="$purple10" />}
              delta={avgDelta}
            />
          </XStack>

          {/* KPI Row 2: Ganancia */}
          <XStack gap="$3">
            <StatCard
              label="Ganancia"
              value={`${profit >= 0 ? "" : "-"}$${fmtMoney(Math.abs(profit))}`}
              detail={`${profit >= 0 ? "" : "-"}$${fmtMoneyFull(
                Math.abs(profit),
              )}`}
              color={profit >= 0 ? "$green10" : "$red10"}
              icon={
                profit >= 0 ? (
                  <TrendingUp size={16} color="$green10" />
                ) : (
                  <TrendingDown size={16} color="$red10" />
                )
              }
              delta={profitDelta}
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
                  <XStack gap="$2" style={{ alignItems: "center" }}>
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
                  <XStack gap="$2" style={{ alignItems: "center" }}>
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
                <XStack gap="$2" style={{ alignItems: "center" }}>
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
                    <XStack
                      key={w.workerId}
                      gap="$3"
                      style={{ alignItems: "center" }}
                    >
                      <YStack
                        width={26}
                        height={26}
                        style={{
                          borderRadius: 13,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: MEDAL_COLORS[i],
                        }}
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
                          style={{
                            borderRadius: 15,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
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
                  <XStack gap="$2" style={{ alignItems: "center" }}>
                    <Zap size={18} color="$blue10" />
                    <Text fontSize="$4" fontWeight="bold" color="$color">
                      Inteligencia del negocio
                    </Text>
                  </XStack>
                  <XStack gap="$3" flexWrap="wrap">
                    {bizAlerts.criticalStock > 0 && (
                      <Card
                        flex={1}
                        minWidth="45%"
                        bg="$red2"
                        borderWidth={1}
                        borderColor="$red6"
                        style={{ borderRadius: 12 }}
                        p="$3"
                      >
                        <XStack gap="$2" style={{ alignItems: "center" }}>
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
                        <Text fontSize="$1" color="$color10">
                          productos con ≤3 días
                        </Text>
                      </Card>
                    )}
                    {bizAlerts.capitalLocked > 0 && (
                      <Card
                        flex={1}
                        minWidth="45%"
                        bg="$orange2"
                        borderWidth={1}
                        borderColor="$orange6"
                        style={{ borderRadius: 12 }}
                        p="$3"
                      >
                        <XStack gap="$2" style={{ alignItems: "center" }}>
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
                        <Text fontSize="$1" color="$color10">
                          en productos estancados
                        </Text>
                      </Card>
                    )}
                    {bizAlerts.noSalesCount > 0 && (
                      <Card
                        flex={1}
                        minWidth="45%"
                        bg="$yellow2"
                        borderWidth={1}
                        borderColor="$yellow6"
                        style={{ borderRadius: 12 }}
                        p="$3"
                      >
                        <XStack gap="$2" style={{ alignItems: "center" }}>
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
                        <Text fontSize="$1" color="$color10">
                          productos (+30 días)
                        </Text>
                      </Card>
                    )}
                    {bizAlerts.lowMarginCount > 0 && (
                      <Card
                        flex={1}
                        minWidth="45%"
                        bg="$purple2"
                        borderWidth={1}
                        borderColor="$purple6"
                        style={{ borderRadius: 12 }}
                        p="$3"
                      >
                        <XStack gap="$2" style={{ alignItems: "center" }}>
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
                        <Text fontSize="$1" color="$color10">
                          productos {"<"}10%
                        </Text>
                      </Card>
                    )}
                    {bizAlerts.risingCount > 0 && (
                      <Card
                        flex={1}
                        minWidth="45%"
                        bg="$green2"
                        borderWidth={1}
                        borderColor="$green6"
                        style={{ borderRadius: 12 }}
                        p="$3"
                      >
                        <XStack gap="$2" style={{ alignItems: "center" }}>
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
                        <Text fontSize="$1" color="$color10">
                          productos en alza
                        </Text>
                      </Card>
                    )}
                  </XStack>
                </YStack>
              </Card>
            )}
        </YStack>
      </ScrollView>
    </>
  );
}
