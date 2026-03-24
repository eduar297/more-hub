import {
    CalendarSheet,
    DateNavigator,
    PeriodTabs,
    type DateRange,
    type Period,
} from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import {
    currentYear,
    currentYearMonth,
    dayLabel,
    daysInMonth,
    fmtMoney,
    MONTH_NAMES_SHORT,
    monthLabel,
    rangeLabel,
    shiftDay,
    shiftMonth,
    todayISO,
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

  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: todayISO(),
    to: todayISO(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const [weeklySales, setWeeklySales] = useState<
    { week: number; total: number; tickets: number }[]
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
        prods.reduce((s, p) => s + p.pricePerBaseUnit * p.stockBaseQty, 0),
      );

      if (period === "day") {
        const [daySumm, hourly, dayPurch, dayExp] = await Promise.all([
          ticketRepo.daySummary(selectedDay),
          ticketRepo.hourlySales(selectedDay),
          purchaseRepo.daySummary(selectedDay),
          expenseRepo.dayTotal(selectedDay),
        ]);
        setSalesTotal(daySumm.totalSales);
        setTicketCount(daySumm.ticketCount);
        setHourlySales(hourly);
        setPurchasesTotal(dayPurch.totalSpent);
        setExpensesTotal(dayExp);
      } else if (period === "week") {
        const [monthSumm, weekly, monthP, monthE] = await Promise.all([
          ticketRepo.monthlySummary(selectedMonth),
          ticketRepo.weeklySales(selectedMonth),
          purchaseRepo.monthlySummary(selectedMonth),
          expenseRepo.monthlyTotal(selectedMonth),
        ]);
        setSalesTotal(monthSumm.totalSales);
        setTicketCount(monthSumm.ticketCount);
        setWeeklySales(weekly);
        setPurchasesTotal(monthP.totalSpent);
        setExpensesTotal(monthE);
      } else if (period === "month") {
        const [monthSumm, daily, monthP, monthE] = await Promise.all([
          ticketRepo.monthlySummary(selectedMonth),
          ticketRepo.dailySales(selectedMonth),
          purchaseRepo.monthlySummary(selectedMonth),
          expenseRepo.monthlyTotal(selectedMonth),
        ]);
        setSalesTotal(monthSumm.totalSales);
        setTicketCount(monthSumm.ticketCount);
        setDailySalesData(daily);
        setPurchasesTotal(monthP.totalSpent);
        setExpensesTotal(monthE);
      } else if (period === "year") {
        const [yearSales, yearPurch, yearExp] = await Promise.all([
          ticketRepo.monthlySalesForYear(selectedYear),
          purchaseRepo.monthlyTotalsForYear(selectedYear),
          expenseRepo.monthlyTotalsForYear(selectedYear),
        ]);
        setYearlySales(yearSales);
        setSalesTotal(yearSales.reduce((s, y) => s + y.total, 0));
        setTicketCount(yearSales.reduce((s, y) => s + y.tickets, 0));
        setPurchasesTotal(yearPurch.reduce((s, y) => s + y.total, 0));
        setExpensesTotal(yearExp.reduce((s, y) => s + y.total, 0));
      } else {
        // range
        const [rangeTickets, rangePurch, rangeExp] = await Promise.all([
          ticketRepo.findByDateRange(dateRange.from, dateRange.to),
          purchaseRepo.rangeSummary(dateRange.from, dateRange.to),
          expenseRepo.rangeTotal(dateRange.from, dateRange.to),
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
    period,
    selectedDay,
    selectedMonth,
    selectedYear,
    dateRange,
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

  // Navigation
  const navigateBack = () => {
    if (period === "day") setSelectedDay((d) => shiftDay(d, -1));
    else if (period === "month" || period === "week")
      setSelectedMonth((m) => shiftMonth(m, -1));
    else if (period === "year") setSelectedYear((y) => String(Number(y) - 1));
  };
  const navigateForward = () => {
    if (period === "day") {
      const next = shiftDay(selectedDay, 1);
      if (next <= todayISO()) setSelectedDay(next);
    } else if (period === "month" || period === "week") {
      const next = shiftMonth(selectedMonth, 1);
      if (next <= currentYearMonth()) setSelectedMonth(next);
    } else if (period === "year") {
      const next = String(Number(selectedYear) + 1);
      if (Number(next) <= new Date().getFullYear()) setSelectedYear(next);
    }
  };
  const canGoForward = useMemo(() => {
    if (period === "day") return selectedDay < todayISO();
    if (period === "month" || period === "week")
      return selectedMonth < currentYearMonth();
    if (period === "year")
      return Number(selectedYear) < new Date().getFullYear();
    return false;
  }, [period, selectedDay, selectedMonth, selectedYear]);

  const dateLabelText = useMemo(() => {
    if (period === "day") return dayLabel(selectedDay);
    if (period === "month" || period === "week")
      return monthLabel(selectedMonth);
    if (period === "year") return selectedYear;
    return rangeLabel(dateRange.from, dateRange.to);
  }, [period, selectedDay, selectedMonth, selectedYear, dateRange]);

  // Chart data
  const chartData = useMemo(() => {
    if (period === "range") return [];
    if (period === "day") {
      return hourlySales.map((h) => ({
        value: h.total,
        label: `${h.hour}h`,
        frontColor: h.total > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      }));
    }
    if (period === "week") {
      return weeklySales.map((w) => ({
        value: w.total,
        label: `S${w.week}`,
        frontColor: "#22c55e",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (period === "month") {
      const days = daysInMonth(selectedMonth);
      const dataMap = new Map(dailySalesData.map((d) => [d.day, d.total]));
      return Array.from({ length: days }, (_, i) => ({
        value: dataMap.get(i + 1) ?? 0,
        label:
          i === 0 || (i + 1) % 5 === 0 || i === days - 1 ? String(i + 1) : "",
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? "#22c55e" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      };
    });
  }, [
    period,
    hourlySales,
    weeklySales,
    dailySalesData,
    yearlySales,
    selectedMonth,
  ]);

  const barWidth = useMemo(() => {
    if (period === "day") return 14;
    if (period === "week") return 40;
    if (period === "year") return 16;
    const days = daysInMonth(selectedMonth);
    const chartW = SCREEN_W - 80;
    return Math.max(3, Math.min(14, chartW / days / 1.6));
  }, [period, selectedMonth]);

  const barSpacing = useMemo(() => {
    if (period === "day") return 4;
    if (period === "week") return 12;
    if (period === "year") return 6;
    const days = daysInMonth(selectedMonth);
    return Math.max(1, Math.min(4, (SCREEN_W - 80) / days / 4));
  }, [period, selectedMonth]);

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
    period === "day"
      ? "Ventas por hora"
      : period === "week"
        ? "Ventas por semana"
        : period === "month"
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
          <PeriodTabs period={period} onChangePeriod={setPeriod} />
          <DateNavigator
            label={dateLabelText}
            onPrev={navigateBack}
            onNext={navigateForward}
            canGoForward={canGoForward}
            onCalendarPress={() => setCalendarOpen(true)}
          />
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
                  yAxisTextStyle={{ fontSize: 9, color: "#888" }}
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

      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        mode={period === "range" ? "range" : "day"}
        selectedDay={selectedDay}
        range={dateRange}
        onSelectDay={(d) => {
          setSelectedDay(d);
          if (period !== "day") setPeriod("day");
        }}
        onSelectRange={(r) => {
          setDateRange(r);
          if (period !== "range") setPeriod("range");
        }}
      />
    </>
  );
}
