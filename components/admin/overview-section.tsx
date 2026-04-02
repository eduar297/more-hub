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
  MONTH_NAMES_SHORT,
  shiftDay,
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
import { Dimensions, ScrollView } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

const SCREEN_W = Dimensions.get("window").width;

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
        const [daySumm, hourly, dayPurch, dayExp] = await Promise.all([
          ticketRepo.daySummary(nav.selectedDay),
          ticketRepo.hourlySales(nav.selectedDay),
          purchaseRepo.daySummary(nav.selectedDay),
          expenseRepo.dayTotal(nav.selectedDay),
        ]);
        setSalesTotal(daySumm.totalSales);
        setTicketCount(daySumm.ticketCount);
        setHourlySales(hourly);
        setPurchasesTotal(dayPurch.totalSpent);
        setExpensesTotal(dayExp);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        const [wkTickets, wkPurch, wkExp] = await Promise.all([
          ticketRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
          expenseRepo.rangeTotal(nav.selectedWeekStart, wkEnd),
        ]);
        setSalesTotal(wkTickets.reduce((s, t) => s + t.total, 0));
        setTicketCount(wkTickets.length);
        setPurchasesTotal(wkPurch.totalSpent);
        setExpensesTotal(wkExp);
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
        const [monthSumm, daily, monthP, monthE] = await Promise.all([
          ticketRepo.monthlySummary(nav.selectedMonth),
          ticketRepo.dailySales(nav.selectedMonth),
          purchaseRepo.monthlySummary(nav.selectedMonth),
          expenseRepo.monthlyTotal(nav.selectedMonth),
        ]);
        setSalesTotal(monthSumm.totalSales);
        setTicketCount(monthSumm.ticketCount);
        setDailySalesData(daily);
        setPurchasesTotal(monthP.totalSpent);
        setExpensesTotal(monthE);
      } else if (nav.period === "year") {
        const [yearSales, yearPurch, yearExp] = await Promise.all([
          ticketRepo.monthlySalesForYear(nav.selectedYear),
          purchaseRepo.monthlyTotalsForYear(nav.selectedYear),
          expenseRepo.monthlyTotalsForYear(nav.selectedYear),
        ]);
        setYearlySales(yearSales);
        setSalesTotal(yearSales.reduce((s, y) => s + y.total, 0));
        setTicketCount(yearSales.reduce((s, y) => s + y.tickets, 0));
        setPurchasesTotal(yearPurch.reduce((s, y) => s + y.total, 0));
        setExpensesTotal(yearExp.reduce((s, y) => s + y.total, 0));
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
  const fmtYLabel = useCallback((v: string) => {
    const n = Number(v);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return v;
  }, []);

  const chartData = useMemo(() => {
    if (nav.period === "range") return [];
    if (nav.period === "day") {
      const hourMap = new Map(hourlySales.map((h) => [h.hour, h.total]));
      return Array.from({ length: 24 }, (_, i) => {
        const total = hourMap.get(i) ?? 0;
        return {
          value: total,
          label: i % 3 === 0 ? `${i}h` : "",
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
        label:
          i === 0 || (i + 1) % 5 === 0 || i === days - 1 ? String(i + 1) : "",
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      };
    });
  }, [nav.period, hourlySales, dailySalesData, yearlySales, nav.selectedMonth]);

  const barWidth = useMemo(() => {
    if (nav.period === "day") return 8;
    if (nav.period === "week") return 30;
    if (nav.period === "year") return 16;
    const days = daysInMonth(nav.selectedMonth);
    const chartW = SCREEN_W - 80;
    return Math.max(3, Math.min(14, chartW / days / 1.6));
  }, [nav.period, nav.selectedMonth]);

  const barSpacing = useMemo(() => {
    if (nav.period === "day") return 2;
    if (nav.period === "week") return 10;
    if (nav.period === "year") return 6;
    const days = daysInMonth(nav.selectedMonth);
    return Math.max(1, Math.min(4, (SCREEN_W - 80) / days / 4));
  }, [nav.period, nav.selectedMonth]);

  const totalEgresos = purchasesTotal + expensesTotal;
  const profit = salesTotal - totalEgresos;
  const avgTicket = ticketCount > 0 ? salesTotal / ticketCount : 0;

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
              color="$green10"
              icon={<DollarSign size={16} color="$green10" />}
            />
            <StatCard
              label="Tickets"
              value={ticketCount}
              color="$blue10"
              icon={<BarChart3 size={16} color="$blue10" />}
            />
            <StatCard
              label="Promedio"
              value={`$${fmtMoney(avgTicket)}`}
              color="$purple10"
              icon={<TrendingUp size={16} color="$purple10" />}
            />
          </XStack>

          <XStack gap="$3">
            <StatCard
              label="Inventario"
              value={`$${fmtMoney(inventoryValue)}`}
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
                <BarChart
                  data={chartData}
                  height={110}
                  barWidth={barWidth}
                  spacing={barSpacing}
                  noOfSections={3}
                  hideRules
                  yAxisTextStyle={{ fontSize: 11, color: "#888" }}
                  formatYLabel={fmtYLabel}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  isAnimated
                  animationDuration={400}
                  barBorderRadius={2}
                />
              </YStack>
            </Card>
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
                <Text fontSize="$4" fontWeight="600" color="$green10">
                  +${fmtMoney(salesTotal)}
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
                  <Text fontSize="$4" fontWeight="600" color="$red10">
                    -${fmtMoney(purchasesTotal)}
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
                  <Text fontSize="$4" fontWeight="600" color="$red10">
                    -${fmtMoney(expensesTotal)}
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
                  fontSize="$7"
                  fontWeight="bold"
                  color={profit >= 0 ? "$green10" : "$red10"}
                >
                  {profit >= 0 ? "+" : "-"}${fmtMoney(Math.abs(profit))}
                </Text>
              </XStack>
            </YStack>
          </Card>
        </YStack>
      </ScrollView>
    </>
  );
}
