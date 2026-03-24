import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import {
    AlertTriangle,
    ChevronLeft,
    DollarSign,
    Package,
    PackageX,
    Ruler,
    Tag,
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

const SCREEN_W = Dimensions.get("window").width;

function fmtMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 10_000) return (abs / 1_000).toFixed(1) + "k";
  return abs.toFixed(2);
}

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

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
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
          fontSize="$5"
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

// ── Inventory Screen ──────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const router = useRouter();
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
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
        } finally {
          setLoading(false);
        }
      })();
    }, [productRepo, unitRepo]),
  );

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

  // Chart: stock value by category (pie)
  const categoryPieData = useMemo(() => {
    return categoryStats
      .filter((c) => c.value > 0)
      .map((c) => ({
        value: c.value,
        color: c.color,
      }));
  }, [categoryStats]);

  // Chart: top 10 products by stock value (bar)
  const topValueProducts = useMemo(() => {
    return [...allProducts]
      .map((p) => ({
        ...p,
        stockValue: p.pricePerBaseUnit * p.stockBaseQty,
      }))
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 10);
  }, [allProducts]);

  const stockBarData = useMemo(() => {
    return topValueProducts.map((p) => ({
      value: p.stockValue,
      label: p.name.slice(0, 6),
      frontColor: "#3b82f6",
      labelTextStyle: { fontSize: 7, color: "#888" },
    }));
  }, [topValueProducts]);

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
            <Package size={24} color="$purple10" />
            <YStack flex={1}>
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Inventario
              </Text>
              <Text fontSize="$3" color="$color10">
                Detalle de stock y alertas
              </Text>
            </YStack>
          </XStack>

          {/* KPI Row 1 */}
          <XStack gap="$3">
            <KpiCard
              label="Productos"
              value={allProducts.length}
              color="$blue10"
              icon={<Package size={16} color="$blue10" />}
            />
            <KpiCard
              label="Valor inv."
              value={`$${fmtMoney(inventoryValue)}`}
              color="$green10"
              icon={<DollarSign size={16} color="$green10" />}
            />
            <KpiCard
              label="Categorías"
              value={allCategories.length}
              color="$pink10"
              icon={<Tag size={16} color="$pink10" />}
            />
          </XStack>

          {/* KPI Row 2 */}
          <XStack gap="$3">
            <KpiCard
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
            <KpiCard
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
        </YStack>
      </ScrollView>
    </YStack>
  );
}
