import { PeriodSelector } from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { StockRow } from "@/components/admin/stock-row";
import { ProductDetail } from "@/components/product/product-detail";
import { SearchInput } from "@/components/ui/search-input";
import { CHART_PALETTE } from "@/constants/colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import {
    fmtMoney,
    fmtMoneyFull,
    shiftDay,
    shiftMonth,
    shiftWeek,
    weekEndISO,
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
import { FlatList, Image, Pressable, ScrollView } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { Card, Separator, Sheet, Spinner, Text, XStack, YStack } from "tamagui";

export function InventorySection() {
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();
  const purchaseRepo = usePurchaseRepository();
  const ticketRepo = useTicketRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const nav = usePeriodNavigation();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // Movement data for selected period
  const [periodSales, setPeriodSales] = useState(0);
  const [periodPurchases, setPeriodPurchases] = useState(0);
  const [topMovers, setTopMovers] = useState<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  >([]);

  // Previous-period data for delta badges
  const [prevSales, setPrevSales] = useState(0);
  const [prevPurchases, setPrevPurchases] = useState(0);

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
      if (nav.period === "day") {
        const [daySumm, dayPurch, top] = await Promise.all([
          ticketRepo.daySummary(nav.selectedDay),
          purchaseRepo.daySummary(nav.selectedDay),
          ticketRepo.topProductsByRange(nav.selectedDay, nav.selectedDay, 10),
        ]);
        setPeriodSales(daySumm.totalSales);
        setPeriodPurchases(dayPurch.totalSpent);
        setTopMovers(top);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        const [wkTickets, wkPurch, top] = await Promise.all([
          ticketRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
          ticketRepo.topProductsByRange(nav.selectedWeekStart, wkEnd, 10),
        ]);
        setPeriodSales(wkTickets.reduce((s, t) => s + t.total, 0));
        setPeriodPurchases(wkPurch.totalSpent);
        setTopMovers(top);
      } else if (nav.period === "month") {
        const [monthSumm, monthPurch, top] = await Promise.all([
          ticketRepo.monthlySummary(nav.selectedMonth),
          purchaseRepo.monthlySummary(nav.selectedMonth),
          ticketRepo.topProducts(nav.selectedMonth, 10),
        ]);
        setPeriodSales(monthSumm.totalSales);
        setPeriodPurchases(monthPurch.totalSpent);
        setTopMovers(top);
      } else if (nav.period === "year") {
        const yearStart = `${nav.selectedYear}-01-01`;
        const yearEnd = `${nav.selectedYear}-12-31`;
        const [yearSales, yearPurch, top] = await Promise.all([
          ticketRepo.monthlySalesForYear(nav.selectedYear),
          purchaseRepo.monthlyTotalsForYear(nav.selectedYear),
          ticketRepo.topProductsByRange(yearStart, yearEnd, 10),
        ]);
        setPeriodSales(yearSales.reduce((s, y) => s + y.total, 0));
        setPeriodPurchases(yearPurch.reduce((s, y) => s + y.total, 0));
        setTopMovers(top);
      } else {
        // range
        const [rangeTickets, rangePurch, top] = await Promise.all([
          ticketRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to),
          purchaseRepo.rangeSummary(nav.dateRange.from, nav.dateRange.to),
          ticketRepo.topProductsByRange(
            nav.dateRange.from,
            nav.dateRange.to,
            10,
          ),
        ]);
        setPeriodSales(rangeTickets.reduce((s, t) => s + t.total, 0));
        setPeriodPurchases(rangePurch.totalSpent);
        setTopMovers(top);
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

  // Load previous-period data for delta comparison
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (nav.period === "day") {
            const prevDay = shiftDay(nav.selectedDay, -1);
            const [pSales, pPurch] = await Promise.all([
              ticketRepo.daySummary(prevDay),
              purchaseRepo.daySummary(prevDay),
            ]);
            setPrevSales(pSales.totalSales);
            setPrevPurchases(pPurch.totalSpent);
          } else if (nav.period === "week") {
            const prevWk = shiftWeek(nav.selectedWeekStart, -1);
            const prevWkEnd = weekEndISO(prevWk);
            const [pTkts, pPurch] = await Promise.all([
              ticketRepo.findByDateRange(prevWk, prevWkEnd),
              purchaseRepo.rangeSummary(prevWk, prevWkEnd),
            ]);
            setPrevSales(pTkts.reduce((s, t) => s + t.total, 0));
            setPrevPurchases(pPurch.totalSpent);
          } else if (nav.period === "month") {
            const prevMo = shiftMonth(nav.selectedMonth, -1);
            const [pSales, pPurch] = await Promise.all([
              ticketRepo.monthlySummary(prevMo),
              purchaseRepo.monthlySummary(prevMo),
            ]);
            setPrevSales(pSales.totalSales);
            setPrevPurchases(pPurch.totalSpent);
          } else if (nav.period === "year") {
            const [pYearSales, pYearPurch] = await Promise.all([
              ticketRepo.monthlySalesForYear(nav.selectedYear - 1),
              purchaseRepo.monthlyTotalsForYear(nav.selectedYear - 1),
            ]);
            setPrevSales(pYearSales.reduce((s, y) => s + y.total, 0));
            setPrevPurchases(pYearPurch.reduce((s, y) => s + y.total, 0));
          } else {
            setPrevSales(0);
            setPrevPurchases(0);
          }
        } catch {
          setPrevSales(0);
          setPrevPurchases(0);
        }
      })();
    }, [
      nav.period,
      nav.selectedDay,
      nav.selectedWeekStart,
      nav.selectedMonth,
      nav.selectedYear,
      ticketRepo,
      purchaseRepo,
    ]),
  );

  const unitMap = useMemo(
    () => new Map(allUnits.map((u) => [u.id, u])),
    [allUnits],
  );

  const inventoryValue = useMemo(
    () => allProducts.reduce((sum, p) => sum + p.costPrice * p.stockBaseQty, 0),
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
        (valueMap.get(catId) ?? 0) + p.costPrice * p.stockBaseQty,
      );
    }
    return allCategories
      .map((c, idx) => ({
        category: c,
        count: countMap.get(c.id) ?? 0,
        value: valueMap.get(c.id) ?? 0,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
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
          stockValue: p.costPrice * p.stockBaseQty,
        }))
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10),
    [allProducts],
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
          <PeriodSelector nav={nav} />
        </YStack>
      </Card>

      <FlatList
        data={allProducts.filter((p) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            p.name.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q)
          );
        })}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <YStack p="$4" gap="$4">
            {/* Movement KPIs */}
            <XStack gap="$3">
              <StatCard
                label="Compras"
                value={`$${fmtMoney(periodPurchases)}`}
                detail={`$${fmtMoneyFull(periodPurchases)}`}
                color="$blue10"
                icon={<ArrowDownToLine size={16} color="$blue10" />}
                delta={
                  nav.period !== "range" && prevPurchases > 0
                    ? ((periodPurchases - prevPurchases) / prevPurchases) * 100
                    : undefined
                }
              />
              <StatCard
                label="Ventas"
                value={`$${fmtMoney(periodSales)}`}
                detail={`$${fmtMoneyFull(periodSales)}`}
                color="$green10"
                icon={<ArrowUpFromLine size={16} color="$green10" />}
                delta={
                  nav.period !== "range" && prevSales > 0
                    ? ((periodSales - prevSales) / prevSales) * 100
                    : undefined
                }
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
                detail={`$${fmtMoneyFull(inventoryValue)}`}
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
                    color={
                      lowStockProducts.length > 0 ? "$orange10" : "$color8"
                    }
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

            {/* Top value products ranked list */}
            {topValueProducts.length > 0 && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack px="$4" pt="$4" pb="$2">
                  <XStack gap="$2" style={{ alignItems: "center" }}>
                    <DollarSign size={16} color="$green10" />
                    <Text fontSize="$3" fontWeight="600" color="$color10">
                      Top 10 por valor en stock
                    </Text>
                  </XStack>
                </YStack>
                {topValueProducts.map((p, idx) => (
                  <YStack key={p.id}>
                    {idx > 0 && <Separator />}
                    <Pressable
                      onPress={() => {
                        setSelectedProduct(p);
                        setShowDetailSheet(true);
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <XStack
                        px="$4"
                        py="$3"
                        style={{ alignItems: "center" }}
                        gap="$3"
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$color10"
                          width={22}
                          textAlign="center"
                        >
                          {idx + 1}
                        </Text>
                        <Text
                          flex={1}
                          fontSize="$3"
                          color="$color"
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        <Text fontSize="$3" fontWeight="600" color="$green10">
                          ${fmtMoney(p.stockValue)}
                        </Text>
                      </XStack>
                    </Pressable>
                  </YStack>
                ))}
              </Card>
            )}

            {/* Top movers for the period */}
            {topMovers.length > 0 && (
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <YStack px="$4" pt="$4" pb="$2">
                  <XStack gap="$2" style={{ alignItems: "center" }}>
                    <TrendingUp size={16} color="$blue10" />
                    <Text fontSize="$3" fontWeight="600" color="$color10">
                      Más vendidos del período
                    </Text>
                  </XStack>
                </YStack>
                {topMovers.map((m, idx) => (
                  <YStack key={m.productId}>
                    {idx > 0 && <Separator />}
                    <XStack
                      px="$4"
                      py="$3"
                      style={{ alignItems: "center" }}
                      gap="$3"
                    >
                      <Text
                        fontSize="$2"
                        fontWeight="bold"
                        color="$color10"
                        width={22}
                        textAlign="center"
                      >
                        {idx + 1}
                      </Text>
                      <YStack flex={1}>
                        <Text fontSize="$3" color="$color" numberOfLines={1}>
                          {m.productName}
                        </Text>
                        <Text fontSize="$2" color="$color10">
                          {m.totalQty} vendidos
                        </Text>
                      </YStack>
                      <Text fontSize="$3" fontWeight="600" color="$blue10">
                        ${fmtMoney(m.totalRevenue)}
                      </Text>
                    </XStack>
                  </YStack>
                ))}
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
                          onPress={() => {
                            setSelectedProduct(p);
                            setShowDetailSheet(true);
                          }}
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
                        onPress={() => {
                          setSelectedProduct(p);
                          setShowDetailSheet(true);
                        }}
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
                        onPress={() => {
                          setSelectedProduct(p);
                          setShowDetailSheet(true);
                        }}
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

            {/* All Products header + Search */}
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <Package size={18} color="$blue10" />
              <Text fontSize="$4" fontWeight="bold" color="$color">
                Todos los productos ({allProducts.length})
              </Text>
            </XStack>
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar por nombre o código…"
            />
          </YStack>
        }
        renderItem={({ item: p }) => {
          const unit = unitMap.get(p.baseUnitId);
          const stockColor =
            p.stockBaseQty === 0
              ? "$red10"
              : p.stockBaseQty <= 5
              ? "$orange10"
              : "$green10";
          return (
            <Pressable
              onPress={() => {
                setSelectedProduct(p);
                setShowDetailSheet(true);
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <XStack px="$4" py="$3" style={{ alignItems: "center" }} gap="$3">
                {p.photoUri ? (
                  <Image
                    source={{ uri: p.photoUri }}
                    style={{ width: 40, height: 40, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                ) : (
                  <YStack
                    width={40}
                    height={40}
                    style={{
                      borderRadius: 8,
                      backgroundColor: "#e5e7eb",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Package size={20} color="$color8" />
                  </YStack>
                )}
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
                    {p.barcode} · ${fmtMoney(p.salePrice)}/
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
                    ${fmtMoney(p.costPrice * p.stockBaseQty)}
                  </Text>
                </YStack>
              </XStack>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <Separator />}
        ListEmptyComponent={
          <YStack p="$5" style={{ alignItems: "center" }} gap="$2">
            <Package size={40} color="$color8" />
            <Text color="$color10">Sin productos</Text>
          </YStack>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        style={{ flex: 1 }}
      />

      {/* Product detail sheet */}
      <Sheet
        open={showDetailSheet}
        onOpenChange={(open) => {
          setShowDetailSheet(open);
          if (!open) setSelectedProduct(null);
        }}
        modal
        snapPoints={[95]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame p="$4" bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
            {selectedProduct && <ProductDetail product={selectedProduct} />}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}
