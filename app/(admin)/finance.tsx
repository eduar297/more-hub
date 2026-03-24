import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";
import {
    ChevronLeft,
    ChevronRight,
    DollarSign,
    ShoppingBag,
    TrendingDown,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, ScrollView } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import {
    Button,
    Card,
    Separator,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
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

const SCREEN_W = Dimensions.get("window").width;

function currentYear(): string {
  return String(new Date().getFullYear());
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

function shiftMonth(ym: string, delta: number): string {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][month - 1]} ${year}`;
}

function fmtMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 10_000) return (abs / 1_000).toFixed(1) + "k";
  return abs.toFixed(2);
}

const CAT_EXPENSE_COLORS: Record<string, string> = {
  TRANSPORT: "#f97316",
  ELECTRICITY: "#eab308",
  RENT: "#ec4899",
  REPAIRS: "#ef4444",
  SUPPLIES: "#22c55e",
  OTHER: "#888888",
};

// ── Finance Screen ────────────────────────────────────────────────────────────

export default function FinanceScreen() {
  const router = useRouter();
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();

  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const isCurrentMonth = selectedMonth === currentYearMonth();
  const [loading, setLoading] = useState(true);

  // Monthly data
  const [monthlySales, setMonthlySales] = useState({
    totalSales: 0,
    ticketCount: 0,
  });
  const [monthlyPurchases, setMonthlyPurchases] = useState({
    totalSpent: 0,
    totalTransport: 0,
    purchaseCount: 0,
  });
  const [monthlyExpenseTotal, setMonthlyExpenseTotal] = useState(0);
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
      const [monthS, monthP, monthE, expByCat, ySales, yPurch, yExp] =
        await Promise.all([
          ticketRepo.monthlySummary(selectedMonth),
          purchaseRepo.monthlySummary(selectedMonth),
          expenseRepo.monthlyTotal(selectedMonth),
          expenseRepo.monthlySummaryByCategory(selectedMonth),
          ticketRepo.monthlySalesForYear(selectedYear),
          purchaseRepo.monthlyTotalsForYear(selectedYear),
          expenseRepo.monthlyTotalsForYear(selectedYear),
        ]);
      setMonthlySales(monthS);
      setMonthlyPurchases(monthP);
      setMonthlyExpenseTotal(monthE);
      setExpensesByCategory(expByCat);
      setYearSalesTrend(ySales);
      setYearPurchaseTrend(yPurch);
      setYearExpenseTrend(yExp);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, ticketRepo, purchaseRepo, expenseRepo]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const goPrevMonth = () => {
    const newMonth = shiftMonth(selectedMonth, -1);
    setSelectedMonth(newMonth);
    const { year } = parseYearMonth(newMonth);
    setSelectedYear(String(year));
  };
  const goNextMonth = () => {
    const newMonth = shiftMonth(selectedMonth, 1);
    if (newMonth <= currentYearMonth()) {
      setSelectedMonth(newMonth);
      const { year } = parseYearMonth(newMonth);
      setSelectedYear(String(year));
    }
  };

  // Derived
  const purchaseMerchandise =
    monthlyPurchases.totalSpent - monthlyPurchases.totalTransport;
  const totalEgresos = monthlyPurchases.totalSpent + monthlyExpenseTotal;
  const profit = monthlySales.totalSales - totalEgresos;
  const profitMargin =
    monthlySales.totalSales > 0
      ? ((profit / monthlySales.totalSales) * 100).toFixed(1)
      : "0.0";

  // Expense breakdown for pie chart
  const egresoItems = useMemo(() => {
    const items: { label: string; value: number; color: string }[] = [];
    if (purchaseMerchandise > 0)
      items.push({
        label: "Compras",
        value: purchaseMerchandise,
        color: "#3b82f6",
      });
    if (monthlyPurchases.totalTransport > 0)
      items.push({
        label: "Transporte",
        value: monthlyPurchases.totalTransport,
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
  }, [
    purchaseMerchandise,
    monthlyPurchases.totalTransport,
    expensesByCategory,
  ]);

  const pieTotalEgresos = egresoItems.reduce((s, i) => s + i.value, 0);
  const pieData = egresoItems.map((i) => ({ value: i.value, color: i.color }));

  // Yearly trend: income vs outflow stacked bar chart
  const yearlyTrendData = useMemo(() => {
    const salesMap = new Map(yearSalesTrend.map((s) => [s.month, s.total]));
    const purchMap = new Map(yearPurchaseTrend.map((p) => [p.month, p.total]));
    const expMap = new Map(yearExpenseTrend.map((e) => [e.month, e.total]));
    return Array.from({ length: 12 }, (_, i) => {
      const income = salesMap.get(i + 1) ?? 0;
      const outflow = (purchMap.get(i + 1) ?? 0) + (expMap.get(i + 1) ?? 0);
      return { month: i + 1, income, outflow };
    });
  }, [yearSalesTrend, yearPurchaseTrend, yearExpenseTrend]);

  // For grouped bar chart: income bars (green) + outflow bars (red)
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
        label: MONTH_NAMES[item.month - 1],
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

  // Profit per month for trend
  const profitTrendData = useMemo(() => {
    return yearlyTrendData.map((item) => ({
      value: item.income - item.outflow,
      label: MONTH_NAMES[item.month - 1],
      frontColor: item.income - item.outflow >= 0 ? "#22c55e" : "#ef4444",
      labelTextStyle: { fontSize: 7, color: "#888" },
    }));
  }, [yearlyTrendData]);

  if (loading) {
    return (
      <YStack
        flex={1}
        bg="$background"
        style={{ justifyContent: "center", alignItems: "center" }}
        gap="$3"
      >
        <Spinner size="large" color="$blue10" />
        <Text color="$color10">Cargando…</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} bg="$background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack bg="$background" p="$4" gap="$4" pb="$10">
          {/* Header */}
          <XStack gap="$3" mt="$2" style={{ alignItems: "center" }}>
            <Button
              size="$3"
              chromeless
              icon={ChevronLeft}
              onPress={() => router.back()}
            />
            <DollarSign size={24} color="$green10" />
            <YStack flex={1}>
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Finanzas
              </Text>
              <Text fontSize="$3" color="$color10">
                P&L, tendencias y desglose
              </Text>
            </YStack>
          </XStack>

          {/* Month selector */}
          <Card
            bg="$color1"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 12 }}
            p="$2"
          >
            <XStack
              style={{
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Button
                size="$3"
                chromeless
                icon={ChevronLeft}
                onPress={goPrevMonth}
              />
              <Text fontSize="$5" fontWeight="bold" color="$color">
                {monthLabel(selectedMonth)}
              </Text>
              <Button
                size="$3"
                chromeless
                icon={ChevronRight}
                onPress={goNextMonth}
                disabled={isCurrentMonth}
                opacity={isCurrentMonth ? 0.3 : 1}
              />
            </XStack>
          </Card>

          {/* Full P&L card */}
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

              {/* Income */}
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
                  +${fmtMoney(monthlySales.totalSales)}
                </Text>
              </XStack>
              <Text fontSize="$2" color="$color8" ml="$4">
                {monthlySales.ticketCount} tickets
              </Text>

              <Separator />

              {/* Egresos detail */}
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

              {monthlyPurchases.totalTransport > 0 && (
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
                    -${fmtMoney(monthlyPurchases.totalTransport)}
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

              {/* Profit */}
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

          {/* Yearly trends header */}
          <Text fontSize="$5" fontWeight="bold" color="$color" mt="$2">
            Tendencias {selectedYear}
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
                  barWidth={10}
                  spacing={2}
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
                  barWidth={16}
                  spacing={6}
                  noOfSections={3}
                  hideRules
                  yAxisTextStyle={{ fontSize: 9, color: "#888" }}
                  yAxisThickness={0}
                  xAxisThickness={0}
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
                Resumen mensual {selectedYear}
              </Text>
            </YStack>
            {/* Header row */}
            <XStack px="$4" py="$2" bg="$color2">
              <Text flex={1} fontSize="$2" fontWeight="600" color="$color10">
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
                      {MONTH_NAMES[item.month - 1]}
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
        </YStack>
      </ScrollView>
    </YStack>
  );
}
