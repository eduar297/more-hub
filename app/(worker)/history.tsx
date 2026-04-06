import { PeriodSelector } from "@/components/admin/period-selector";
import { OVERLAY } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import { daysInMonth, fmtMoney, weekEndISO } from "@/utils/format";
import {
  Banknote,
  Check,
  ClipboardList,
  Clock,
  CreditCard,
  Package,
  Receipt,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView } from "react-native";
import {
  Card,
  Separator,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
  useTheme,
} from "tamagui";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type SyncFilter = "all" | "pending" | "synced";

const SYNC_FILTERS: { key: SyncFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "synced", label: "Sincronizados" },
];

function SyncFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: SyncFilter;
  onChange: (f: SyncFilter) => void;
  counts: { all: number; pending: number; synced: number };
}) {
  const theme = useTheme();
  return (
    <XStack
      bg="$color2"
      style={{ borderRadius: 10 }}
      p="$1"
      gap={4}
      height={34}
    >
      {SYNC_FILTERS.map(({ key, label }) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={{
              flex: 1,
              borderRadius: 8,
              backgroundColor: active
                ? key === "pending"
                  ? theme.orange10?.val
                  : key === "synced"
                  ? theme.green10?.val
                  : theme.blue10?.val
                : "transparent",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 4,
            }}
          >
            <Text
              fontSize={11}
              fontWeight="700"
              color={active ? "white" : "$color10"}
            >
              {label}
            </Text>
            <Text
              fontSize={10}
              fontWeight="600"
              color={active ? "white" : "$color8"}
            >
              {counts[key]}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

function TicketRow({
  ticket,
  onPress,
}: {
  ticket: Ticket;
  onPress: () => void;
}) {
  const PayIcon = ticket.paymentMethod === "CARD" ? CreditCard : Banknote;
  const voided = ticket.status === "VOIDED";
  const synced = !!ticket.syncedAt;
  return (
    <XStack
      px="$4"
      py="$3"
      style={{ alignItems: "center" }}
      gap="$3"
      pressStyle={{ bg: "$color2" }}
      onPress={onPress}
      opacity={voided ? 0.5 : 1}
    >
      <YStack
        width={36}
        height={36}
        style={{
          borderRadius: 18,
          backgroundColor:
            ticket.paymentMethod === "CASH" ? "#dcfce7" : "#dbeafe",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PayIcon
          size={18}
          color={ticket.paymentMethod === "CASH" ? "$green10" : "$blue10"}
        />
      </YStack>
      <YStack flex={1}>
        <XStack style={{ alignItems: "center" }} gap="$2">
          <Text fontSize="$4" fontWeight="bold" color="$color">
            Ticket #{String(ticket.id).slice(0, 8)}
          </Text>
          {voided && (
            <YStack bg="$red3" px="$1.5" py="$0.5" style={{ borderRadius: 4 }}>
              <Text fontSize={9} fontWeight="700" color="$red10">
                ANULADO
              </Text>
            </YStack>
          )}
          <YStack
            bg={synced ? "$green3" : "$orange3"}
            px="$1.5"
            py="$0.5"
            style={{
              borderRadius: 4,
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
            }}
          >
            {synced ? (
              <Check size={9} color="$green10" />
            ) : (
              <Clock size={9} color="$orange10" />
            )}
            <Text
              fontSize={9}
              fontWeight="700"
              color={synced ? "$green10" : "$orange10"}
            >
              {synced ? "Sincronizado" : "Pendiente"}
            </Text>
          </YStack>
        </XStack>
        <XStack style={{ alignItems: "center" }} gap="$2">
          <Text fontSize="$2" color="$color10">
            {ticket.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta"} ·{" "}
            {formatTime(ticket.createdAt)}
          </Text>
        </XStack>
      </YStack>
      <YStack style={{ alignItems: "flex-end" }}>
        <Text
          fontSize="$4"
          fontWeight="600"
          color={voided ? "$red10" : "$green10"}
          style={voided ? { textDecorationLine: "line-through" } : undefined}
        >
          ${fmtMoney(ticket.total)}
        </Text>
        <Text fontSize="$2" color="$color10">
          {ticket.itemCount} {ticket.itemCount === 1 ? "artículo" : "artículos"}
        </Text>
      </YStack>
    </XStack>
  );
}

export default function HistoryScreen() {
  const ticketRepo = useTicketRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const { user } = useAuth();
  const nav = usePeriodNavigation("day");

  // Data
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalSales: 0, ticketCount: 0 });
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");

  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  // ── Compute from/to based on selected period ────────────────────────────
  const { from, to } = useMemo(() => {
    if (nav.period === "day")
      return { from: nav.selectedDay, to: nav.selectedDay };
    if (nav.period === "week")
      return {
        from: nav.selectedWeekStart,
        to: weekEndISO(nav.selectedWeekStart),
      };
    if (nav.period === "month") {
      const last = String(daysInMonth(nav.selectedMonth)).padStart(2, "0");
      return {
        from: `${nav.selectedMonth}-01`,
        to: `${nav.selectedMonth}-${last}`,
      };
    }
    if (nav.period === "year")
      return {
        from: `${nav.selectedYear}-01-01`,
        to: `${nav.selectedYear}-12-31`,
      };
    // range
    return { from: nav.dateRange.from, to: nav.dateRange.to };
  }, [
    nav.period,
    nav.selectedDay,
    nav.selectedWeekStart,
    nav.selectedMonth,
    nav.selectedYear,
    nav.dateRange,
  ]);

  // ── Load data (worker-scoped, period-aware) ─────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        ticketRepo.findByWorkerAndDateRange(user.id, from, to),
        ticketRepo.workerRangeSummary(user.id, from, to),
      ]);
      setAllTickets(list);
      setSummary(stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketRepo, user, from, to]);

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets]),
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // ── Filtered tickets + counts ───────────────────────────────────────────
  const syncCounts = useMemo(() => {
    const pending = allTickets.filter((t) => !t.syncedAt).length;
    const synced = allTickets.filter((t) => !!t.syncedAt).length;
    return { all: allTickets.length, pending, synced };
  }, [allTickets]);

  const filteredTickets = useMemo(() => {
    if (syncFilter === "pending") return allTickets.filter((t) => !t.syncedAt);
    if (syncFilter === "synced") return allTickets.filter((t) => !!t.syncedAt);
    return allTickets;
  }, [allTickets, syncFilter]);

  // ── Detail ──────────────────────────────────────────────────────────────
  const openDetail = useCallback(
    async (ticket: Ticket) => {
      setSelectedTicket(ticket);
      const items = await ticketRepo.findItemsByTicketId(ticket.id);
      setTicketItems(items);
      setShowDetail(true);
    },
    [ticketRepo],
  );

  return (
    <YStack flex={1} bg="$background">
      {/* Period selector */}
      <YStack px="$4" pt="$3" gap="$2">
        <PeriodSelector nav={nav} />
      </YStack>

      {/* Summary cards */}
      <XStack gap="$3" px="$4" pt="$4">
        <Card
          flex={1}
          borderWidth={1}
          bg="$green2"
          p="$4"
          style={{ borderRadius: 14 }}
          borderColor="$green5"
        >
          <TrendingUp size={16} color="$green10" />
          <Text fontSize="$6" fontWeight="bold" color="$green10" mt="$1">
            ${fmtMoney(summary.totalSales)}
          </Text>
          <Text fontSize="$2" color="$color10">
            Total
          </Text>
        </Card>
        <Card
          flex={1}
          borderWidth={1}
          bg="$blue2"
          p="$4"
          style={{ borderRadius: 14 }}
          borderColor="$blue5"
        >
          <Receipt size={16} color="$blue10" />
          <Text fontSize="$6" fontWeight="bold" color="$blue10" mt="$1">
            {summary.ticketCount}
          </Text>
          <Text fontSize="$2" color="$color10">
            Tickets
          </Text>
        </Card>
      </XStack>

      {/* Sync filter */}
      <YStack px="$4" pt="$3">
        <SyncFilterTabs
          value={syncFilter}
          onChange={setSyncFilter}
          counts={syncCounts}
        />
      </YStack>

      {/* Virtualized ticket list */}
      <Card
        mx="$4"
        mt="$4"
        mb="$4"
        flex={1}
        bg="$background"
        borderWidth={1}
        borderColor="$borderColor"
        style={{ borderRadius: 14 }}
        overflow="hidden"
      >
        <FlatList
          data={filteredTickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: ticket }) => (
            <TicketRow ticket={ticket} onPress={() => openDetail(ticket)} />
          )}
          ItemSeparatorComponent={() => <Separator />}
          ListEmptyComponent={
            loading ? (
              <YStack p="$6" style={{ alignItems: "center" }} gap="$3">
                <Spinner size="large" color="$blue10" />
                <Text color="$color10">Cargando...</Text>
              </YStack>
            ) : (
              <YStack p="$6" style={{ alignItems: "center" }} gap="$3">
                <ClipboardList size={44} color="$color8" />
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Sin ventas en este período
                </Text>
                <Text color="$color10" style={{ textAlign: "center" }}>
                  Las ventas registradas desde la pestaña &quot;Ventas&quot;
                  aparecerán aquí.
                </Text>
              </YStack>
            )
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      </Card>

      {/* Ticket detail sheet */}
      <Sheet
        open={showDetail}
        onOpenChange={setShowDetail}
        modal
        snapPoints={[80]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame p="$4" bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
            {selectedTicket && (
              <YStack gap="$4">
                <Text fontSize="$6" fontWeight="bold" color="$color">
                  Ticket #{String(selectedTicket.id).slice(0, 8)}
                </Text>
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    {formatDate(selectedTicket.createdAt)}{" "}
                    {formatTime(selectedTicket.createdAt)}
                  </Text>
                  <XStack style={{ alignItems: "center" }} gap="$1">
                    {selectedTicket.paymentMethod === "CARD" ? (
                      <CreditCard size={16} color="$blue10" />
                    ) : (
                      <Banknote size={16} color="$green10" />
                    )}
                    <Text fontSize="$3" color="$color10">
                      {selectedTicket.paymentMethod === "CASH"
                        ? "Efectivo"
                        : "Tarjeta"}
                    </Text>
                  </XStack>
                </XStack>

                <Card
                  borderWidth={1}
                  borderColor="$borderColor"
                  style={{ borderRadius: 14 }}
                  overflow="hidden"
                  bg="$background"
                >
                  {ticketItems.map((item, idx) => (
                    <YStack key={item.id}>
                      {idx > 0 && <Separator />}
                      <XStack
                        px="$3"
                        py="$2.5"
                        gap="$2.5"
                        style={{ alignItems: "center" }}
                      >
                        {/* Thumbnail */}
                        {item.photoUri ? (
                          <Image
                            source={{ uri: item.photoUri }}
                            style={{ width: 38, height: 38, borderRadius: 6 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <YStack
                            width={38}
                            height={38}
                            style={{
                              borderRadius: 6,
                              backgroundColor: "$color3",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            bg="$color3"
                          >
                            <Package size={18} color="$color8" />
                          </YStack>
                        )}
                        {/* Name + code + prices */}
                        <YStack flex={1} gap="$0.5">
                          <Text
                            fontSize="$2"
                            fontWeight="bold"
                            color="$color"
                            numberOfLines={1}
                          >
                            {item.productName}
                          </Text>
                          {item.code && (
                            <Text
                              fontSize="$1"
                              color="$color9"
                              numberOfLines={1}
                            >
                              {item.code}
                            </Text>
                          )}
                          <XStack gap="$2" style={{ alignItems: "center" }}>
                            <Text fontSize="$1" color="$color10">
                              {item.quantity} × ${item.unitPrice.toFixed(2)}
                            </Text>
                            {item.originalPrice != null &&
                              item.originalPrice !== item.unitPrice && (
                                <Text
                                  fontSize="$1"
                                  color="$color8"
                                  textDecorationLine="line-through"
                                >
                                  ${item.originalPrice.toFixed(2)}
                                </Text>
                              )}
                          </XStack>
                        </YStack>
                        {/* Subtotal */}
                        <Text fontSize="$3" fontWeight="600" color="$green10">
                          ${item.subtotal.toFixed(2)}
                        </Text>
                      </XStack>
                    </YStack>
                  ))}
                </Card>

                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  py="$2"
                >
                  <Text fontSize="$5" fontWeight="bold" color="$color">
                    Total
                  </Text>
                  <Text fontSize="$7" fontWeight="bold" color="$green10">
                    ${selectedTicket.total.toFixed(2)}
                  </Text>
                </XStack>
              </YStack>
            )}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
