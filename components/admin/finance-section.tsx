import {
    CalendarSheet,
    DateNavigator,
    PeriodTabs,
    type DateRange,
    type Period,
} from "@/components/admin/period-selector";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";
import {
    currentYear,
    currentYearMonth,
    dayLabel,
    fmtMoney,
    MONTH_NAMES_SHORT,
    monthLabel,
    parseYearMonth,
    rangeLabel,
    shiftDay,
    shiftMonth,
    todayISO,
} from "@/utils/format";
import { ShoppingBag, TrendingDown, TrendingUp } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, ScrollView } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

const SCREEN_W = Dimensions.get("window").width;

const CAT_EXPENSE_COLORS: Record<string, string> = {
  TRANSPORT: "#f97316",
  ELECTRICITY: "#eab308",
  RENT: "#ec4899",
  REPAIRS: "#ef4444",
  SUPPLIES: "#22c55e",
  OTHER: "#888888",
};

export function FinanceSection() {
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (period === "day") {
        const [daySumm, dayP, dayE, dayExpCat] = await Promise.all([
          ticketRepo.daySummary(selectedDay),
          purchaseRepo.daySummary(selectedDay),
          expenseRepo.dayTotal(selectedDay),
          expenseRepo.daySummaryByCategory(selectedDay),
        ]);
        setSalesTotal(daySumm.totalSales);
        setSalesTickets(daySumm.ticketCount);
        setPurchTotal(dayP.totalSpent);
        setPurchTransport(dayP.totalTransport);
        setExpenseTotal(dayE);
        setExpensesByCategory(dayExpCat);
      } else if (period === "week" || period === "month") {
        const [monthS, monthP, monthE, expByCat] = await Promise.all([
          ticketRepo.monthlySummary(selectedMonth),
          purchaseRepo.monthlySummary(selectedMonth),
          expenseRepo.monthlyTotal(selectedMonth),
          expenseRepo.monthlySummaryByCategory(selectedMonth),
        ]);
        setSalesTotal(monthS.totalSales);
        setSalesTickets(monthS.ticketCount);
        setPurchTotal(monthP.totalSpent);
        setPurchTransport(monthP.totalTransport);
        setExpenseTotal(monthE);
        setExpensesByCategory(expByCat);
      } else if (period === "year") {
        const [ySales, yPurch, yExp] = await Promise.all([
          ticketRepo.monthlySalesForYear(selectedYear),
          purchaseRepo.monthlyTotalsForYear(selectedYear),
          expenseRepo.monthlyTotalsForYear(selectedYear),
        ]);
        setYearSalesTrend(ySales);
        setYearPurchaseTrend(yPurch);
        setYearExpenseTrend(yExp);
        setSalesTotal(ySales.reduce((s, y) => s + y.total, 0));
        setSalesTickets(ySales.reduce((s, y) => s + y.tickets, 0));
        setPurchTotal(yPurch.reduce((s, y) => s + y.total, 0));
        setPurchTransport(yPurch.reduce((s, y) => s + y.transport, 0));
        setExpenseTotal(yExp.reduce((s, y) => s + y.total, 0));
        setExpensesByCategory([]);
      } else {
        // range
        const [rangeTickets, rangePurch, rangeExp, rangeExpCat] =
          await Promise.all([
            ticketRepo.findByDateRange(dateRange.from, dateRange.to),
            purchaseRepo.rangeSummary(dateRange.from, dateRange.to),
            expenseRepo.rangeTotal(dateRange.from, dateRange.to),
            expenseRepo.rangeSummaryByCategory(dateRange.from, dateRange.to),
          ]);
        setSalesTotal(rangeTickets.reduce((s, t) => s + t.total, 0));
        setSalesTickets(rangeTickets.length);
        setPurchTotal(rangePurch.totalSpent);
        setPurchTransport(rangePurch.totalTransport);
        setExpenseTotal(rangeExp);
        setExpensesByCategory(rangeExpCat);
      }

      // Always load yearly trends for month and week views
      if (period === "month" || period === "week") {
        const yr = parseYearMonth(selectedMonth).year;
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
    period,
    selectedDay,
    selectedMonth,
    selectedYear,
    dateRange,
    ticketRepo,
    purchaseRepo,
    expenseRepo,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Navigation
  const navigateBack = () => {
    if (period === "day") setSelectedDay((d) => shiftDay(d, -1));
    else if (period === "month" || period === "week") {
      const newMonth = shiftMonth(selectedMonth, -1);
      setSelectedMonth(newMonth);
      setSelectedYear(String(parseYearMonth(newMonth).year));
    } else if (period === "year") setSelectedYear((y) => String(Number(y) - 1));
  };
  const navigateForward = () => {
    if (period === "day") {
      const next = shiftDay(selectedDay, 1);
      if (next <= todayISO()) setSelectedDay(next);
    } else if (period === "month" || period === "week") {
      const newMonth = shiftMonth(selectedMonth, 1);
      if (newMonth <= currentYearMonth()) {
        setSelectedMonth(newMonth);
        setSelectedYear(String(parseYearMonth(newMonth).year));
      }
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

  // Derived
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
        color: CAT_EXPENSE_COLORS[ec.category] ?? "#888",
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
    }[] = [];
    for (const item of yearlyTrendData) {
      data.push({
        value: item.income,
        label: MONTH_NAMES_SHORT[item.month - 1],
        frontColor: "#22c55e",
        spacing: 2,
        labelTextStyle: { fontSize: 7, color: "#888" },
      });
      data.push({
        value: item.outflow,
        frontColor: "#ef4444",
        spacing: 10,
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
        labelTextStyle: { fontSize: 7, color: "#888" },
      })),
    [yearlyTrendData],
  );

  const hasNegativeProfit = profitTrendData.some((d) => d.value < 0);

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
                  fontSize="$7"
                  fontWeight="bold"
                  color={profit >= 0 ? "$green10" : "$red10"}
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

          {/* Yearly trends — show for month, week, year */}
          {period !== "day" && period !== "range" && (
            <>
              <Text fontSize="$5" fontWeight="bold" color="$color" mt="$2">
                Tendencias{" "}
                {period === "year"
                  ? selectedYear
                  : String(parseYearMonth(selectedMonth).year)}
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
                    <BarChart
                      data={groupedBarData}
                      height={140}
                      barWidth={Math.max(
                        8,
                        Math.min(
                          16,
                          (SCREEN_W - 100) / yearlyTrendData.length / 3,
                        ),
                      )}
                      spacing={2}
                      noOfSections={3}
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
                    <BarChart
                      data={profitTrendData}
                      height={130}
                      barWidth={Math.max(
                        12,
                        Math.min(
                          28,
                          (SCREEN_W - 100) / profitTrendData.length / 1.5,
                        ),
                      )}
                      spacing={Math.max(
                        4,
                        Math.min(
                          10,
                          (SCREEN_W - 100) / profitTrendData.length / 3,
                        ),
                      )}
                      noOfSections={3}
                      noOfSectionsBelowXAxis={hasNegativeProfit ? 2 : 0}
                      yAxisTextStyle={{ fontSize: 9, color: "#888" }}
                      yAxisThickness={0}
                      xAxisThickness={1}
                      xAxisColor="#555"
                      isAnimated
                      animationDuration={400}
                      barBorderRadius={3}
                    />
                  </YStack>
                </Card>
              )}

              {/* Monthly breakdown table */}
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack p="$4" pb="$2">
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    Resumen mensual{" "}
                    {period === "year"
                      ? selectedYear
                      : String(parseYearMonth(selectedMonth).year)}
                  </Text>
                </YStack>
                <XStack px="$4" py="$2" bg="$color2">
                  <Text
                    flex={1}
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                  >
                    Mes
                  </Text>
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color="$green10"
                    style={{ width: 70, textAlign: "right" }}
                  >
                    Ingreso
                  </Text>
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color="$red10"
                    style={{ width: 70, textAlign: "right" }}
                  >
                    Egreso
                  </Text>
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color="$color"
                    style={{ width: 70, textAlign: "right" }}
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
                        <Text flex={1} fontSize="$3" color="$color">
                          {MONTH_NAMES_SHORT[item.month - 1]}
                        </Text>
                        <Text
                          fontSize="$3"
                          color="$green10"
                          style={{ width: 70, textAlign: "right" }}
                        >
                          ${fmtMoney(item.income)}
                        </Text>
                        <Text
                          fontSize="$3"
                          color="$red10"
                          style={{ width: 70, textAlign: "right" }}
                        >
                          ${fmtMoney(item.outflow)}
                        </Text>
                        <Text
                          fontSize="$3"
                          fontWeight="bold"
                          color={netResult >= 0 ? "$green10" : "$red10"}
                          style={{ width: 70, textAlign: "right" }}
                        >
                          {netResult >= 0 ? "+" : "-"}$
                          {fmtMoney(Math.abs(netResult))}
                        </Text>
                      </XStack>
                    </YStack>
                  );
                })}
              </Card>
            </>
          )}
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
