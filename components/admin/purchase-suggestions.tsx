import { SearchInput } from "@/components/ui/search-input";
import { BLUE_TINT, TREND_COLORS, URGENCY_COLORS } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { fmtMoney } from "@/utils/format";
import type {
    PurchaseReport,
    PurchaseSuggestion,
    SalesTrend,
    Urgency,
} from "@/utils/purchase-suggestions";
import { runPurchaseSuggestions } from "@/utils/purchase-suggestions";
import {
    ArrowUpDown,
    ChevronDown,
    Package,
    ShoppingCart,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Image, ScrollView } from "react-native";
import {
    Accordion,
    Button,
    Card,
    Input,
    Label,
    Separator,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

// ── Urgency helpers ──────────────────────────────────────────────────────────

const URGENCY_META: Record<
  Urgency,
  { label: string; color: string; emoji: string }
> = {
  critical: { label: "Crítico", color: URGENCY_COLORS.critical, emoji: "🔴" },
  low: { label: "Bajo", color: URGENCY_COLORS.low, emoji: "🟡" },
  ok: { label: "Bien", color: URGENCY_COLORS.ok, emoji: "🟢" },
  overstock: { label: "Exceso", color: URGENCY_COLORS.overstock, emoji: "🟣" },
};

const TREND_META: Record<
  SalesTrend,
  { label: string; emoji: string; color: string }
> = {
  rising: { label: "Subiendo", emoji: "📈", color: TREND_COLORS.rising },
  stable: { label: "Estable", emoji: "➡️", color: TREND_COLORS.stable },
  falling: { label: "Bajando", emoji: "📉", color: TREND_COLORS.falling },
};

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const meta = URGENCY_META[urgency];
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

function TrendBadge({ trend }: { trend: SalesTrend }) {
  const meta = TREND_META[trend];
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

// ── Detail row helper ────────────────────────────────────────────────────────

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

// ── Suggestion row ───────────────────────────────────────────────────────────

function SuggestionRow({ item }: { item: PurchaseSuggestion }) {
  const p = item.product;
  const daysStr =
    item.daysOfStock === Infinity ? "∞" : item.daysOfStock.toFixed(1);

  return (
    <Accordion.Item
      value={String(p.id)}
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Accordion.Trigger
        flexDirection="row"
        px="$3"
        py="$3"
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
                style={{ width: 36, height: 36, borderRadius: 8 }}
                resizeMode="cover"
              />
            ) : (
              <YStack
                width={36}
                height={36}
                style={{
                  borderRadius: 8,
                  backgroundColor: "#e5e7eb",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Package size={16} color="$color8" />
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
                <UrgencyBadge urgency={item.urgency} />
                <TrendBadge trend={item.salesTrend} />
              </XStack>
            </YStack>

            <YStack style={{ alignItems: "flex-end" }} gap="$0.5">
              {item.suggestedQty > 0 ? (
                <>
                  <Text fontSize="$3" fontWeight="bold" color="$blue10">
                    {`+${item.suggestedQty}`}
                  </Text>
                  <Text fontSize="$1" color="$color10">
                    {`$${fmtMoney(item.estimatedCost)}`}
                  </Text>
                </>
              ) : (
                <Text fontSize="$2" color="$green10" fontWeight="600">
                  OK
                </Text>
              )}
              <Text fontSize="$1" color="$color8">
                {`P: ${item.priorityScore}`}
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
          {/* Recommendation banner */}
          <YStack
            p="$2"
            style={{
              borderRadius: 8,
              backgroundColor: BLUE_TINT,
            }}
          >
            <Text fontSize="$2" color="$blue10" fontWeight="500">
              {item.recommendation}
            </Text>
          </YStack>

          <DetailRow label="Stock actual" value={`${item.currentStock}`} />
          <DetailRow
            label="Venta diaria (prom.)"
            value={`${item.dailySalesRate.toFixed(2)} uds/día`}
          />
          <DetailRow
            label="Venta ajustada (tendencia)"
            value={`${item.adjustedDailyRate.toFixed(2)} uds/día`}
            color={
              item.salesTrend === "rising"
                ? "#22c55e"
                : item.salesTrend === "falling"
                ? "#ef4444"
                : undefined
            }
          />
          <DetailRow label="Días de stock" value={daysStr} />
          <DetailRow
            label="Tendencia"
            value={`${
              TREND_META[item.salesTrend].emoji
            } ${item.trendFactor.toFixed(2)}x`}
          />

          <Separator my="$1" />

          <DetailRow
            label="Costo unitario prom."
            value={`$${fmtMoney(item.avgUnitCost)}`}
          />
          <DetailRow
            label="Margen bruto"
            value={`${(item.marginPct * 100).toFixed(1)}%`}
            color={
              item.marginPct >= 0.2
                ? "#22c55e"
                : item.marginPct >= 0.1
                ? "#f59e0b"
                : "#ef4444"
            }
          />
          <DetailRow
            label="Ganancia/unidad"
            value={`$${fmtMoney(item.profitPerUnit)}`}
          />
          <DetailRow
            label="ROI"
            value={`${(item.roi * 100).toFixed(1)}%`}
            color={
              item.roi >= 0.3
                ? "#22c55e"
                : item.roi >= 0.15
                ? "#f59e0b"
                : "#ef4444"
            }
          />
          <DetailRow
            label="Aporte a ingresos"
            value={`${(item.revenueShare * 100).toFixed(1)}%`}
          />
          <DetailRow
            label="Rotación anual"
            value={`${item.stockTurnover.toFixed(1)}x`}
            color={
              item.stockTurnover >= 12
                ? "#22c55e"
                : item.stockTurnover >= 4
                ? "#f59e0b"
                : "#ef4444"
            }
          />

          {item.suggestedQty > 0 && (
            <>
              <Separator my="$1" />
              <DetailRow
                label="Compra sugerida"
                value={`${item.suggestedQty} uds → $${fmtMoney(
                  item.estimatedCost,
                )}`}
                color="#3b82f6"
              />
            </>
          )}
        </Accordion.Content>
      </Accordion.HeightAnimator>
    </Accordion.Item>
  );
}

// ── Sort options ─────────────────────────────────────────────────────────────

type SortKey =
  | "priority"
  | "urgency"
  | "name"
  | "daysOfStock"
  | "roi"
  | "trend"
  | "cost";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Prioridad" },
  { key: "urgency", label: "Urgencia" },
  { key: "roi", label: "ROI" },
  { key: "trend", label: "Tendencia" },
  { key: "daysOfStock", label: "Días stock" },
  { key: "name", label: "Nombre" },
  { key: "cost", label: "Costo" },
];

const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 0,
  low: 1,
  ok: 2,
  overstock: 3,
};

const TREND_ORDER: Record<SalesTrend, number> = {
  rising: 0,
  stable: 1,
  falling: 2,
};

// ── Section ──────────────────────────────────────────────────────────────────

export function PurchaseSuggestionsSection() {
  const db = useSQLiteContext();
  const { currentStore } = useStore();

  const [targetDaysInput, setTargetDaysInput] = useState("15");
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<Urgency | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const analyse = useCallback(async () => {
    const targetDays = parseInt(targetDaysInput, 10);
    if (isNaN(targetDays) || targetDays < 1) return;
    setLoading(true);
    try {
      const r = await runPurchaseSuggestions(db, targetDays, currentStore?.id);
      setReport(r);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [db, targetDaysInput, currentStore]);

  // Sort + filter + search
  const sorted = useMemo(() => {
    if (!report) return [];
    let items = [...report.suggestions];
    if (filterUrgency) {
      items = items.filter((i) => i.urgency === filterUrgency);
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
        case "priority":
          cmp = b.priorityScore - a.priorityScore; // higher first by default
          break;
        case "urgency":
          cmp = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
          break;
        case "roi":
          cmp = b.roi - a.roi; // higher first by default
          break;
        case "trend":
          cmp = TREND_ORDER[a.salesTrend] - TREND_ORDER[b.salesTrend];
          break;
        case "name":
          cmp = a.product.name.localeCompare(b.product.name);
          break;
        case "daysOfStock":
          cmp =
            (a.daysOfStock === Infinity ? 9999 : a.daysOfStock) -
            (b.daysOfStock === Infinity ? 9999 : b.daysOfStock);
          break;
        case "cost":
          cmp = a.estimatedCost - b.estimatedCost;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [report, sortKey, sortAsc, filterUrgency, searchQuery]);

  // Urgency counts
  const urgencyCounts = useMemo(() => {
    if (!report) return {} as Record<Urgency, number>;
    const counts: Record<Urgency, number> = {
      critical: 0,
      low: 0,
      ok: 0,
      overstock: 0,
    };
    for (const s of report.suggestions) counts[s.urgency]++;
    return counts;
  }, [report]);

  const needPurchase = useMemo(
    () => (report?.suggestions ?? []).filter((s) => s.suggestedQty > 0).length,
    [report],
  );

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
            Meta de stock (días)
          </Label>
          <Input
            size="$3"
            value={targetDaysInput}
            onChangeText={setTargetDaysInput}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder="15"
          />
        </YStack>
        <Button
          size="$3"
          theme="blue"
          onPress={analyse}
          disabled={loading}
          icon={loading ? <Spinner /> : ShoppingCart}
        >
          <Text>Analizar</Text>
        </Button>
      </XStack>

      {/* Results */}
      {report && (
        <YStack flex={1}>
          {/* KPIs */}
          <XStack px="$4" pb="$2" gap="$2" flexWrap="wrap">
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                Requieren compra
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$orange10">
                {needPurchase}
              </Text>
            </Card>
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                Críticos
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$red10">
                {report.criticalCount}
              </Text>
            </Card>
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                En alza
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$green10">
                {report.risingCount}
              </Text>
            </Card>
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                Costo estimado
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$blue10">
                {`$${fmtMoney(report.totalEstimatedCost)}`}
              </Text>
            </Card>
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                ROI promedio
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$purple10">
                {`${(report.avgRoi * 100).toFixed(1)}%`}
              </Text>
            </Card>
            <Card
              flex={1}
              p="$2"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              minWidth={100}
              style={{ borderRadius: 10 }}
            >
              <Text fontSize="$1" color="$color10">
                Días analizados
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$color">
                {report.analysedDays}
              </Text>
            </Card>
          </XStack>

          {/* Urgency filter pills */}
          <XStack px="$4" pb="$2" gap="$2" flexWrap="wrap">
            {(["critical", "low", "ok", "overstock"] as const).map((u) => {
              const meta = URGENCY_META[u];
              const active = filterUrgency === u;
              return (
                <Button
                  key={u}
                  size="$2"
                  chromeless={!active}
                  theme={active ? "blue" : undefined}
                  onPress={() => setFilterUrgency(active ? null : u)}
                >
                  <Text fontSize="$2">{`${meta.emoji} ${meta.label} (${urgencyCounts[u]})`}</Text>
                </Button>
              );
            })}
          </XStack>

          {/* Search */}
          <YStack px="$4" pb="$2">
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar producto…"
            />
          </YStack>

          {/* Sort row */}
          <XStack px="$4" pb="$2" gap="$1.5" flexWrap="wrap">
            {SORT_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                size="$2"
                chromeless
                onPress={() => {
                  if (sortKey === opt.key) setSortAsc(!sortAsc);
                  else {
                    setSortKey(opt.key);
                    setSortAsc(true);
                  }
                }}
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

          {/* Product list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {sorted.length === 0 ? (
              <YStack p="$6" style={{ alignItems: "center" }} gap="$2">
                <ShoppingCart size={40} color="$color8" />
                <Text color="$color10">No hay productos con ese filtro</Text>
              </YStack>
            ) : (
              <Accordion type="single" collapsible overflow="hidden">
                {sorted.map((item) => (
                  <SuggestionRow key={item.product.id} item={item} />
                ))}
              </Accordion>
            )}
          </ScrollView>
        </YStack>
      )}

      {!report && !loading && (
        <YStack
          flex={1}
          style={{ justifyContent: "center", alignItems: "center" }}
          gap="$3"
          p="$8"
        >
          <ShoppingCart size={56} color="$color8" />
          <Text fontSize="$4" color="$color10" style={{ textAlign: "center" }}>
            Configura la meta de stock y presiona &quot;Analizar&quot; para ver
            las sugerencias de compra.
          </Text>
        </YStack>
      )}
    </YStack>
  );
}
