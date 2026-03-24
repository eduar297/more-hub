import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  LayoutDashboard,
  Package,
  PackageX,
  Ruler,
  Tag,
  TrendingDown,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(val: number): string {
  if (val >= 100_000) return `$${(val / 1000).toFixed(0)}k`;
  if (val >= 1_000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
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

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
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
      loadStats();
    }, [loadStats]),
  );

  // ── Derived analytics ────────────────────────────────────────────────────────

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

  const avgPrice = useMemo(
    () =>
      allProducts.length > 0
        ? allProducts.reduce((s, p) => s + p.pricePerBaseUnit, 0) /
          allProducts.length
        : 0,
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

  // ── Loading ───────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <YStack flex={1} bg="$background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack bg="$background" p="$4" gap="$5" pb="$10">
          {/* Page title */}
          <XStack gap="$3" mt="$2" style={{ alignItems: "center" }}>
            <LayoutDashboard size={26} color="$blue10" />
            <YStack>
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Dashboard
              </Text>
              <Text fontSize="$3" color="$color10">
                Resumen del inventario
              </Text>
            </YStack>
          </XStack>

          {/* Row 1: totals */}
          <XStack gap="$3">
            <StatCard
              label="Productos"
              value={allProducts.length}
              color="$blue10"
              icon={<Package size={18} color="$blue10" />}
            />
            <StatCard
              label="Valor inv."
              value={formatCurrency(inventoryValue)}
              color="$green10"
              icon={<DollarSign size={18} color="$green10" />}
            />
            <StatCard
              label="Categ."
              value={allCategories.length}
              color="$pink10"
              icon={<Tag size={18} color="$pink10" />}
            />
          </XStack>

          {/* Row 2: risk indicators */}
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
            <StatCard
              label="Precio prom"
              value={`$${avgPrice.toFixed(2)}`}
              color="$blue10"
              icon={<BarChart3 size={18} color="$blue10" />}
            />
          </XStack>

          {/* Alerts: low/out of stock */}
          {(lowStockProducts.length > 0 || outOfStockCount > 0) && (
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <AlertTriangle size={18} color="$orange10" />
                <Text fontSize="$5" fontWeight="bold" color="$color">
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
                <Text fontSize="$5" fontWeight="bold" color="$color">
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

          {/* Bottom stocked (excluding 0) */}
          {bottomStocked.length > 0 && (
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <TrendingDown size={18} color="$orange10" />
                <Text fontSize="$5" fontWeight="bold" color="$color">
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
              <Text fontSize="$5" fontWeight="bold" color="$color">
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
