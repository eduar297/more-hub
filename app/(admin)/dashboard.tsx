import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { UnitCategory } from "@/models/unit";
import { LayoutDashboard, Package, Ruler, Tag } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

// ── Stat card ────────────────────────────────────────────────────────────────

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
      bg="$background"
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

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const productRepo = useProductRepository();
  const unitRepo = useUnitRepository();

  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCategories, setTotalCategories] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [categories, setCategories] = useState<
    { category: UnitCategory; count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, units, cats] = await Promise.all([
        productRepo.findAll(),
        unitRepo.findAll(),
        unitRepo.findAllCategories(),
      ]);

      setTotalProducts(prods.length);
      setTotalUnits(units.length);
      setTotalCategories(cats.length);

      // Count products per category (via unit's categoryId)
      const unitMap = new Map(units.map((u) => [u.id, u]));
      const countMap = new Map<number, number>();
      for (const p of prods) {
        const unit = unitMap.get(p.baseUnitId);
        const catId = unit?.categoryId ?? -1;
        countMap.set(catId, (countMap.get(catId) ?? 0) + 1);
      }

      const catStats = cats.map((c) => ({
        category: c,
        count: countMap.get(c.id) ?? 0,
      }));
      setCategories(catStats);
    } finally {
      setLoading(false);
    }
  }, [productRepo, unitRepo]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats]),
  );

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

  return (
    <ScrollView>
      <YStack bg="$background" p="$4" gap="$5" pb="$8">
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

        {/* Top stats row */}
        <XStack gap="$3">
          <StatCard
            label="Productos"
            value={totalProducts}
            color="$blue10"
            icon={<Package size={18} color="$blue10" />}
          />
          <StatCard
            label="Categorías"
            value={totalCategories}
            color="$green10"
            icon={<Tag size={18} color="$green10" />}
          />
          <StatCard
            label="Unidades"
            value={totalUnits}
            color="$orange10"
            icon={<Ruler size={18} color="$orange10" />}
          />
        </XStack>

        {/* Products by category */}
        <YStack gap="$3">
          <Text fontSize="$5" fontWeight="bold" color="$color">
            Productos por categoría
          </Text>

          <Card
            bg="$background"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            overflow="hidden"
          >
            {categories.length === 0 ? (
              <YStack p="$5" style={{ alignItems: "center" }} gap="$2">
                <Package size={40} color="$color8" />
                <Text color="$color10">Sin datos</Text>
              </YStack>
            ) : (
              categories.map((item, idx) => (
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
  );
}
