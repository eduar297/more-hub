import { StatCard } from "@/components/admin/stat-card";
import { StockRow } from "@/components/admin/stock-row";
import { ProductDetail } from "@/components/product/product-detail";
import { SearchInput } from "@/components/ui/search-input";
import { CHART_PALETTE, ICON_BTN_BG } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import { fmtMoney, fmtMoneyFull } from "@/utils/format";
import {
    runPurchaseSuggestions,
    type PurchaseSuggestion,
} from "@/utils/purchase-suggestions";
import {
    AlertTriangle,
    DollarSign,
    Package,
    PackageX,
    Percent,
    RefreshCw,
    Ruler,
    Tag,
    TrendingDown,
    TrendingUp,
    X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import {
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";
import { AdminPieChart } from "./admin-pie-chart";

export function InventorySection() {
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();
  const db = useSQLiteContext();
  const { currentStore } = useStore();
  const c = useColors();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [rotationData, setRotationData] = useState<PurchaseSuggestion[]>([]);

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
    } finally {
      setLoading(false);
    }
  }, [productRepo, unitRepo]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Load rotation / margin data from purchase-suggestions engine
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const report = await runPurchaseSuggestions(db, 30, currentStore?.id);
          if (!cancelled) setRotationData(report.suggestions);
        } catch {
          /* ignore */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db, currentStore?.id]),
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
        .filter((cs) => cs.value > 0)
        .map((cs) => ({
          value: cs.value,
          color: cs.color,
          label: cs.category.name,
        })),
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

  // Rotation map: productId → PurchaseSuggestion
  const rotationMap = useMemo(
    () => new Map(rotationData.map((s) => [s.product.id, s])),
    [rotationData],
  );

  // Average margin across all products with cost > 0
  const avgMargin = useMemo(() => {
    const withCost = allProducts.filter((p) => p.costPrice > 0);
    if (withCost.length === 0) return 0;
    const sum = withCost.reduce((acc, p) => {
      return acc + ((p.salePrice - p.costPrice) / p.salePrice) * 100;
    }, 0);
    return sum / withCost.length;
  }, [allProducts]);

  // Slow rotation products (>90 days of stock)
  const slowRotation = useMemo(
    () =>
      rotationData
        .filter((s) => s.daysOfStock > 90 && s.currentStock > 0)
        .sort((a, b) => b.daysOfStock - a.daysOfStock)
        .slice(0, 10),
    [rotationData],
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
      <FlatList
        data={allProducts.filter((p) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
          );
        })}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <YStack p="$4" gap="$4">
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
              <StatCard
                label="Margen prom."
                value={`${avgMargin.toFixed(1)}%`}
                color={
                  avgMargin < 10
                    ? "$red10"
                    : avgMargin < 20
                    ? "$orange10"
                    : "$green10"
                }
                icon={
                  <Percent
                    size={16}
                    color={
                      avgMargin < 10
                        ? "$red10"
                        : avgMargin < 20
                        ? "$orange10"
                        : "$green10"
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
                  <AdminPieChart
                    data={categoryPieData}
                    radius={60}
                    innerRadius={35}
                    centerLabel={{
                      title: "Total",
                      value: `$${fmtMoney(inventoryValue)}`,
                    }}
                  />
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
                          style={{ textAlign: "center" }}
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

            {/* Slow rotation products */}
            {slowRotation.length > 0 && (
              <YStack gap="$3">
                <XStack gap="$2" style={{ alignItems: "center" }}>
                  <RefreshCw size={18} color="$purple10" />
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    Rotación lenta (&gt;90 días)
                  </Text>
                </XStack>
                <Card
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 14 }}
                  overflow="hidden"
                >
                  {slowRotation.map((s, idx) => {
                    const margin = s.marginPct;
                    const marginColor =
                      margin < 0
                        ? "$red10"
                        : margin < 10
                        ? "$orange10"
                        : "$green10";
                    return (
                      <YStack key={s.product.id}>
                        {idx > 0 && <Separator />}
                        <Pressable
                          onPress={() => {
                            setSelectedProduct(s.product);
                            setShowDetailSheet(true);
                          }}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.6 : 1,
                          })}
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
                              style={{ textAlign: "center" }}
                            >
                              {idx + 1}
                            </Text>
                            <YStack flex={1}>
                              <Text
                                fontSize="$3"
                                fontWeight="600"
                                color="$color"
                                numberOfLines={1}
                              >
                                {s.product.name}
                              </Text>
                              <Text fontSize="$2" color="$color10">
                                {s.currentStock} uds ·{" "}
                                <Text fontSize="$2" color={marginColor as any}>
                                  {margin.toFixed(1)}% margen
                                </Text>
                              </Text>
                            </YStack>
                            <YStack style={{ alignItems: "flex-end" }}>
                              <Text
                                fontSize="$3"
                                fontWeight="bold"
                                color="$purple10"
                              >
                                {Math.round(s.daysOfStock)}d
                              </Text>
                              <Text fontSize="$1" color="$color10">
                                $
                                {fmtMoney(s.product.costPrice * s.currentStock)}
                              </Text>
                            </YStack>
                          </XStack>
                        </Pressable>
                      </YStack>
                    );
                  })}
                </Card>
              </YStack>
            )}

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
          const margin =
            p.salePrice > 0
              ? ((p.salePrice - p.costPrice) / p.salePrice) * 100
              : 0;
          const marginColor =
            margin < 0 ? "$red10" : margin < 10 ? "$orange10" : "$green10";
          const rotation = rotationMap.get(p.id);
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
                      backgroundColor: c.divider,
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
                    {p.code} · ${fmtMoney(p.salePrice)}/{unit?.symbol ?? "ud"}
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
                  <Text fontSize="$1" color={marginColor as any}>
                    {margin.toFixed(1)}% margen
                  </Text>
                  {rotation && rotation.daysOfStock < Infinity && (
                    <Text fontSize="$1" color="$color10">
                      ~{Math.round(rotation.daysOfStock)}d stock
                    </Text>
                  )}
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

      {/* Product detail modal */}
      <Modal
        visible={showDetailSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowDetailSheet(false);
          setSelectedProduct(null);
        }}
      >
        <SafeAreaView
          edges={["top"]}
          style={[invStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Package size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Detalle de producto
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => {
                setShowDetailSheet(false);
                setSelectedProduct(null);
              }}
              hitSlop={8}
              style={invStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            {selectedProduct && <ProductDetail product={selectedProduct} />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const invStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
