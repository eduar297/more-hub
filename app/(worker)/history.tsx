import { PeriodSelector } from "@/components/admin/period-selector";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import { fmtMoney, weekEndISO } from "@/utils/format";
import {
    Banknote,
    ClipboardList,
    CreditCard,
    Package,
    Receipt,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, ScrollView } from "react-native";
import { Card, Separator, Sheet, Spinner, Text, XStack, YStack } from "tamagui";

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

function TicketRow({
  ticket,
  onPress,
}: {
  ticket: Ticket;
  onPress: () => void;
}) {
  const PayIcon = ticket.paymentMethod === "CARD" ? CreditCard : Banknote;
  const voided = ticket.status === "VOIDED";
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
            Ticket #{ticket.id}
          </Text>
          {voided && (
            <YStack bg="$red3" px="$1.5" py="$0.5" style={{ borderRadius: 4 }}>
              <Text fontSize={9} fontWeight="700" color="$red10">
                ANULADO
              </Text>
            </YStack>
          )}
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

  // Period state
  const nav = usePeriodNavigation();

  // Data
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalSales: 0, ticketCount: 0 });

  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  // ── Load data (worker-scoped) ───────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let from: string;
      let to: string;
      if (nav.period === "day") {
        from = to = nav.selectedDay;
      } else if (nav.period === "week") {
        from = nav.selectedWeekStart;
        to = weekEndISO(nav.selectedWeekStart);
      } else if (nav.period === "month") {
        const [y, m] = nav.selectedMonth.split("-").map(Number);
        from = `${nav.selectedMonth}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        to = `${nav.selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      } else if (nav.period === "year") {
        from = `${nav.selectedYear}-01-01`;
        to = `${nav.selectedYear}-12-31`;
      } else {
        from = nav.dateRange.from;
        to = nav.dateRange.to;
      }
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
  }, [
    ticketRepo,
    user,
    nav.period,
    nav.selectedDay,
    nav.selectedMonth,
    nav.selectedYear,
    nav.selectedWeekStart,
    nav.dateRange,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets]),
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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
      <Card
        mx="$4"
        mt="$3"
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
          data={allTickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: ticket }) => (
            <TicketRow ticket={ticket} onPress={() => openDetail(ticket)} />
          )}
          ItemSeparatorComponent={() => <Separator />}
          ListEmptyComponent={
            loading ? (
              <YStack p="$6" style={{ alignItems: "center" }} gap="$3">
                <Spinner size="large" color="$green10" />
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
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame p="$4" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
            {selectedTicket && (
              <YStack gap="$4">
                <Text fontSize="$6" fontWeight="bold" color="$color">
                  Ticket #{selectedTicket.id}
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
                          {item.barcode && (
                            <Text
                              fontSize="$1"
                              color="$color9"
                              numberOfLines={1}
                            >
                              {item.barcode}
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
