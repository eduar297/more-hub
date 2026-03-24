import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  Package,
  PackageX,
  Ruler,
  ShoppingBag,
  Tag,
  TrendingDown,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonth(ym: string): { year: number; month: number } {
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
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function daysInMonthCount(ym: string): number {
  const { year, month } = parseYearMonth(ym);
  return new Date(year, month, 0).getDate();
}

function fmtMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 10_000) return (abs / 1_000).toFixed(1) + "k";
  return abs.toFixed(2);
}

// ── Mini Bar Chart (daily sales) ──────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;

function DailySalesChart({
  data,
  days,
}: {
  data: { day: number; total: number }[];
  days: number;
}) {
  const dataMap = new Map(data.map((d) => [d.day, d.total]));
  const chartW = SCREEN_W - 80;
  const barW = Math.max(3, Math.min(14, chartW / days / 1.6));
  const gap = Math.max(1, Math.min(4, chartW / days / 4));

  const barData = Array.from({ length: days }, (_, i) => ({
    value: dataMap.get(i + 1) ?? 0,
    label: i === 0 || (i + 1) % 5 === 0 || i === days - 1 ? String(i + 1) : "",
    frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#22c55e" : "#555555",
    labelTextStyle: { fontSize: 8, color: "#888" },
  }));

  return (
    <BarChart
      data={barData}
      height={110}
      barWidth={barW}
      spacing={gap}
      noOfSections={3}
      hideRules
      yAxisTextStyle={{ fontSize: 9, color: "#888" }}
      yAxisThickness={0}
      xAxisThickness={0}
      isAnimated
      animationDuration={400}
      barBorderRadius={2}
    />
  );
}

// ── Pie chart (expense breakdown) ─────────────────────────────────────────────

function ExpenseBreakdownChart({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0);

  if (items.length === 0) {
    return (
      <YStack py="$3" style={{ alignItems: "center" }}>
        <Text color="$color8" fontSize="$3">
          Sin egresos este mes
        </Text>
      </YStack>
    );
  }

  const pieData = items.map((item) => ({
    value: item.value,
    color: item.color,
  }));

  return (
    <YStack gap="$4">
      <YStack style={{ alignItems: "center" }}>
        <PieChart
          data={pieData}
          donut
          radius={80}
          innerRadius={48}
          centerLabelComponent={() => (
            <YStack style={{ alignItems: "center", justifyContent: "center" }}>
              <Text fontSize={11} color="$color10">
                Total
              </Text>
              <Text fontSize={16} fontWeight="bold" color="$color">
                ${fmtMoney(total)}
              </Text>
            </YStack>
          )}
          isAnimated
          animationDuration={400}
        />
      </YStack>
      <YStack gap="$2">
        {items.map((item, idx) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
          return (
            <XStack key={idx} style={{ alignItems: "center" }} gap="$2">
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
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card
      flex={1}
      p="$3"
      bg="$color1"
      borderWidth={1}
      borderColor="$borderColor"
      style={{ borderRadius: 12 }}
    >
      <YStack gap="$1">
        {icon}
        <Text
          fontSize="$6"
          fontWeight="bold"
          color={color as any}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text fontSize="$2" color="$color10" numberOfLines={1}>
          {label}
        </Text>
      </YStack>
    </Card>
  );
}

// ── Stock row ─────────────────────────────────────────────────────────────────

function StockRow({
  product,
  unit,
  rank,
  lowlight,
}: {
  product: Product;
  unit: Unit | undefined;
  rank?: number;
  lowlight?: boolean;
}) {
  const stockColor =
    product.stockBaseQty === 0
      ? "$red10"
      : product.stockBaseQty <= 5
        ? "$orange10"
        : "$green10";

  return (
    <XStack px="$4" py="$3" style={{ alignItems: "center" }} gap="$3">
      {rank !== undefined && (
        <Text
          fontSize="$3"
          color="$color8"
          style={{ width: 20, textAlign: "center" }}
        >
          {rank}
        </Text>
      )}
      <YStack flex={1}>
        <Text
          fontSize="$3"
          fontWeight="600"
          color={lowlight ? "$orange10" : "$color"}
          numberOfLines={1}
        >
          {product.name}
        </Text>
        <Text fontSize="$2" color="$color10">
          {product.barcode}
        </Text>
      </YStack>
      <Text fontSize="$4" fontWeight="bold" color={stockColor as any}>
        {product.stockBaseQty} {unit?.symbol ?? "uds"}
      </Text>
    </XStack>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();
  const ticketRepo = useTicketRepository();
  const purchaseRepo = usePurchaseRepository();
  const expenseRepo = useExpenseRepository();

  // ── Date filter ───────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const isCurrentMonth = selectedMonth === currentYearMonth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [todaySales, setTodaySales] = useState({
    totalSales: 0,
    ticketCount: 0,
  });
  const [monthlySales, setMonthlySales] = useState({
    totalSales: 0,
    ticketCount: 0,
  });
  const [dailySalesData, setDailySalesData] = useState<
    { day: number; total: number }[]
  >([]);
  const [topProductsData, setTopProductsData] = useState<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  >([]);
  const [monthlyPurchases, setMonthlyPurchases] = useState({
    totalSpent: 0,
    totalTransport: 0,
    purchaseCount: 0,
  });
  const [monthlyExpenseTotal, setMonthlyExpenseTotal] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<
    { category: ExpenseCategory; total: number }[]
  >([]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadStats = useCallback(
    async (month: string) => {
      setLoading(true);
      try {
        const [
          prods,
          units,
          cats,
          todayS,
          monthS,
          daily,
          topP,
          monthP,
          monthE,
          expByCat,
        ] = await Promise.all([
          productRepo.findAll(),
          unitRepo.findAll(),
          unitRepo.findAllCategories(),
          ticketRepo.todaySummary(),
          ticketRepo.monthlySummary(month),
          ticketRepo.dailySales(month),
          ticketRepo.topProducts(month),
          purchaseRepo.monthlySummary(month),
          expenseRepo.monthlyTotal(month),
          expenseRepo.monthlySummaryByCategory(month),
        ]);
        setAllProducts(prods);
        setAllUnits(units);
        setAllCategories(cats);
        setTodaySales(todayS);
        setMonthlySales(monthS);
        setDailySalesData(daily);
        setTopProductsData(topP);
        setMonthlyPurchases(monthP);
        setMonthlyExpenseTotal(monthE);
        setExpensesByCategory(expByCat);
      } finally {
        setLoading(false);
      }
    },
    [productRepo, unitRepo, ticketRepo, purchaseRepo, expenseRepo],
  );

  useFocusEffect(
    useCallback(() => {
      loadStats(selectedMonth);
    }, [loadStats, selectedMonth]),
  );

  // ── Month navigation ──────────────────────────────────────────────────────
  const goPrevMonth = () => setSelectedMonth((m) => shiftMonth(m, -1));
  const goNextMonth = () => {
    const next = shiftMonth(selectedMonth, 1);
    if (next <= currentYearMonth()) setSelectedMonth(next);
  };

  // ── Derived analytics ────────────────────────────────────────────────────
  const unitMap = useMemo(
    () => new Map(allUnits.map((u) => [u.id, u])),
    [allUnits],
  );

  const inventoryValue = useMemo(
    () =>
      allProducts.reduce(
        (sum, p) => sum + p.pricePerBaseUnit * p.stockBaseQty,
        0,
      ),
    [allProducts],
  );

  const outOfStockCount = useMemo(
    () => allProducts.filter((p) => p.stockBaseQty === 0).length,
    [allProducts],
  );

  const lowStockProducts = useMemo(
    () =>
      allProducts
        .filter((p) => p.stockBaseQty > 0 && p.stockBaseQty <= 5)
        .sort((a, b) => a.stockBaseQty - b.stockBaseQty),
    [allProducts],
  );

  const topStocked = useMemo(
    () =>
      [...allProducts]
        .sort((a, b) => b.stockBaseQty - a.stockBaseQty)
        .slice(0, 5),
    [allProducts],
  );

  const bottomStocked = useMemo(
    () =>
      allProducts
        .filter((p) => p.stockBaseQty > 0)
        .sort((a, b) => a.stockBaseQty - b.stockBaseQty)
        .slice(0, 5),
    [allProducts],
  );

  const categoryStats = useMemo(() => {
    const countMap = new Map<number, number>();
    for (const p of allProducts) {
      const catId = unitMap.get(p.baseUnitId)?.categoryId ?? -1;
      countMap.set(catId, (countMap.get(catId) ?? 0) + 1);
    }
    return allCategories
      .map((c) => ({ category: c, count: countMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [allProducts, allCategories, unitMap]);

  // ── Financial derived ──────────────────────────────────────────────────────
  const purchaseMerchandise =
    monthlyPurchases.totalSpent - monthlyPurchases.totalTransport;
  const totalEgresos = monthlyPurchases.totalSpent + monthlyExpenseTotal;
  const monthlyProfit = monthlySales.totalSales - totalEgresos;

  const egresoItems = useMemo(() => {
    const items: { label: string; value: number; color: string }[] = [];
    if (purchaseMerchandise > 0)
      items.push({
        label: "Compras de mercancía",
        value: purchaseMerchandise,
        color: "#3b82f6",
      });
    if (monthlyPurchases.totalTransport > 0)
      items.push({
        label: "Transporte (compras)",
        value: monthlyPurchases.totalTransport,
        color: "#a855f7",
      });
    const catColors: Record<string, string> = {
      TRANSPORT: "#f97316",
      ELECTRICITY: "#eab308",
      RENT: "#ec4899",
      REPAIRS: "#ef4444",
      SUPPLIES: "#22c55e",
      OTHER: "#888888",
    };
    for (const ec of expensesByCategory) {
      items.push({
        label: EXPENSE_CATEGORIES[ec.category],
        value: ec.total,
        color: catColors[ec.category] ?? "$color8",
      });
    }
    return items;
  }, [
    purchaseMerchandise,
    monthlyPurchases.totalTransport,
    expensesByCategory,
  ]);

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <YStack
        flex={1}
        bg="$background"
        style={{ justifyContent: "center", alignItems: "center" }}
        gap="$3"
      >
        <Spinner size="large" color="$blue10" />
        <Text color="$color10">Cargando datos…</Text>
      </YStack>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <YStack flex={1} bg="$background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack bg="$background" p="$4" gap="$4" pb="$10">
          {/* ── Header ──────────────────────────────────────────────── */}
          <XStack gap="$3" mt="$2" style={{ alignItems: "center" }}>
            <LayoutDashboard size={26} color="$blue10" />
            <YStack flex={1}>
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Dashboard
              </Text>
              <Text fontSize="$3" color="$color10">
                Resumen financiero e inventario
              </Text>
            </YStack>
          </XStack>

          {/* ── Month Selector ──────────────────────────────────────── */}
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

          {/* ── Sales Overview ──────────────────────────────────────── */}
          <Card
            bg="$color1"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <DollarSign size={18} color="$green10" />
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Ventas
                </Text>
              </XStack>
              <XStack gap="$3">
                {isCurrentMonth && (
                  <>
                    <YStack flex={1}>
                      <Text fontSize="$2" color="$color10" mb="$0.5">
                        Hoy
                      </Text>
                      <Text fontSize="$7" fontWeight="bold" color="$green10">
                        ${fmtMoney(todaySales.totalSales)}
                      </Text>
                      <Text fontSize="$2" color="$color10">
                        {todaySales.ticketCount}{" "}
                        {todaySales.ticketCount === 1 ? "ticket" : "tickets"}
                      </Text>
                    </YStack>
                    <Separator vertical />
                  </>
                )}
                <YStack flex={1}>
                  <Text fontSize="$2" color="$color10" mb="$0.5">
                    {isCurrentMonth ? "Este mes" : monthLabel(selectedMonth)}
                  </Text>
                  <Text
                    fontSize={isCurrentMonth ? "$5" : "$7"}
                    fontWeight="bold"
                    color="$green10"
                  >
                    ${fmtMoney(monthlySales.totalSales)}
                  </Text>
                  <Text fontSize="$2" color="$color10">
                    {monthlySales.ticketCount} tickets
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          </Card>

          {/* ── Daily Sales Chart ───────────────────────────────────── */}
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
                  Ventas diarias
                </Text>
              </XStack>
              {dailySalesData.length > 0 ? (
                <DailySalesChart
                  data={dailySalesData}
                  days={daysInMonthCount(selectedMonth)}
                />
              ) : (
                <YStack py="$4" style={{ alignItems: "center" }}>
                  <Text color="$color8" fontSize="$3">
                    Sin ventas en este período
                  </Text>
                </YStack>
              )}
            </YStack>
          </Card>

          {/* ── Balance ─────────────────────────────────────────────── */}
          <Card
            bg={monthlyProfit >= 0 ? "$green2" : "$red2"}
            borderWidth={1}
            borderColor={monthlyProfit >= 0 ? "$green6" : "$red6"}
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <TrendingUp
                  size={18}
                  color={monthlyProfit >= 0 ? "$green10" : "$red10"}
                />
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Balance del mes
                </Text>
              </XStack>

              {/* Income */}
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
                  +${fmtMoney(monthlySales.totalSales)}
                </Text>
              </XStack>

              {/* Purchases */}
              {monthlyPurchases.totalSpent > 0 && (
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
                    -${fmtMoney(monthlyPurchases.totalSpent)}
                  </Text>
                </XStack>
              )}

              {/* Expenses */}
              {monthlyExpenseTotal > 0 && (
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
                    -${fmtMoney(monthlyExpenseTotal)}
                  </Text>
                </XStack>
              )}

              <Separator />

              {/* Profit/Loss */}
              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  {monthlyProfit >= 0 ? "Ganancia" : "Pérdida"}
                </Text>
                <Text
                  fontSize="$7"
                  fontWeight="bold"
                  color={monthlyProfit >= 0 ? "$green10" : "$red10"}
                >
                  {monthlyProfit >= 0 ? "+" : "-"}$
                  {fmtMoney(Math.abs(monthlyProfit))}
                </Text>
              </XStack>
            </YStack>
          </Card>

          {/* ── Expense Breakdown ───────────────────────────────────── */}
          <Card
            bg="$color1"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <ShoppingBag size={18} color="$red10" />
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Desglose de egresos
                </Text>
                {totalEgresos > 0 && (
                  <Text fontSize="$3" color="$color10" ml="auto">
                    Total: ${fmtMoney(totalEgresos)}
                  </Text>
                )}
              </XStack>
              <ExpenseBreakdownChart items={egresoItems} />
            </YStack>
          </Card>

          {/* ── Top Products ────────────────────────────────────────── */}
          {topProductsData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              <YStack p="$4" pb="$2" gap="$1">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <TrendingUp size={18} color="$yellow10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    Más vendidos del mes
                  </Text>
                </XStack>
              </YStack>
              {topProductsData.map((tp, idx) => (
                <YStack key={tp.productId}>
                  {idx > 0 && <Separator />}
                  <XStack
                    px="$4"
                    py="$3"
                    style={{ alignItems: "center" }}
                    gap="$3"
                  >
                    <YStack
                      width={28}
                      height={28}
                      bg={
                        idx === 0
                          ? "$yellow4"
                          : idx === 1
                            ? "$color3"
                            : "$color2"
                      }
                      style={{
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        fontSize="$2"
                        fontWeight="bold"
                        color={idx === 0 ? "$yellow10" : "$color10"}
                      >
                        {idx + 1}
                      </Text>
                    </YStack>
                    <YStack flex={1}>
                      <Text
                        fontSize="$3"
                        fontWeight="600"
                        color="$color"
                        numberOfLines={1}
                      >
                        {tp.productName}
                      </Text>
                      <Text fontSize="$2" color="$color10">
                        {tp.totalQty}{" "}
                        {tp.totalQty === 1 ? "unidad" : "unidades"}
                      </Text>
                    </YStack>
                    <Text fontSize="$4" fontWeight="bold" color="$green10">
                      ${fmtMoney(tp.totalRevenue)}
                    </Text>
                  </XStack>
                </YStack>
              ))}
            </Card>
          )}

          {/* ── INVENTORY SECTION ───────────────────────────────────── */}
          <Separator />

          <XStack gap="$2" style={{ alignItems: "center" }}>
            <Package size={20} color="$blue10" />
            <Text fontSize="$5" fontWeight="bold" color="$color">
              Inventario
            </Text>
          </XStack>

          {/* Quick stats row 1 */}
          <XStack gap="$3">
            <StatCard
              label="Productos"
              value={allProducts.length}
              color="$blue10"
              icon={<Package size={18} color="$blue10" />}
            />
            <StatCard
              label="Valor inv."
              value={`$${fmtMoney(inventoryValue)}`}
              color="$green10"
              icon={<DollarSign size={18} color="$green10" />}
            />
            <StatCard
              label="Categorías"
              value={allCategories.length}
              color="$pink10"
              icon={<Tag size={18} color="$pink10" />}
            />
          </XStack>

          {/* Quick stats row 2 */}
          <XStack gap="$3">
            <StatCard
              label="Sin stock"
              value={outOfStockCount}
              color={outOfStockCount > 0 ? "$red10" : "$color10"}
              icon={
                <PackageX
                  size={18}
                  color={outOfStockCount > 0 ? "$red10" : "$color8"}
                />
              }
            />
            <StatCard
              label="Stock bajo"
              value={lowStockProducts.length}
              color={lowStockProducts.length > 0 ? "$orange10" : "$color10"}
              icon={
                <AlertTriangle
                  size={18}
                  color={lowStockProducts.length > 0 ? "$orange10" : "$color8"}
                />
              }
            />
          </XStack>

          {/* Stock alerts */}
          {(lowStockProducts.length > 0 || outOfStockCount > 0) && (
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <AlertTriangle size={18} color="$orange10" />
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Alertas de stock
                </Text>
              </XStack>
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                {allProducts
                  .filter((p) => p.stockBaseQty <= 5)
                  .sort((a, b) => a.stockBaseQty - b.stockBaseQty)
                  .map((p, idx) => (
                    <YStack key={p.id}>
                      {idx > 0 && <Separator />}
                      <StockRow
                        product={p}
                        unit={unitMap.get(p.baseUnitId)}
                        lowlight
                      />
                    </YStack>
                  ))}
              </Card>
            </YStack>
          )}

          {/* Top stocked */}
          {topStocked.length > 0 && (
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <TrendingUp size={18} color="$green10" />
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Mayor stock
                </Text>
              </XStack>
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                {topStocked.map((p, idx) => (
                  <YStack key={p.id}>
                    {idx > 0 && <Separator />}
                    <StockRow
                      product={p}
                      unit={unitMap.get(p.baseUnitId)}
                      rank={idx + 1}
                    />
                  </YStack>
                ))}
              </Card>
            </YStack>
          )}

          {/* Bottom stocked */}
          {bottomStocked.length > 0 && (
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <TrendingDown size={18} color="$orange10" />
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Menor stock
                </Text>
              </XStack>
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                {bottomStocked.map((p, idx) => (
                  <YStack key={p.id}>
                    {idx > 0 && <Separator />}
                    <StockRow
                      product={p}
                      unit={unitMap.get(p.baseUnitId)}
                      rank={idx + 1}
                    />
                  </YStack>
                ))}
              </Card>
            </YStack>
          )}

          {/* Products by category */}
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <Ruler size={18} color="$pink10" />
              <Text fontSize="$4" fontWeight="bold" color="$color">
                Productos por categoría
              </Text>
            </XStack>
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              {categoryStats.length === 0 ? (
                <YStack p="$5" style={{ alignItems: "center" }} gap="$2">
                  <Package size={40} color="$color8" />
                  <Text color="$color10">Sin datos</Text>
                </YStack>
              ) : (
                categoryStats.map((item, idx) => (
                  <YStack key={item.category.id}>
                    {idx > 0 && <Separator />}
                    <XStack px="$4" py="$3" style={{ alignItems: "center" }}>
                      <Text flex={1} fontSize="$4" color="$color">
                        {item.category.name}
                      </Text>
                      <Text
                        fontSize="$4"
                        fontWeight="bold"
                        color={item.count > 0 ? "$blue10" : "$color8"}
                      >
                        {item.count}
                      </Text>
                    </XStack>
                  </YStack>
                ))
              )}
            </Card>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
