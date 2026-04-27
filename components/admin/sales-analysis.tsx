import { SearchInput } from "@/components/ui/search-input";
import {
  AFFINITY_COLORS,
  DISCOUNT_COLORS,
  STAGNANT_COLORS,
} from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useProductRepository } from "@/hooks/use-product-repository";
import { fmtMoney } from "@/utils/format";
import type {
  ComboAffinity,
  ComboSuggestion,
  DiscountOpportunity,
  SalesReport,
  StagnantProduct,
  StagnantStatus,
} from "@/utils/sales-analysis";
import { comboAffinity, runSalesAnalysis } from "@/utils/sales-analysis";
import {
  ArrowUpDown,
  Check,
  CheckCircle,
  ChevronDown,
  Package,
  TrendingDown,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Alert, Image, ScrollView } from "react-native";
import {
  Accordion,
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

// ── Badge helpers ────────────────────────────────────────────────────────────

const STAGNANT_META: Record<
  StagnantStatus,
  { label: string; color: string; emoji: string }
> = {
  no_sales: {
    label: "Sin ventas",
    color: STAGNANT_COLORS.no_sales,
    emoji: "🔴",
  },
  heavy_drop: {
    label: "Caída fuerte",
    color: STAGNANT_COLORS.heavy_drop,
    emoji: "🟠",
  },
  slowing: {
    label: "Desacelerando",
    color: STAGNANT_COLORS.slowing,
    emoji: "🟡",
  },
};

const DISCOUNT_META: Record<
  "possible" | "tight" | "none",
  { label: string; color: string; emoji: string }
> = {
  possible: {
    label: "Descuento posible",
    color: DISCOUNT_COLORS.possible,
    emoji: "✅",
  },
  tight: { label: "Margen justo", color: DISCOUNT_COLORS.tight, emoji: "⚠️" },
  none: { label: "Sin margen", color: DISCOUNT_COLORS.none, emoji: "🚫" },
};

const AFFINITY_META: Record<
  ComboAffinity,
  { label: string; color: string; emoji: string }
> = {
  high: { label: "Alta afinidad", color: AFFINITY_COLORS.high, emoji: "💚" },
  medium: { label: "Media", color: AFFINITY_COLORS.medium, emoji: "💛" },
  low: { label: "Baja", color: AFFINITY_COLORS.low, emoji: "⚪" },
};

function StagnantBadge({ status }: { status: StagnantStatus }) {
  const m = STAGNANT_META[status];
  return (
    <XStack
      px="$2"
      py="$1"
      style={{
        borderRadius: 8,
        backgroundColor: m.color + "22",
        alignItems: "center",
      }}
      gap="$1"
    >
      <Text fontSize={10}>{m.emoji}</Text>
      <Text fontSize="$1" fontWeight="600" color={m.color as any}>
        {m.label}
      </Text>
    </XStack>
  );
}

function ViabilityBadge({ v }: { v: "possible" | "tight" | "none" }) {
  const m = DISCOUNT_META[v];
  return (
    <XStack
      px="$2"
      py="$1"
      style={{
        borderRadius: 8,
        backgroundColor: m.color + "22",
        alignItems: "center",
      }}
      gap="$1"
    >
      <Text fontSize={10}>{m.emoji}</Text>
      <Text fontSize="$1" fontWeight="600" color={m.color as any}>
        {m.label}
      </Text>
    </XStack>
  );
}

function AffinityBadge({ pct }: { pct: number }) {
  const a = comboAffinity(pct);
  const m = AFFINITY_META[a];
  return (
    <XStack
      px="$2"
      py="$1"
      style={{
        borderRadius: 8,
        backgroundColor: m.color + "22",
        alignItems: "center",
      }}
      gap="$1"
    >
      <Text fontSize={10}>{m.emoji}</Text>
      <Text fontSize="$1" fontWeight="600" color={m.color as any}>
        {m.label}
      </Text>
    </XStack>
  );
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <XStack style={{ justifyContent: "space-between" }}>
      <Text fontSize="$2" color="$color10">
        {label}
      </Text>
      <Text fontSize="$2" fontWeight="600" color={(color ?? "$color") as any}>
        {value}
      </Text>
    </XStack>
  );
}

function ProductThumb({
  uri,
  size = 32,
}: {
  uri?: string | null;
  size?: number;
}) {
  const c = useColors();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <YStack
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.divider,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Package size={size * 0.55} color="$color8" />
    </YStack>
  );
}

// ── KPI card (compact – matches pricing-analysis / purchase-suggestions) ─────

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card
      flex={1}
      minWidth={100}
      p="$2"
      bg="$color1"
      borderWidth={1}
      borderColor="$borderColor"
      style={{ borderRadius: 10 }}
    >
      <Text fontSize="$1" color="$color10">
        {label}
      </Text>
      <Text fontSize="$3" fontWeight="bold" color={(color ?? "$color") as any}>
        {value}
      </Text>
    </Card>
  );
}

// ── Row: Stagnant ─────────────────────────────────────────────────────────────

function StagnantRow({
  item,
  discount,
  onApply,
}: {
  item: StagnantProduct;
  discount?: DiscountOpportunity;
  onApply?: () => void;
}) {
  const p = item.product;
  const c = useColors();
  const daysLabel =
    item.daysSinceLastSale === null
      ? "Nunca vendido"
      : `Última venta hace ${item.daysSinceLastSale}d`;
  return (
    <Accordion.Item
      value={`st-${p.id}`}
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Accordion.Trigger
        flexDirection="row"
        px="$3"
        py="$3"
        bg="$background"
        pressStyle={{ bg: "$color2" }}
      >
        {({ open }: { open: boolean }) => (
          <>
            <XStack flex={1} gap="$3" style={{ alignItems: "center" }}>
              <ProductThumb uri={p.photoUri} />
              <YStack flex={1} gap="$0.5">
                <Text
                  fontSize="$3"
                  fontWeight="700"
                  color="$color"
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                <Text fontSize="$1" color="$color10">
                  {daysLabel}
                </Text>
              </YStack>
              <YStack gap="$1" style={{ alignItems: "flex-end" }}>
                <StagnantBadge status={item.status} />
                <Text fontSize="$1" color="$red10" fontWeight="600">
                  ${fmtMoney(item.capitalLocked)}
                </Text>
              </YStack>
            </XStack>
            <ChevronDown
              size={16}
              color="$color8"
              style={{
                marginLeft: 8,
                transform: [{ rotate: open ? "180deg" : "0deg" }],
              }}
            />
          </>
        )}
      </Accordion.Trigger>
      <Accordion.Content px="$3" pb="$3" bg="$color1">
        <YStack gap="$2" pt="$1">
          <DetailRow label="Stock actual" value={`${p.stockBaseQty} uds`} />
          <DetailRow
            label="Capital bloqueado"
            value={`$${fmtMoney(item.capitalLocked)}`}
            color={c.danger}
          />
          <DetailRow
            label="Costo promedio/ud"
            value={`$${fmtMoney(item.avgCost)}`}
          />
          <DetailRow
            label="Precio de venta"
            value={`$${fmtMoney(p.salePrice)}`}
          />
          {item.daysOfStock < 9999 && (
            <DetailRow
              label="Días de stock (ritmo actual)"
              value={`${item.daysOfStock}d`}
            />
          )}
          <Separator my="$1" />
          <DetailRow
            label="Ventas período anterior"
            value={`${item.olderUnits.toFixed(1)} uds`}
          />
          <DetailRow
            label="Ventas período reciente"
            value={`${item.recentUnits.toFixed(1)} uds`}
            color={item.recentUnits < item.olderUnits ? c.danger : "$color"}
          />
          {item.velocityDrop > 0 && (
            <DetailRow
              label="Caída de velocidad"
              value={`${Math.round(item.velocityDrop * 100)}%`}
              color={c.danger}
            />
          )}
          {discount && discount.viability !== "none" && (
            <>
              <Separator my="$1" />
              <DetailRow
                label="Precio sugerido"
                value={`$${fmtMoney(discount.suggestedPrice)}`}
                color={c.green}
              />
              <DetailRow
                label="Descuento"
                value={`${Math.round(discount.discountPct * 100)}%`}
                color={c.orange}
              />
              <DetailRow
                label="Margen restante"
                value={`${Math.round(discount.remainingMargin * 100)}%`}
              />
              <Button
                size="$3"
                theme="blue"
                mt="$1"
                icon={Check}
                onPress={onApply}
              >
                <Text>{`Aplicar $${fmtMoney(discount.suggestedPrice)}`}</Text>
              </Button>
            </>
          )}
        </YStack>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ── Row: Discount ─────────────────────────────────────────────────────────────

function DiscountRow({
  item,
  onApply,
}: {
  item: DiscountOpportunity;
  onApply: () => void;
}) {
  const p = item.product;
  const c = useColors();
  return (
    <Accordion.Item
      value={`dc-${p.id}`}
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Accordion.Trigger
        flexDirection="row"
        px="$3"
        py="$3"
        bg="$background"
        pressStyle={{ bg: "$color2" }}
      >
        {({ open }: { open: boolean }) => (
          <>
            <XStack flex={1} gap="$3" style={{ alignItems: "center" }}>
              <ProductThumb uri={p.photoUri} />
              <YStack flex={1} gap="$0.5">
                <Text
                  fontSize="$3"
                  fontWeight="700"
                  color="$color"
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                <Text fontSize="$1" color="$color10">
                  ${fmtMoney(p.salePrice)} →{" "}
                  <Text color="$green10" fontWeight="600">
                    ${fmtMoney(item.suggestedPrice)}
                  </Text>
                </Text>
              </YStack>
              <YStack gap="$1" style={{ alignItems: "flex-end" }}>
                <ViabilityBadge v={item.viability} />
                <Text fontSize="$1" color="$orange10" fontWeight="600">
                  -{Math.round(item.discountPct * 100)}%
                </Text>
              </YStack>
            </XStack>
            <ChevronDown
              size={16}
              color="$color8"
              style={{
                marginLeft: 8,
                transform: [{ rotate: open ? "180deg" : "0deg" }],
              }}
            />
          </>
        )}
      </Accordion.Trigger>
      <Accordion.Content px="$3" pb="$3" bg="$color1">
        <YStack gap="$2" pt="$1">
          <DetailRow
            label="Precio actual"
            value={`$${fmtMoney(item.currentPrice)}`}
          />
          <DetailRow
            label="Precio sugerido"
            value={`$${fmtMoney(item.suggestedPrice)}`}
            color={c.green}
          />
          <DetailRow
            label="Descuento"
            value={`${Math.round(item.discountPct * 100)}%`}
            color={c.orange}
          />
          <Separator my="$1" />
          <DetailRow
            label="Margen actual"
            value={`${Math.round(item.currentMargin * 100)}%`}
          />
          <DetailRow
            label="Margen tras descuento"
            value={`${Math.round(item.remainingMargin * 100)}%`}
          />
          <DetailRow
            label="Costo promedio/ud"
            value={`$${fmtMoney(item.avgCost)}`}
          />
          <Separator my="$1" />
          <DetailRow
            label="Velocidad reciente"
            value={`${item.recentMonthlyVelocity.toFixed(1)} uds/mes`}
          />
          <DetailRow
            label="Velocidad histórica"
            value={`${item.olderMonthlyVelocity.toFixed(1)} uds/mes`}
          />
          <DetailRow
            label="Potencial mensual (si reactiva)"
            value={`$${fmtMoney(item.potentialMonthlyRevenue)}`}
            color={c.green}
          />

          {item.viability !== "none" && (
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
        </YStack>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ── Row: Combo ────────────────────────────────────────────────────────────────

function ComboRow({ item }: { item: ComboSuggestion }) {
  const c = useColors();
  return (
    <Accordion.Item
      value={`co-${item.anchorProduct.id}-${item.partnerProduct.id}`}
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Accordion.Trigger
        flexDirection="row"
        px="$3"
        py="$3"
        bg="$background"
        pressStyle={{ bg: "$color2" }}
      >
        {({ open }: { open: boolean }) => (
          <>
            <XStack flex={1} gap="$3" style={{ alignItems: "center" }}>
              <XStack gap="$1">
                <ProductThumb uri={item.anchorProduct.photoUri} size={28} />
                <ProductThumb uri={item.partnerProduct.photoUri} size={28} />
              </XStack>
              <YStack flex={1} gap="$0.5">
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color="$color"
                  numberOfLines={1}
                >
                  {item.anchorProduct.name} + {item.partnerProduct.name}
                </Text>
                <Text fontSize="$1" color="$color10">
                  ${fmtMoney(item.individualTotal)} →{" "}
                  <Text color="$green10" fontWeight="600">
                    ${fmtMoney(item.comboPrice)}
                  </Text>
                </Text>
              </YStack>
              <YStack gap="$1" style={{ alignItems: "flex-end" }}>
                <AffinityBadge pct={item.affinityPct} />
                <Text fontSize="$1" color="$orange10" fontWeight="600">
                  -{Math.round(item.comboPct * 100)}%
                </Text>
              </YStack>
            </XStack>
            <ChevronDown
              size={16}
              color="$color8"
              style={{
                marginLeft: 8,
                transform: [{ rotate: open ? "180deg" : "0deg" }],
              }}
            />
          </>
        )}
      </Accordion.Trigger>
      <Accordion.Content px="$3" pb="$3" bg="$color1">
        <YStack gap="$2" pt="$1">
          <DetailRow
            label={item.anchorProduct.name}
            value={`$${fmtMoney(item.anchorProduct.salePrice)}`}
          />
          <DetailRow
            label={item.partnerProduct.name}
            value={`$${fmtMoney(item.partnerProduct.salePrice)}`}
          />
          <DetailRow
            label="Total individual"
            value={`$${fmtMoney(item.individualTotal)}`}
          />
          <Separator my="$1" />
          <DetailRow
            label="Precio combo sugerido"
            value={`$${fmtMoney(item.comboPrice)}`}
            color={c.green}
          />
          <DetailRow
            label="Ahorro para el cliente"
            value={`${Math.round(item.comboPct * 100)}%`}
            color={c.orange}
          />
          <DetailRow
            label="Margen del combo"
            value={`${Math.round(item.comboMargin * 100)}%`}
          />
          <Separator my="$1" />
          <DetailRow
            label="Aparecen juntos en"
            value={`${item.coOccurrences} tickets`}
          />
          <DetailRow
            label="Afinidad"
            value={`${Math.round(item.affinityPct * 100)}%`}
          />
        </YStack>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ── Sort options ─────────────────────────────────────────────────────────────

type StagnantSort = "capital" | "days" | "drop" | "name";
type DiscountSort = "viability" | "discount" | "potential" | "name";
type ComboSort = "affinity" | "discount" | "name";

// ── Section: Stagnant ─────────────────────────────────────────────────────────

function StagnantSection({
  items,
  discountMap,
  onApply,
}: {
  items: StagnantProduct[];
  discountMap: Map<number, DiscountOpportunity>;
  onApply: (item: DiscountOpportunity) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StagnantStatus | "all">("all");
  const [sortKey, setSortKey] = useState<StagnantSort>("capital");
  const [sortAsc, setSortAsc] = useState(false);

  const SORT_OPTS: { key: StagnantSort; label: string }[] = [
    { key: "capital", label: "Capital" },
    { key: "days", label: "Días sin venta" },
    { key: "drop", label: "Caída" },
    { key: "name", label: "Nombre" },
  ];

  function handleSort(key: StagnantSort) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "all") r = r.filter((i) => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.product.name.toLowerCase().includes(q));
    }
    const dir = sortAsc ? 1 : -1;
    return [...r].sort((a, b) => {
      if (sortKey === "capital")
        return dir * (a.capitalLocked - b.capitalLocked);
      if (sortKey === "days") {
        const da = a.daysSinceLastSale ?? 99999;
        const db2 = b.daysSinceLastSale ?? 99999;
        return dir * (da - db2);
      }
      if (sortKey === "drop") return dir * (a.velocityDrop - b.velocityDrop);
      return dir * a.product.name.localeCompare(b.product.name);
    });
  }, [items, filter, search, sortKey, sortAsc]);

  if (items.length === 0) {
    return (
      <YStack py="$8" style={{ alignItems: "center" }} gap="$3">
        <Text fontSize={40}>🎉</Text>
        <Text fontSize="$4" fontWeight="700" color="$color">
          Todo se está vendiendo
        </Text>
        <Text color="$color10" style={{ textAlign: "center" }} px="$6">
          No hay productos estancados. ¡Buen trabajo!
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 8,
          paddingBottom: 8,
        }}
      >
        {(["all", "no_sales", "heavy_drop", "slowing"] as const).map((f) => {
          const active = filter === f;
          return (
            <Button
              key={f}
              size="$2"
              chromeless={!active}
              theme={active ? "blue" : undefined}
              onPress={() => setFilter(f)}
            >
              <Text fontSize="$2">
                {f === "all"
                  ? `Todos (${items.length})`
                  : f === "no_sales"
                  ? `🔴 Sin ventas`
                  : f === "heavy_drop"
                  ? `🟠 Caída fuerte`
                  : `🟡 Desacelerando`}
              </Text>
            </Button>
          );
        })}
      </ScrollView>

      {/* Search */}
      <YStack px="$4" pb="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
      </YStack>

      {/* Sort pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 6,
          paddingBottom: 8,
        }}
      >
        {SORT_OPTS.map((opt) => (
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
      </ScrollView>

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
            {filtered.map((item) => {
              const disc = discountMap.get(item.product.id);
              return (
                <StagnantRow
                  key={item.product.id}
                  item={item}
                  discount={disc}
                  onApply={disc ? () => onApply(disc) : undefined}
                />
              );
            })}
          </Accordion>
        </Card>
      </YStack>
    </ScrollView>
  );
}

// ── Section: Discounts ────────────────────────────────────────────────────────

function DiscountSection({
  items,
  onApply,
}: {
  items: DiscountOpportunity[];
  onApply: (item: DiscountOpportunity) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "possible" | "tight" | "none">(
    "all",
  );
  const [sortKey, setSortKey] = useState<DiscountSort>("viability");
  const [sortAsc, setSortAsc] = useState(false);

  const SORT_OPTS: { key: DiscountSort; label: string }[] = [
    { key: "viability", label: "Viabilidad" },
    { key: "discount", label: "Descuento %" },
    { key: "potential", label: "Potencial" },
    { key: "name", label: "Nombre" },
  ];

  function handleSort(key: DiscountSort) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "all") r = r.filter((i) => i.viability === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.product.name.toLowerCase().includes(q));
    }
    const dir = sortAsc ? 1 : -1;
    return [...r].sort((a, b) => {
      if (sortKey === "viability") {
        const rank = { possible: 0, tight: 1, none: 2 };
        return dir * (rank[a.viability] - rank[b.viability]);
      }
      if (sortKey === "discount") return dir * (a.discountPct - b.discountPct);
      if (sortKey === "potential")
        return dir * (a.potentialMonthlyRevenue - b.potentialMonthlyRevenue);
      return dir * a.product.name.localeCompare(b.product.name);
    });
  }, [items, filter, search, sortKey, sortAsc]);

  if (items.length === 0) {
    return (
      <YStack py="$8" style={{ alignItems: "center" }} gap="$3">
        <Text fontSize={40}>💰</Text>
        <Text fontSize="$4" fontWeight="700" color="$color">
          Sin oportunidades de descuento
        </Text>
        <Text color="$color10" style={{ textAlign: "center" }} px="$6">
          No hay productos estancados con margen suficiente para ofrecer
          descuento.
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 8,
          paddingBottom: 8,
        }}
      >
        {(["all", "possible", "tight", "none"] as const).map((f) => {
          const active = filter === f;
          return (
            <Button
              key={f}
              size="$2"
              chromeless={!active}
              theme={active ? "blue" : undefined}
              onPress={() => setFilter(f)}
            >
              <Text fontSize="$2">
                {f === "all"
                  ? `Todos (${items.length})`
                  : f === "possible"
                  ? `✅ Posible`
                  : f === "tight"
                  ? `⚠️ Justo`
                  : `🚫 Sin margen`}
              </Text>
            </Button>
          );
        })}
      </ScrollView>

      {/* Search */}
      <YStack px="$4" pb="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
      </YStack>

      {/* Sort pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 6,
          paddingBottom: 8,
        }}
      >
        {SORT_OPTS.map((opt) => (
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
      </ScrollView>

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
            {filtered.map((item) => (
              <DiscountRow
                key={item.product.id}
                item={item}
                onApply={() => onApply(item)}
              />
            ))}
          </Accordion>
        </Card>
      </YStack>
    </ScrollView>
  );
}

// ── Section: Combos ───────────────────────────────────────────────────────────

function ComboSection({ items }: { items: ComboSuggestion[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ComboSort>("affinity");
  const [sortAsc, setSortAsc] = useState(false);

  const SORT_OPTS: { key: ComboSort; label: string }[] = [
    { key: "affinity", label: "Afinidad" },
    { key: "discount", label: "Descuento combo" },
    { key: "name", label: "Nombre" },
  ];

  function handleSort(key: ComboSort) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (i) =>
          i.anchorProduct.name.toLowerCase().includes(q) ||
          i.partnerProduct.name.toLowerCase().includes(q),
      );
    }
    const dir = sortAsc ? 1 : -1;
    return [...r].sort((a, b) => {
      if (sortKey === "affinity") return dir * (a.affinityPct - b.affinityPct);
      if (sortKey === "discount") return dir * (a.comboPct - b.comboPct);
      return dir * a.anchorProduct.name.localeCompare(b.anchorProduct.name);
    });
  }, [items, search, sortKey, sortAsc]);

  if (items.length === 0) {
    return (
      <YStack py="$8" style={{ alignItems: "center" }} gap="$3">
        <Text fontSize={40}>🔗</Text>
        <Text fontSize="$4" fontWeight="700" color="$color">
          Sin combos detectados
        </Text>
        <Text color="$color10" style={{ textAlign: "center" }} px="$6">
          No hay suficientes co-compras registradas entre productos estancados y
          populares.
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      {/* Search */}
      <YStack px="$4" pb="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
      </YStack>

      {/* Sort pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 6,
          paddingBottom: 8,
        }}
      >
        {SORT_OPTS.map((opt) => (
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
      </ScrollView>

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
            {filtered.map((item) => (
              <ComboRow
                key={`${item.anchorProduct.id}-${item.partnerProduct.id}`}
                item={item}
              />
            ))}
          </Accordion>
        </Card>
      </YStack>
    </ScrollView>
  );
}

// ── Inner tab bar ─────────────────────────────────────────────────────────────

type InnerTab = "stagnant" | "discounts" | "combos";

const INNER_TABS: { key: InnerTab; label: string; emoji: string }[] = [
  { key: "stagnant", label: "Estancados", emoji: "🔴" },
  { key: "discounts", label: "Descuentos", emoji: "🏷️" },
  { key: "combos", label: "Combos", emoji: "🔗" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function SalesAnalysisSection({
  onPricesUpdated,
}: {
  onPricesUpdated: () => void;
}) {
  const db = useSQLiteContext();
  const { currentStore } = useStore();
  const productRepo = useProductRepository();
  const c = useColors();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InnerTab>("stagnant");
  const [applying, setApplying] = useState(false);

  const discountMap = useMemo(() => {
    if (!report) return new Map<number, DiscountOpportunity>();
    return new Map(report.discounts.map((d) => [d.product.id, d]));
  }, [report]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await runSalesAnalysis(db, currentStore?.id);
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [db, currentStore]);

  const applyDiscount = useCallback(
    async (item: DiscountOpportunity) => {
      await productRepo.bulkUpdateSalePrice([
        { id: item.product.id, salePrice: item.suggestedPrice },
      ]);
      if (report) {
        setReport({
          ...report,
          discounts: report.discounts.map((d) =>
            d.product.id === item.product.id
              ? {
                  ...d,
                  product: { ...d.product, salePrice: item.suggestedPrice },
                  currentPrice: item.suggestedPrice,
                }
              : d,
          ),
        });
      }
      onPricesUpdated();
      Alert.alert(
        "Listo",
        `Precio de ${item.product.name} actualizado a $${fmtMoney(
          item.suggestedPrice,
        )}`,
      );
    },
    [productRepo, report, onPricesUpdated],
  );

  const applyAllDiscounts = useCallback(async () => {
    if (!report) return;
    const updates = report.discounts
      .filter(
        (d) =>
          d.viability !== "none" &&
          Math.abs(d.suggestedPrice - d.currentPrice) > 0.01,
      )
      .map((d) => ({ id: d.product.id, salePrice: d.suggestedPrice }));

    if (updates.length === 0) {
      Alert.alert("Info", "No hay descuentos aplicables.");
      return;
    }

    Alert.alert(
      "Aplicar descuentos",
      `Se actualizará el precio de ${updates.length} producto${
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
              const r = await runSalesAnalysis(db, currentStore?.id);
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
  }, [report, productRepo, db, onPricesUpdated]);

  // Auto-load on mount
  useMemo(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: "center", alignItems: "center" }}
        gap="$3"
      >
        <Spinner size="large" color="$blue10" />
        <Text color="$color10">Analizando ventas…</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: "center", alignItems: "center" }}
        p="$6"
        gap="$4"
      >
        <TrendingDown size={48} color="$red10" />
        <Text
          fontSize="$4"
          fontWeight="700"
          color="$color"
          style={{ textAlign: "center" }}
        >
          Error al analizar
        </Text>
        <Text color="$color10" style={{ textAlign: "center" }}>
          {error}
        </Text>
        <Button onPress={load} theme="blue">
          Reintentar
        </Button>
      </YStack>
    );
  }

  if (!report) return null;

  return (
    <YStack flex={1} bg="$background">
      {/* KPI summary */}
      <XStack px="$4" pt="$2" pb="$2" gap="$2" flexWrap="wrap">
        <KpiCard
          label="Capital bloqueado"
          value={`$${fmtMoney(report.totalCapitalLocked)}`}
          color={c.danger}
        />
        <KpiCard
          label="Sin movimiento"
          value={String(report.noSalesCount)}
          color={c.orange}
        />
        <KpiCard
          label="Potencial/mes"
          value={`$${fmtMoney(report.totalPotentialRevenue)}`}
          color={c.green}
        />
        <KpiCard label="Combos" value={String(report.combosCount)} />
      </XStack>

      {/* Inner tab pills */}
      <XStack px="$4" pb="$2" gap="$2">
        {INNER_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Button
              key={t.key}
              size="$2"
              chromeless={!active}
              theme={active ? "blue" : undefined}
              onPress={() => setTab(t.key)}
            >
              <Text fontSize="$2">
                {t.emoji} {t.label}
              </Text>
            </Button>
          );
        })}
      </XStack>

      {/* Section content */}
      {tab === "stagnant" && (
        <>
          <StagnantSection
            items={report.stagnant}
            discountMap={discountMap}
            onApply={applyDiscount}
          />
          {report.discounts.some((d) => d.viability !== "none") && (
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
                onPress={applyAllDiscounts}
              >
                <Text>Aplicar todos los descuentos</Text>
              </Button>
            </YStack>
          )}
        </>
      )}
      {tab === "discounts" && (
        <>
          <DiscountSection items={report.discounts} onApply={applyDiscount} />
          {report.discounts.some((d) => d.viability !== "none") && (
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
                onPress={applyAllDiscounts}
              >
                <Text>Aplicar todos los descuentos</Text>
              </Button>
            </YStack>
          )}
        </>
      )}
      {tab === "combos" && <ComboSection items={report.combos} />}
    </YStack>
  );
}
