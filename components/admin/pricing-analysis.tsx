import { SearchInput } from "@/components/ui/search-input";
import { CLASS_META_COLORS } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useProductRepository } from "@/hooks/use-product-repository";
import { fmtMoney } from "@/utils/format";
import type {
  PricingReport,
  ProductAnalysis,
  ProductClass,
} from "@/utils/pricing-analysis";
import { runPricingAnalysis } from "@/utils/pricing-analysis";
import {
  ArrowUpDown,
  Check,
  CheckCircle,
  ChevronDown,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Alert, Image, ScrollView as RNScrollView } from "react-native";
import {
  Accordion,
  Button,
  Card,
  Input,
  Label,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

// ── Classification helpers ───────────────────────────────────────────────────

const CLASS_META: Record<
  ProductClass,
  { label: string; color: string; emoji: string; desc: string }
> = {
  star: {
    label: "Top",
    color: CLASS_META_COLORS.star,
    emoji: "⭐",
    desc: "Se vende mucho + buen margen",
  },
  cow: {
    label: "Rentable",
    color: CLASS_META_COLORS.cow,
    emoji: "💰",
    desc: "Se vende mucho + margen bajo",
  },
  question: {
    label: "Oportunidad",
    color: CLASS_META_COLORS.question,
    emoji: "🔍",
    desc: "Se vende poco + buen margen",
  },
  dog: {
    label: "Revisar",
    color: CLASS_META_COLORS.dog,
    emoji: "⚠️",
    desc: "Se vende poco + margen bajo",
  },
};

function ClassBadge({ cls }: { cls: ProductClass }) {
  const meta = CLASS_META[cls];
  return (
    <XStack
      px="$2"
      py="$1"
      style={{
        borderRadius: 8,
        backgroundColor: meta.color + "22",
        alignItems: "center",
      }}
      gap="$1"
    >
      <Text fontSize={10}>{meta.emoji}</Text>
      <Text fontSize="$1" fontWeight="600" color={meta.color as any}>
        {meta.label}
      </Text>
    </XStack>
  );
}

// ── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "name" | "margin" | "sales" | "suggested" | "classification";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "sales", label: "Ventas/mes" },
  { key: "margin", label: "Margen actual" },
  { key: "suggested", label: "Precio sugerido" },
  { key: "classification", label: "Clasificación" },
];

// ── Product analysis row ─────────────────────────────────────────────────────

function AnalysisRow({
  item,
  onApply,
}: {
  item: ProductAnalysis;
  onApply: () => void;
}) {
  const p = item.product;
  const c = useColors();
  const diff = item.suggestedPrice - p.salePrice;
  const diffPct =
    p.salePrice > 0 ? ((diff / p.salePrice) * 100).toFixed(1) : "—";
  const diffColor = diff > 0 ? "$orange10" : diff < 0 ? "$green10" : "$color10";

  return (
    <Accordion.Item
      value={String(p.id)}
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Accordion.Trigger
        flexDirection="row"
        px="$4"
        py="$3.5"
        gap="$3"
        style={{ alignItems: "center" }}
        borderWidth={0}
        bg="transparent"
        pressStyle={{ opacity: 0.7 }}
      >
        {({ open }: { open: boolean }) => (
          <>
            {p.photoUri ? (
              <Image
                source={{ uri: p.photoUri }}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                resizeMode="cover"
              />
            ) : (
              <YStack
                width={44}
                height={44}
                style={{
                  borderRadius: 10,
                  backgroundColor: c.divider,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TrendingUp size={20} color="$color8" />
              </YStack>
            )}

            <YStack flex={1} gap="$0.5">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$color"
                numberOfLines={1}
              >
                {p.name}
              </Text>
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <ClassBadge cls={item.classification} />
                <Text fontSize="$1" color="$color10">
                  {item.avgMonthlySales.toFixed(1)}/mes
                </Text>
              </XStack>
            </YStack>

            <YStack style={{ alignItems: "flex-end" }} gap="$0.5">
              <Text fontSize="$3" fontWeight="bold" color="$blue10">
                {`$${fmtMoney(item.suggestedPrice)}`}
              </Text>
              <Text fontSize="$1" color={diffColor as any}>
                {`${diff > 0 ? "+" : ""}${diffPct}%`}
              </Text>
            </YStack>

            <YStack
              style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
            >
              <ChevronDown size={16} color="$color8" />
            </YStack>
          </>
        )}
      </Accordion.Trigger>

      <Accordion.HeightAnimator>
        <Accordion.Content
          exitStyle={{ opacity: 0 }}
          px="$4"
          pb="$3"
          gap="$2"
          bg="$color1"
        >
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Costo compra prom.
            </Text>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {`$${fmtMoney(item.avgPurchaseCost)}`}
            </Text>
          </XStack>
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Precio venta actual
            </Text>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {`$${fmtMoney(p.salePrice)}`}
            </Text>
          </XStack>
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Margen actual
            </Text>
            <Text
              fontSize="$2"
              fontWeight="600"
              color={
                item.currentMargin >= 0.2
                  ? "$green10"
                  : item.currentMargin >= 0.1
                  ? "$orange10"
                  : "$red10"
              }
            >
              {`${(item.currentMargin * 100).toFixed(1)}%`}
            </Text>
          </XStack>
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Gastos asignados/ud
            </Text>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {`$${fmtMoney(item.expensePerUnit)}`}
            </Text>
          </XStack>
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Ventas totales (período)
            </Text>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {`${item.totalUnitsSold} uds · $${fmtMoney(item.totalRevenue)}`}
            </Text>
          </XStack>
          <XStack style={{ justifyContent: "space-between" }}>
            <Text fontSize="$2" color="$color10">
              Aporte a ingresos
            </Text>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {`${(item.revenueShare * 100).toFixed(1)}%`}
            </Text>
          </XStack>

          {Math.abs(diff) > 0.01 && (
            <Button
              size="$3"
              theme="blue"
              mt="$1"
              icon={Check}
              onPress={onApply}
            >
              <Text>{`Aplicar $${fmtMoney(item.suggestedPrice)}`}</Text>
            </Button>
          )}
        </Accordion.Content>
      </Accordion.HeightAnimator>
    </Accordion.Item>
  );
}

// ── Main component (Section-based) ──────────────────────────────────────────

export function PricingAnalysisSection({
  onPricesUpdated,
}: {
  onPricesUpdated: () => void;
}) {
  const db = useSQLiteContext();
  const { currentStore } = useStore();
  const productRepo = useProductRepository();

  const [marginInput, setMarginInput] = useState("30");
  const [report, setReport] = useState<PricingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterClass, setFilterClass] = useState<ProductClass | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const analyse = useCallback(async () => {
    const margin = parseFloat(marginInput) / 100;
    if (isNaN(margin) || margin <= 0 || margin >= 1) {
      Alert.alert("Error", "El margen debe estar entre 1% y 99%");
      return;
    }
    setLoading(true);
    try {
      const r = await runPricingAnalysis(db, margin, currentStore?.id);
      setReport(r);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [db, marginInput, currentStore]);

  // Sort + filter + search
  const sortedProducts = useMemo(() => {
    if (!report) return [];
    let items = [...report.products];
    if (filterClass) {
      items = items.filter((i) => i.classification === filterClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          i.product.code.toLowerCase().includes(q),
      );
    }
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.product.name.localeCompare(b.product.name);
          break;
        case "sales":
          cmp = a.avgMonthlySales - b.avgMonthlySales;
          break;
        case "margin":
          cmp = a.currentMargin - b.currentMargin;
          break;
        case "suggested":
          cmp = a.suggestedPrice - b.suggestedPrice;
          break;
        case "classification": {
          const order: Record<ProductClass, number> = {
            star: 0,
            cow: 1,
            question: 2,
            dog: 3,
          };
          cmp = order[a.classification] - order[b.classification];
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [report, sortKey, sortAsc, filterClass, searchQuery]);

  // Classification summary
  const classCounts = useMemo(() => {
    if (!report) return { star: 0, cow: 0, question: 0, dog: 0 };
    const counts = { star: 0, cow: 0, question: 0, dog: 0 };
    for (const p of report.products) counts[p.classification]++;
    return counts;
  }, [report]);

  const applyOne = useCallback(
    async (item: ProductAnalysis) => {
      await productRepo.bulkUpdateSalePrice([
        { id: item.product.id, salePrice: item.suggestedPrice },
      ]);
      // Update inline
      if (report) {
        setReport({
          ...report,
          products: report.products.map((p) =>
            p.product.id === item.product.id
              ? {
                  ...p,
                  product: { ...p.product, salePrice: item.suggestedPrice },
                  currentMargin:
                    item.suggestedPrice > 0
                      ? (item.suggestedPrice - p.avgPurchaseCost) /
                        item.suggestedPrice
                      : 0,
                }
              : p,
          ),
        });
      }
      onPricesUpdated();
    },
    [productRepo, report, onPricesUpdated],
  );

  const applyAll = useCallback(async () => {
    if (!report) return;
    const updates = report.products
      .filter((p) => Math.abs(p.suggestedPrice - p.product.salePrice) > 0.01)
      .map((p) => ({ id: p.product.id, salePrice: p.suggestedPrice }));

    if (updates.length === 0) {
      Alert.alert("Info", "Todos los precios ya coinciden con lo sugerido.");
      return;
    }

    Alert.alert(
      "Aplicar precios sugeridos",
      `Se actualizará el precio de venta de ${updates.length} producto${
        updates.length > 1 ? "s" : ""
      }. ¿Continuar?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Aplicar",
          onPress: async () => {
            setApplying(true);
            try {
              await productRepo.bulkUpdateSalePrice(updates);
              // Re-run analysis to refresh
              const margin = parseFloat(marginInput) / 100;
              const r = await runPricingAnalysis(db, margin, currentStore?.id);
              setReport(r);
              onPricesUpdated();
              Alert.alert(
                "Listo",
                `${updates.length} precio${
                  updates.length > 1 ? "s" : ""
                } actualizado${updates.length > 1 ? "s" : ""}.`,
              );
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            } finally {
              setApplying(false);
            }
          },
        },
      ],
    );
  }, [report, productRepo, db, marginInput, onPricesUpdated]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <YStack flex={1} bg="$background">
      {/* Params */}
      <XStack
        px="$4"
        pt="$2"
        pb="$3"
        gap="$3"
        style={{ alignItems: "flex-end" }}
      >
        <YStack flex={1} gap="$1">
          <Label fontSize="$2" color="$color10">
            Margen objetivo (%)
          </Label>
          <Input
            size="$3"
            value={marginInput}
            onChangeText={setMarginInput}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder="30"
          />
        </YStack>
        <Button
          size="$3"
          theme="blue"
          icon={loading ? <Spinner size="small" /> : TrendingUp}
          onPress={analyse}
          disabled={loading}
        >
          <Text>Analizar</Text>
        </Button>
      </XStack>

      {report && (
        <YStack flex={1}>
          <RNScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* Summary KPIs */}
            <XStack px="$4" pt="$2" pb="$3" gap="$2.5">
              <Card
                flex={1}
                p="$3"
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 12 }}
              >
                <Text fontSize="$2" color="$color10">
                  Ingresos totales
                </Text>
                <Text fontSize="$4" fontWeight="bold" color="$green10">
                  ${fmtMoney(report.totalRevenue)}
                </Text>
              </Card>
              <Card
                flex={1}
                p="$3"
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 12 }}
              >
                <Text fontSize="$2" color="$color10">
                  Gastos/mes prom.
                </Text>
                <Text fontSize="$4" fontWeight="bold" color="$red10">
                  ${fmtMoney(report.avgMonthlyExpenses)}
                </Text>
              </Card>
              <Card
                flex={1}
                p="$3"
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 12 }}
              >
                <Text fontSize="$2" color="$color10">
                  Período
                </Text>
                <Text fontSize="$4" fontWeight="bold" color="$blue10">
                  {report.monthsAnalysed} meses
                </Text>
              </Card>
            </XStack>

            {/* Classification filter pills */}
            <RNScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 8,
                paddingBottom: 8,
              }}
            >
              <Button
                size="$2"
                theme={filterClass === null ? "blue" : undefined}
                chromeless={filterClass !== null}
                onPress={() => setFilterClass(null)}
              >
                <Text fontSize="$2">{`Todos (${report.products.length})`}</Text>
              </Button>
              {(["star", "cow", "question", "dog"] as ProductClass[]).map(
                (cls) => (
                  <Button
                    key={cls}
                    size="$2"
                    theme={filterClass === cls ? "blue" : undefined}
                    chromeless={filterClass !== cls}
                    onPress={() =>
                      setFilterClass(filterClass === cls ? null : cls)
                    }
                  >
                    <Text fontSize="$2">{`${CLASS_META[cls].emoji} ${classCounts[cls]}`}</Text>
                  </Button>
                ),
              )}
            </RNScrollView>

            {/* Search */}
            <YStack px="$4" pb="$2">
              <SearchInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar producto…"
              />
            </YStack>

            {/* Sort row */}
            <RNScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 6,
                paddingBottom: 8,
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.key}
                  size="$2"
                  chromeless
                  onPress={() => handleSort(opt.key)}
                  icon={
                    sortKey === opt.key ? (
                      <ArrowUpDown size={12} color="$blue10" />
                    ) : undefined
                  }
                >
                  <Text
                    fontSize="$2"
                    color={sortKey === opt.key ? "$blue10" : "$color10"}
                  >
                    {opt.label}
                  </Text>
                </Button>
              ))}
            </RNScrollView>

            {/* Product list */}
            <YStack px="$4">
              <Card
                bg="$color1"
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
              >
                <Accordion type="single" collapsible overflow="hidden">
                  {sortedProducts.map((item) => (
                    <AnalysisRow
                      key={item.product.id}
                      item={item}
                      onApply={() => applyOne(item)}
                    />
                  ))}
                </Accordion>
              </Card>
            </YStack>
          </RNScrollView>

          {/* Apply all button */}
          <YStack
            px="$4"
            py="$3"
            borderTopWidth={1}
            borderColor="$borderColor"
            bg="$background"
          >
            <Button
              size="$4"
              theme="green"
              icon={applying ? <Spinner /> : CheckCircle}
              disabled={applying}
              onPress={applyAll}
            >
              <Text>Aplicar todos los precios sugeridos</Text>
            </Button>
          </YStack>
        </YStack>
      )}

      {!report && !loading && (
        <YStack
          flex={1}
          style={{ justifyContent: "center", alignItems: "center" }}
          gap="$3"
          p="$8"
        >
          <TrendingUp size={56} color="$color8" />
          <Text fontSize="$4" color="$color10" style={{ textAlign: "center" }}>
            Configura el margen objetivo y presiona &quot;Analizar&quot; para
            ver los precios sugeridos de cada producto.
          </Text>
        </YStack>
      )}
    </YStack>
  );
}
