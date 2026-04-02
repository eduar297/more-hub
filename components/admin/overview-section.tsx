import { PeriodSelector } from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
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
  shortDayLabel,
  weekEndISO,
} from "@/utils/format";
import {
  BarChart3,
  DollarSign,
  Package,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";
import { AdminBarChart } from "./admin-bar-chart";

export function OverviewSection() {
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
  const [productCount, setProductCount] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prods = await productRepo.findAll();
      setProductCount(prods.length);
      setInventoryValue(
        prods.reduce((s, p) => s + p.costPrice * p.stockBaseQty, 0),
      );

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
        // Build 7-day daily totals for the week chart
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
        // Build daily totals for range chart
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

  // Chart data
  const chartData = useMemo(() => {
    if (nav.period === "day") {
      const hourMap = new Map(hourlySales.map((h) => [h.hour, h.total]));
      return Array.from({ length: 24 }, (_, i) => {
        const total = hourMap.get(i) ?? 0;
        return {
          value: total,
          label: `${i}h`,
          frontColor: total > 0 ? "#22c55e" : "#555555",
          labelTextStyle: { fontSize: 10, color: "#888" },
        };
      });
    }
    if (nav.period === "week") {
      const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      return dailySalesData.map((d, i) => ({
        value: d.total,
        label: DAY_LABELS[i] ?? String(i + 1),
        frontColor: d.total > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (nav.period === "month") {
      const days = daysInMonth(nav.selectedMonth);
      const dataMap = new Map(dailySalesData.map((d) => [d.day, d.total]));
      return Array.from({ length: days }, (_, i) => ({
        value: dataMap.get(i + 1) ?? 0,
        label: String(i + 1),
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (nav.period === "range") {
      const dayCount = dailySalesData.length;
      if (dayCount === 0) return [];
      return dailySalesData.map((d, i) => ({
        value: d.total,
        label: shortDayLabel(shiftDay(nav.dateRange.from, i))
          .replace(/\sde\s/g, " ")
          .slice(0, 6),
        frontColor: d.total > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 9, color: "#888" },
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
        labelWidth: 28,
      };
    });
  }, [
    nav.period,
    hourlySales,
    dailySalesData,
    yearlySales,
    nav.selectedMonth,
    nav.dateRange,
  ]);

  const totalEgresos = purchasesTotal + expensesTotal;
  const profit = salesTotal - totalEgresos;
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

  const chartTitle =
    nav.period === "day"
      ? "Ventas por hora"
      : nav.period === "week"
      ? "Ventas de la semana"
      : nav.period === "month"
      ? "Ventas diarias"
      : nav.period === "range"
      ? "Ventas del período"
      : "Ventas mensuales";

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
          {/* KPI Row */}
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

          <XStack gap="$3">
            <StatCard
              label="Inventario"
              value={`$${fmtMoney(inventoryValue)}`}
              detail={`$${fmtMoneyFull(inventoryValue)}`}
              color="$purple10"
              icon={<Package size={16} color="$purple10" />}
            />
            <StatCard
              label="Productos"
              value={productCount}
              color="$blue10"
              icon={<Package size={16} color="$blue10" />}
            />
          </XStack>

          {/* Sales chart */}
          {chartData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$3">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <BarChart3 size={18} color="$blue10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    {chartTitle}
                  </Text>
                </XStack>
                <AdminBarChart data={chartData} />
              </YStack>
            </Card>
          )}

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

          {/* Balance card */}
          <Card
            bg={profit >= 0 ? "$green2" : "$red2"}
            borderWidth={1}
            borderColor={profit >= 0 ? "$green6" : "$red6"}
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <TrendingUp
                  size={18}
                  color={profit >= 0 ? "$green10" : "$red10"}
                />
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Balance
                </Text>
              </XStack>

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$3" color="$color10">
                  Ingresos (ventas)
                </Text>
                <Text fontSize="$3" fontWeight="600" color="$green10">
                  +${fmtMoneyFull(salesTotal)}
                </Text>
              </XStack>

              {purchasesTotal > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    Compras
                  </Text>
                  <Text fontSize="$3" fontWeight="600" color="$red10">
                    -${fmtMoneyFull(purchasesTotal)}
                  </Text>
                </XStack>
              )}

              {expensesTotal > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    Gastos operativos
                  </Text>
                  <Text fontSize="$3" fontWeight="600" color="$red10">
                    -${fmtMoneyFull(expensesTotal)}
                  </Text>
                </XStack>
              )}

              <Separator />

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  {profit >= 0 ? "Ganancia" : "Pérdida"}
                </Text>
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
            </YStack>
          </Card>
        </YStack>
      </ScrollView>
    </>
  );
}
