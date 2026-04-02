import { EXPENSE_CATEGORY_COLORS } from "@/constants/colors";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";
import {
  fmtMoney,
  MONTH_NAMES_SHORT,
  shiftDay,
  shortDayLabel,
  weekEndISO,
} from "@/utils/format";
import { ShoppingBag, TrendingDown, TrendingUp } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";
import { AdminBarChart } from "./admin-bar-chart";
import { PeriodSelector } from "./period-selector";

export function FinanceSection() {
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();

  const nav = usePeriodNavigation();
  const [loading, setLoading] = useState(true);

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
  const [rangeDailyData, setRangeDailyData] = useState<
    { label: string; income: number; outflow: number }[]
  >([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (nav.period === "day") {
        const [daySumm, dayP, dayE, dayExpCat, hourly] = await Promise.all([
          ticketRepo.daySummary(nav.selectedDay),
          purchaseRepo.daySummary(nav.selectedDay),
          expenseRepo.dayTotal(nav.selectedDay),
          expenseRepo.daySummaryByCategory(nav.selectedDay),
          ticketRepo.hourlySales(nav.selectedDay),
        ]);
        setSalesTotal(daySumm.totalSales);
        setSalesTickets(daySumm.ticketCount);
        setPurchTotal(dayP.totalSpent);
        setPurchTransport(dayP.totalTransport);
        setExpenseTotal(dayE);
        setExpensesByCategory(dayExpCat);
        setHourlySales(hourly);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        const [wkTickets, wkPurch, wkExp, wkExpCat] = await Promise.all([
          ticketRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
          expenseRepo.rangeTotal(nav.selectedWeekStart, wkEnd),
          expenseRepo.rangeSummaryByCategory(nav.selectedWeekStart, wkEnd),
        ]);
        setSalesTotal(wkTickets.reduce((s, t) => s + t.total, 0));
        setSalesTickets(wkTickets.length);
        setPurchTotal(wkPurch.totalSpent);
        setPurchTransport(wkPurch.totalTransport);
        setExpenseTotal(wkExp);
        setExpensesByCategory(wkExpCat);
        // Build daily income/outflow for week chart
        const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
        const daily = Array.from({ length: 7 }, (_, i) => {
          const dayKey = shiftDay(nav.selectedWeekStart, i);
          const dayIncome = wkTickets
            .filter((t) => t.createdAt.slice(0, 10) === dayKey)
            .reduce((s, t) => s + t.total, 0);
          // Outflow distributed proportionally (we don't have daily purchase/expense breakdown for week)
          return { label: DAY_LABELS[i], income: dayIncome, outflow: 0 };
        });
        setWeekDailyData(daily);
      } else if (nav.period === "month") {
        const [monthS, monthP, monthE, expByCat] = await Promise.all([
          ticketRepo.monthlySummary(nav.selectedMonth),
          purchaseRepo.monthlySummary(nav.selectedMonth),
          expenseRepo.monthlyTotal(nav.selectedMonth),
          expenseRepo.monthlySummaryByCategory(nav.selectedMonth),
        ]);
        setSalesTotal(monthS.totalSales);
        setSalesTickets(monthS.ticketCount);
        setPurchTotal(monthP.totalSpent);
        setPurchTransport(monthP.totalTransport);
        setExpenseTotal(monthE);
        setExpensesByCategory(expByCat);
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

      // Load yearly trends for month view
      if (nav.period === "month") {
        const yr = parseInt(nav.selectedMonth.slice(0, 4), 10);
        const [ySales, yPurch, yExp] = await Promise.all([
          ticketRepo.monthlySalesForYear(String(yr)),
          purchaseRepo.monthlyTotalsForYear(String(yr)),
          expenseRepo.monthlyTotalsForYear(String(yr)),
        ]);
        setYearSalesTrend(ySales);
        setYearPurchaseTrend(yPurch);
        setYearExpenseTrend(yExp);
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
    });
  }, [nav.period, hourlySales]);

  // Week daily income bar chart
  const weekChartData = useMemo(() => {
    if (nav.period !== "week") return [];
    return weekDailyData.map((d) => ({
      value: d.income,
      label: d.label,
      frontColor: d.income > 0 ? "#22c55e" : "#555555",
      labelTextStyle: { fontSize: 10, color: "#888" },
    }));
  }, [nav.period, weekDailyData]);

  // Range daily income bar chart
  const rangeChartData = useMemo(() => {
    if (nav.period !== "range" || rangeDailyData.length === 0) return [];
    return rangeDailyData.map((d) => ({
      value: d.income,
      label: d.label,
      frontColor: d.income > 0 ? "#22c55e" : "#555555",
      labelTextStyle: { fontSize: 9, color: "#888" },
    }));
  }, [nav.period, rangeDailyData]);

  const hasNegativeProfit = profitTrendData.some((d) => d.value < 0);
  const hasPositiveProfit = profitTrendData.some((d) => d.value > 0);
  const profitAbsMax =
    profitTrendData.length > 0
      ? Math.max(
          Math.abs(Math.max(0, ...profitTrendData.map((d) => d.value))),
          Math.abs(Math.min(0, ...profitTrendData.map((d) => d.value))),
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
                <Text fontSize="$4" fontWeight="600" color="$green10">
                  +${fmtMoney(salesTotal)}
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
                    -${fmtMoney(purchaseMerchandise)}
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
                    -${fmtMoney(purchTransport)}
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
                    -${fmtMoney(ec.total)}
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
                <Text fontSize="$4" fontWeight="bold" color="$red10">
                  -${fmtMoney(totalEgresos)}
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
                  fontSize="$6"
                  fontWeight="bold"
                  color={profit >= 0 ? "$green10" : "$red10"}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  flex={1}
                  text="right"
                  ml="$2"
                >
                  {profit >= 0 ? "+" : "-"}${fmtMoney(Math.abs(profit))}
                </Text>
              </XStack>
            </YStack>
          </Card>

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
                <AdminBarChart data={hourlyChartData} />
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
                <AdminBarChart data={weekChartData} />
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
                <AdminBarChart data={rangeChartData} />
              </YStack>
            </Card>
          )}

          {/* Yearly trends — show for month and year */}
          {(nav.period === "month" || nav.period === "year") && (
            <>
              <Text fontSize="$5" fontWeight="bold" color="$color" mt="$2">
                {nav.period === "year"
                  ? `Tendencias ${nav.selectedYear}`
                  : `Tendencias anuales ${nav.selectedMonth.slice(0, 4)}`}
              </Text>

              {/* Income vs Outflow bar chart */}
              {groupedBarData.length > 0 && (
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
                    <AdminBarChart data={groupedBarData} showLine={false} />
                  </YStack>
                </Card>
              )}

              {/* Monthly profit trend */}
              {profitTrendData.length > 0 && (
                <Card
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 14 }}
                  p="$4"
                >
                  <YStack gap="$2">
                    <Text fontSize="$3" fontWeight="600" color="$color10">
                      Ganancia/Pérdida por mes
                    </Text>
                    <AdminBarChart
                      data={profitTrendData}
                      stepValue={profitStep}
                      noOfSections={profitSectionsAbove}
                      mostNegativeValue={
                        hasNegativeProfit
                          ? -(profitStep * profitSectionsBelow)
                          : undefined
                      }
                      xAxisThickness={1}
                      xAxisColor="#555"
                    />
                  </YStack>
                </Card>
              )}
            </>
          )}

          {/* Period-aware summary table */}
          {nav.period === "day" &&
            hourlySales.some((h) => h.total > 0 || h.tickets > 0) && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack p="$4" pb="$2">
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    Desglose por hora
                  </Text>
                </YStack>
                <XStack px="$4" py="$2" bg="$color2">
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                  >
                    Hora
                  </Text>
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color="$green10"
                    style={{ width: 70, textAlign: "right" }}
                  >
                    Ventas
                  </Text>
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color="$blue10"
                    style={{ width: 50, textAlign: "right" }}
                  >
                    Tickets
                  </Text>
                </XStack>
                {hourlySales
                  .filter((h) => h.total > 0 || h.tickets > 0)
                  .map((h) => (
                    <YStack key={h.hour}>
                      <Separator />
                      <XStack px="$4" py="$2" style={{ alignItems: "center" }}>
                        <Text flex={1} fontSize="$3" color="$color">
                          {h.hour}:00
                        </Text>
                        <Text
                          fontSize="$3"
                          color="$green10"
                          style={{ width: 70, textAlign: "right" }}
                        >
                          ${fmtMoney(h.total)}
                        </Text>
                        <Text
                          fontSize="$3"
                          color="$blue10"
                          style={{ width: 50, textAlign: "right" }}
                        >
                          {h.tickets}
                        </Text>
                      </XStack>
                    </YStack>
                  ))}
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
                  Desglose semanal
                </Text>
              </YStack>
              <XStack px="$4" py="$2" bg="$color2">
                <Text flex={1} fontSize="$2" fontWeight="600" color="$color10">
                  Día
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
              {weekDailyData.map((d, idx) => (
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

          {(nav.period === "month" || nav.period === "year") &&
            yearlyTrendData.length > 0 && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack p="$4" pb="$2">
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    {nav.period === "year"
                      ? `Resumen anual ${nav.selectedYear}`
                      : `Resumen mensual ${nav.selectedMonth.slice(0, 4)}`}
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
        </YStack>
      </ScrollView>
    </>
  );
}
