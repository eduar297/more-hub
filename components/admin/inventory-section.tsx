import {
    CalendarSheet,
    DateNavigator,
    PeriodTabs,
    type DateRange,
    type Period,
} from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { StockRow } from "@/components/admin/stock-row";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import {
    currentYear,
    currentYearMonth,
    dayLabel,
    fmtMoney,
    monthLabel,
    rangeLabel,
    shiftDay,
    shiftMonth,
    todayISO,
} from "@/utils/format";
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowUpFromLine,
    DollarSign,
    Package,
    PackageX,
    Ruler,
    Tag,
    TrendingDown,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, ScrollView } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

const SCREEN_W = Dimensions.get("window").width;

const CAT_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ec4899",
  "#eab308",
  "#06b6d4",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

export function InventorySection() {
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();
  const purchaseRepo = usePurchaseRepository();
  const ticketRepo = useTicketRepository();

  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: todayISO(),
    to: todayISO(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Movement data for selected period
  const [periodSales, setPeriodSales] = useState(0);
  const [periodPurchases, setPeriodPurchases] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, units, cats] = await Promise.all([
        productRepo.findAll(),
        unitRepo.findAll(),
        unitRepo.findAllCategories(),
      ]);
      setAllProducts(prods);
      setAllUnits(units);
      setAllCategories(cats);

      // Load period movement data
      if (period === "day") {
        const [daySumm, dayPurch] = await Promise.all([
          ticketRepo.daySummary(selectedDay),
          purchaseRepo.daySummary(selectedDay),
        ]);
        setPeriodSales(daySumm.totalSales);
        setPeriodPurchases(dayPurch.totalSpent);
      } else if (period === "week" || period === "month") {
        const [monthSumm, monthPurch] = await Promise.all([
          ticketRepo.monthlySummary(selectedMonth),
          purchaseRepo.monthlySummary(selectedMonth),
        ]);
        setPeriodSales(monthSumm.totalSales);
        setPeriodPurchases(monthPurch.totalSpent);
      } else if (period === "year") {
        const [yearSales, yearPurch] = await Promise.all([
          ticketRepo.monthlySalesForYear(selectedYear),
          purchaseRepo.monthlyTotalsForYear(selectedYear),
        ]);
        setPeriodSales(yearSales.reduce((s, y) => s + y.total, 0));
        setPeriodPurchases(yearPurch.reduce((s, y) => s + y.total, 0));
      } else {
        // range
        const [rangeTickets, rangePurch] = await Promise.all([
          ticketRepo.findByDateRange(dateRange.from, dateRange.to),
          purchaseRepo.rangeSummary(dateRange.from, dateRange.to),
        ]);
        setPeriodSales(rangeTickets.reduce((s, t) => s + t.total, 0));
        setPeriodPurchases(rangePurch.totalSpent);
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
    productRepo,
    unitRepo,
    purchaseRepo,
    ticketRepo,
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
        .slice(0, 10),
    [allProducts],
  );

  const bottomStocked = useMemo(
    () =>
      allProducts
        .filter((p) => p.stockBaseQty > 0)
        .sort((a, b) => a.stockBaseQty - b.stockBaseQty)
        .slice(0, 10),
    [allProducts],
  );

  const categoryStats = useMemo(() => {
    const countMap = new Map<number, number>();
    const valueMap = new Map<number, number>();
    for (const p of allProducts) {
      const catId = unitMap.get(p.baseUnitId)?.categoryId ?? -1;
      countMap.set(catId, (countMap.get(catId) ?? 0) + 1);
      valueMap.set(
        catId,
        (valueMap.get(catId) ?? 0) + p.pricePerBaseUnit * p.stockBaseQty,
      );
    }
    return allCategories
      .map((c, idx) => ({
        category: c,
        count: countMap.get(c.id) ?? 0,
        value: valueMap.get(c.id) ?? 0,
        color: CAT_COLORS[idx % CAT_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [allProducts, allCategories, unitMap]);

  const categoryPieData = useMemo(
    () =>
      categoryStats
        .filter((c) => c.value > 0)
        .map((c) => ({ value: c.value, color: c.color })),
    [categoryStats],
  );

  const topValueProducts = useMemo(
    () =>
      [...allProducts]
        .map((p) => ({
          ...p,
          stockValue: p.pricePerBaseUnit * p.stockBaseQty,
        }))
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10),
    [allProducts],
  );

  const stockBarData = useMemo(
    () =>
      topValueProducts.map((p) => ({
        value: p.stockValue,
        label: p.name.slice(0, 6),
        frontColor: "#3b82f6",
        labelTextStyle: { fontSize: 7, color: "#888" },
      })),
    [topValueProducts],
  );

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
          {/* Movement KPIs */}
          <XStack gap="$3">
            <StatCard
              label="Compras"
              value={`$${fmtMoney(periodPurchases)}`}
              color="$blue10"
              icon={<ArrowDownToLine size={16} color="$blue10" />}
            />
            <StatCard
              label="Ventas"
              value={`$${fmtMoney(periodSales)}`}
              color="$green10"
              icon={<ArrowUpFromLine size={16} color="$green10" />}
            />
          </XStack>

          {/* KPI Row 1 */}
          <XStack gap="$3">
            <StatCard
              label="Productos"
              value={allProducts.length}
              color="$blue10"
              icon={<Package size={16} color="$blue10" />}
            />
            <StatCard
              label="Valor inv."
              value={`$${fmtMoney(inventoryValue)}`}
              color="$green10"
              icon={<DollarSign size={16} color="$green10" />}
            />
            <StatCard
              label="Categorías"
              value={allCategories.length}
              color="$pink10"
              icon={<Tag size={16} color="$pink10" />}
            />
          </XStack>

          {/* KPI Row 2 */}
          <XStack gap="$3">
            <StatCard
              label="Sin stock"
              value={outOfStockCount}
              color={outOfStockCount > 0 ? "$red10" : "$color10"}
              icon={
                <PackageX
                  size={16}
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
                  size={16}
                  color={lowStockProducts.length > 0 ? "$orange10" : "$color8"}
                />
              }
            />
          </XStack>

          {/* Value by category (pie) */}
          {categoryPieData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$3">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <Ruler size={16} color="$pink10" />
                  <Text fontSize="$3" fontWeight="600" color="$color10">
                    Valor por categoría
                  </Text>
                </XStack>
                <XStack style={{ alignItems: "center" }} gap="$4">
                  <PieChart
                    data={categoryPieData}
                    donut
                    radius={60}
                    innerRadius={35}
                    centerLabelComponent={() => (
                      <YStack
                        style={{
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text fontSize={10} color="$color10">
                          Total
                        </Text>
                        <Text fontSize={13} fontWeight="bold" color="$color">
                          ${fmtMoney(inventoryValue)}
                        </Text>
                      </YStack>
                    )}
                    isAnimated
                    animationDuration={400}
                  />
                  <YStack gap="$1.5" flex={1}>
                    {categoryStats
                      .filter((c) => c.value > 0)
                      .map((c) => (
                        <XStack
                          key={c.category.id}
                          style={{ alignItems: "center" }}
                          gap="$2"
                        >
                          <YStack
                            width={10}
                            height={10}
                            style={{
                              borderRadius: 5,
                              backgroundColor: c.color,
                            }}
                          />
                          <Text
                            flex={1}
                            fontSize="$2"
                            color="$color10"
                            numberOfLines={1}
                          >
                            {c.category.name}
                          </Text>
                          <Text fontSize="$2" fontWeight="600" color="$color">
                            ${fmtMoney(c.value)}
                          </Text>
                        </XStack>
                      ))}
                  </YStack>
                </XStack>
              </YStack>
            </Card>
          )}

          {/* Top value products bar chart */}
          {stockBarData.length > 0 && (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              p="$4"
            >
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Top 10 por valor en stock
                </Text>
                <BarChart
                  data={stockBarData}
                  height={120}
                  barWidth={18}
                  spacing={8}
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
                      <YStack
                        width={10}
                        height={10}
                        style={{
                          borderRadius: 5,
                          backgroundColor: item.color,
                        }}
                        mr="$2"
                      />
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

          {/* All Products List */}
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <Package size={18} color="$blue10" />
              <Text fontSize="$4" fontWeight="bold" color="$color">
                Todos los productos ({allProducts.length})
              </Text>
            </XStack>
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
            >
              {allProducts.length === 0 ? (
                <YStack p="$5" style={{ alignItems: "center" }} gap="$2">
                  <Package size={40} color="$color8" />
                  <Text color="$color10">Sin productos</Text>
                </YStack>
              ) : (
                allProducts.map((p, idx) => {
                  const unit = unitMap.get(p.baseUnitId);
                  const stockColor =
                    p.stockBaseQty === 0
                      ? "$red10"
                      : p.stockBaseQty <= 5
                        ? "$orange10"
                        : "$green10";
                  return (
                    <YStack key={p.id}>
                      {idx > 0 && <Separator />}
                      <XStack
                        px="$4"
                        py="$3"
                        style={{ alignItems: "center" }}
                        gap="$3"
                      >
                        <YStack flex={1}>
                          <Text
                            fontSize="$3"
                            fontWeight="600"
                            color="$color"
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          <Text fontSize="$2" color="$color10">
                            {p.barcode} · ${fmtMoney(p.pricePerBaseUnit)}/
                            {unit?.symbol ?? "ud"}
                          </Text>
                        </YStack>
                        <YStack style={{ alignItems: "flex-end" }}>
                          <Text
                            fontSize="$4"
                            fontWeight="bold"
                            color={stockColor as any}
                          >
                            {p.stockBaseQty} {unit?.symbol ?? "uds"}
                          </Text>
                          <Text fontSize="$1" color="$color10">
                            ${fmtMoney(p.pricePerBaseUnit * p.stockBaseQty)}
                          </Text>
                        </YStack>
                      </XStack>
                    </YStack>
                  );
                })
              )}
            </Card>
          </YStack>
        </YStack>
      </ScrollView>

      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        mode={period}
        selectedDay={selectedDay}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        range={dateRange}
        onSelectDay={(d) => {
          setSelectedDay(d);
          setPeriod("day");
        }}
        onSelectMonth={(m) => setSelectedMonth(m)}
        onSelectYear={(y) => setSelectedYear(y)}
        onSelectRange={(r) => {
          setDateRange(r);
          setPeriod("range");
        }}
      />
    </>
  );
}
