import { SearchInput } from "@/components/ui/search-input";
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
    ChevronDown,
    Package,
    Tag,
    TrendingDown,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Image, ScrollView } from "react-native";
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
  no_sales: { label: "Sin ventas", color: "#ef4444", emoji: "🔴" },
  heavy_drop: { label: "Caída fuerte", color: "#f97316", emoji: "🟠" },
  slowing: { label: "Desacelerando", color: "#eab308", emoji: "🟡" },
};

const DISCOUNT_META: Record<
  "possible" | "tight" | "none",
  { label: string; color: string; emoji: string }
> = {
  possible: { label: "Descuento posible", color: "#22c55e", emoji: "✅" },
  tight: { label: "Margen justo", color: "#f59e0b", emoji: "⚠️" },
  none: { label: "Sin margen", color: "#6b7280", emoji: "🚫" },
};

const AFFINITY_META: Record<
  ComboAffinity,
  { label: string; color: string; emoji: string }
> = {
  high: { label: "Alta afinidad", color: "#22c55e", emoji: "💚" },
  medium: { label: "Media", color: "#f59e0b", emoji: "💛" },
  low: { label: "Baja", color: "#6b7280", emoji: "⚪" },
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
        backgroundColor: "#88888822",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Package size={size * 0.55} color="$color8" />
    </YStack>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card
      flex={1}
      p="$3"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$color2"
    >
      <Text fontSize="$1" color="$color10" numberOfLines={1}>
        {label}
      </Text>
      <Text
        fontSize="$5"
        fontWeight="800"
        color={(color ?? "$color") as any}
        mt="$1"
      >
        {value}
      </Text>
      {sub ? (
        <Text fontSize="$1" color="$color10" mt="$0.5">
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

// ── Row: Stagnant ─────────────────────────────────────────────────────────────

function StagnantRow({ item }: { item: StagnantProduct }) {
  const p = item.product;
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
            color="#ef4444"
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
            color={item.recentUnits < item.olderUnits ? "#ef4444" : "$color"}
          />
          {item.velocityDrop > 0 && (
            <DetailRow
              label="Caída de velocidad"
              value={`${Math.round(item.velocityDrop * 100)}%`}
              color="#ef4444"
            />
          )}
        </YStack>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ── Row: Discount ─────────────────────────────────────────────────────────────

function DiscountRow({ item }: { item: DiscountOpportunity }) {
  const p = item.product;
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
            color="#22c55e"
          />
          <DetailRow
            label="Descuento"
            value={`${Math.round(item.discountPct * 100)}%`}
            color="#f97316"
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
            color="#22c55e"
          />
        </YStack>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ── Row: Combo ────────────────────────────────────────────────────────────────

function ComboRow({ item }: { item: ComboSuggestion }) {
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
            color="#22c55e"
          />
          <DetailRow
            label="Ahorro para el cliente"
            value={`${Math.round(item.comboPct * 100)}%`}
            color="#f97316"
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

function StagnantSection({ items }: { items: StagnantProduct[] }) {
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
    <YStack>
      <YStack px="$4" pt="$3" pb="$2" gap="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
        {/* Filter pills */}
        <XStack pb="$1" gap="$2" flexWrap="wrap">
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
        </XStack>
        {/* Sort pills */}
        <XStack pb="$1" gap="$1.5" flexWrap="wrap">
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
                fontSize="$1"
                color={sortKey === opt.key ? "$blue10" : "$color10"}
              >
                {opt.label}
              </Text>
            </Button>
          ))}
        </XStack>
      </YStack>
      <Accordion type="multiple">
        {filtered.map((item) => (
          <StagnantRow key={item.product.id} item={item} />
        ))}
      </Accordion>
    </YStack>
  );
}

// ── Section: Discounts ────────────────────────────────────────────────────────

function DiscountSection({ items }: { items: DiscountOpportunity[] }) {
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
    <YStack>
      <YStack px="$4" pt="$3" pb="$2" gap="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
        {/* Filter pills */}
        <XStack pb="$1" gap="$2" flexWrap="wrap">
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
        </XStack>
        {/* Sort pills */}
        <XStack pb="$1" gap="$1.5" flexWrap="wrap">
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
                fontSize="$1"
                color={sortKey === opt.key ? "$blue10" : "$color10"}
              >
                {opt.label}
              </Text>
            </Button>
          ))}
        </XStack>
      </YStack>
      <Accordion type="multiple">
        {filtered.map((item) => (
          <DiscountRow key={item.product.id} item={item} />
        ))}
      </Accordion>
    </YStack>
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
    <YStack>
      <YStack px="$4" pt="$3" pb="$2" gap="$2">
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto…"
        />
        {/* Sort pills */}
        <XStack pb="$1" gap="$1.5" flexWrap="wrap">
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
                fontSize="$1"
                color={sortKey === opt.key ? "$blue10" : "$color10"}
              >
                {opt.label}
              </Text>
            </Button>
          ))}
        </XStack>
      </YStack>
      <Accordion type="multiple">
        {filtered.map((item) => (
          <ComboRow
            key={`${item.anchorProduct.id}-${item.partnerProduct.id}`}
            item={item}
          />
        ))}
      </Accordion>
    </YStack>
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

export function SalesAnalysisSection() {
  const db = useSQLiteContext();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InnerTab>("stagnant");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await runSalesAnalysis(db);
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [db]);

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
    <ScrollView>
      {/* KPI summary */}
      <YStack px="$4" pt="$3" pb="$2" gap="$3">
        <XStack gap="$2">
          <KpiCard
            label="Capital bloqueado"
            value={`$${fmtMoney(report.totalCapitalLocked)}`}
            sub={`${report.stagnant.length} productos`}
            color="#ef4444"
          />
          <KpiCard
            label="Sin movimiento"
            value={String(report.noSalesCount)}
            sub="nunca vendidos"
            color="#f97316"
          />
        </XStack>
        <XStack gap="$2">
          <KpiCard
            label="Potencial mensual"
            value={`$${fmtMoney(report.totalPotentialRevenue)}`}
            sub="si reactivan"
            color="#22c55e"
          />
          <KpiCard
            label="Combos detectados"
            value={String(report.combosCount)}
            sub={`${report.monthsAnalysed} meses analizados`}
          />
        </XStack>

        {/* Refresh */}
        <Button size="$3" onPress={load} icon={TrendingDown} bg="$color3">
          Actualizar análisis
        </Button>
      </YStack>

      {/* Inner tab pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack px="$4" gap="$2" pb="$2">
          {INNER_TABS.map((t) => (
            <Button
              key={t.key}
              size="$3"
              onPress={() => setTab(t.key)}
              bg={tab === t.key ? "$blue10" : "$color3"}
              style={{ borderRadius: 20 }}
              px="$4"
              icon={
                t.key === "stagnant"
                  ? Package
                  : t.key === "discounts"
                    ? Tag
                    : undefined
              }
            >
              {t.emoji} {t.label}
            </Button>
          ))}
        </XStack>
      </ScrollView>

      {/* Section content */}
      {tab === "stagnant" && <StagnantSection items={report.stagnant} />}
      {tab === "discounts" && <DiscountSection items={report.discounts} />}
      {tab === "combos" && <ComboSection items={report.combos} />}
    </ScrollView>
  );
}
