import {
    CalendarSheet,
    DateNavigator,
    PeriodTabs,
    type DateRange,
    type Period,
} from "@/components/admin/period-selector";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import {
    currentYear,
    currentYearMonth,
    dayLabel,
    fmtMoney,
    monthLabel,
    rangeLabel,
    shiftDay,
    shiftMonth,
    todayISO,
} from "@/utils/format";
import {
    Banknote,
    ClipboardList,
    CreditCard,
    Receipt,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView } from "react-native";
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
  return (
    <XStack
      px="$4"
      py="$3"
      style={{ alignItems: "center" }}
      gap="$3"
      pressStyle={{ bg: "$color2" }}
      onPress={onPress}
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
        <Text fontSize="$4" fontWeight="bold" color="$color">
          Ticket #{ticket.id}
        </Text>
        <XStack style={{ alignItems: "center" }} gap="$2">
          <Text fontSize="$2" color="$color10">
            {ticket.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta"} ·{" "}
            {formatTime(ticket.createdAt)}
          </Text>
        </XStack>
      </YStack>
      <YStack style={{ alignItems: "flex-end" }}>
        <Text fontSize="$4" fontWeight="600" color="$green10">
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
  const [period, setPeriod] = useState<Period>("day");
  const [selectedDay, setSelectedDay] = useState(() => todayISO());
  const [selectedMonth, setSelectedMonth] = useState(() => currentYearMonth());
  const [selectedYear, setSelectedYear] = useState(() => currentYear());
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: todayISO(),
    to: todayISO(),
  }));
  const [calendarOpen, setCalendarOpen] = useState(false);

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
      if (period === "day") {
        from = to = selectedDay;
      } else if (period === "week" || period === "month") {
        const [y, m] = selectedMonth.split("-").map(Number);
        from = `${selectedMonth}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        to = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      } else if (period === "year") {
        from = `${selectedYear}-01-01`;
        to = `${selectedYear}-12-31`;
      } else {
        from = dateRange.from;
        to = dateRange.to;
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
    period,
    selectedDay,
    selectedMonth,
    selectedYear,
    dateRange,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets]),
  );

  useEffect(() => {
    loadTickets();
  }, [period, selectedDay, selectedMonth, selectedYear, dateRange]); // eslint-disable-line

  // ── Period navigation ───────────────────────────────────────────────────
  const dateLabel = useMemo(() => {
    if (period === "day") return dayLabel(selectedDay);
    if (period === "month" || period === "week")
      return monthLabel(selectedMonth);
    if (period === "year") return selectedYear;
    return rangeLabel(dateRange.from, dateRange.to);
  }, [period, selectedDay, selectedMonth, selectedYear, dateRange]);

  const canGoForward = useMemo(() => {
    if (period === "day") return selectedDay < todayISO();
    if (period === "month" || period === "week")
      return selectedMonth < currentYearMonth();
    if (period === "year")
      return Number(selectedYear) < new Date().getFullYear();
    return false;
  }, [period, selectedDay, selectedMonth, selectedYear]);

  const navigateBack = () => {
    if (period === "day") setSelectedDay((d) => shiftDay(d, -1));
    else if (period === "month" || period === "week")
      setSelectedMonth((m) => shiftMonth(m, -1));
    else if (period === "year") setSelectedYear((y) => String(Number(y) - 1));
  };

  const navigateForward = () => {
    if (period === "day") {
      const next = shiftDay(selectedDay, 1);
      if (next <= todayISO()) setSelectedDay(next);
    } else if (period === "month" || period === "week") {
      const next = shiftMonth(selectedMonth, 1);
      if (next <= currentYearMonth()) setSelectedMonth(next);
    } else if (period === "year") {
      const next = String(Number(selectedYear) + 1);
      if (Number(next) <= new Date().getFullYear()) setSelectedYear(next);
    }
  };

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
          <PeriodTabs period={period} onChangePeriod={setPeriod} />
          <DateNavigator
            label={dateLabel}
            onPrev={navigateBack}
            onNext={navigateForward}
            canGoForward={canGoForward}
            onCalendarPress={() => setCalendarOpen(true)}
          />
        </YStack>
      </Card>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack p="$4" gap="$4" pb="$8">
          {/* Summary cards */}
          <XStack gap="$3">
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

          {/* Tickets list */}
          <Card
            bg="$background"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            overflow="hidden"
          >
            {loading ? (
              <YStack p="$6" style={{ alignItems: "center" }} gap="$3">
                <Spinner size="large" color="$green10" />
                <Text color="$color10">Cargando...</Text>
              </YStack>
            ) : allTickets.length === 0 ? (
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
            ) : (
              allTickets.map((ticket, idx) => (
                <YStack key={ticket.id}>
                  {idx > 0 && <Separator />}
                  <TicketRow
                    ticket={ticket}
                    onPress={() => openDetail(ticket)}
                  />
                </YStack>
              ))
            )}
          </Card>
        </YStack>
      </ScrollView>

      {/* Calendar sheet */}
      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        mode={period}
        selectedDay={selectedDay}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        range={dateRange}
        onSelectDay={(d) => {
          setSelectedDay(d);
          setCalendarOpen(false);
        }}
        onSelectMonth={(m) => {
          setSelectedMonth(m);
          setCalendarOpen(false);
        }}
        onSelectYear={(y) => {
          setSelectedYear(y);
          setCalendarOpen(false);
        }}
        onSelectRange={(r) => {
          setDateRange(r);
          setCalendarOpen(false);
        }}
      />

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
                      <XStack px="$3" py="$3" style={{ alignItems: "center" }}>
                        <YStack flex={1} gap="$0.5">
                          <Text
                            fontSize="$3"
                            fontWeight="bold"
                            color="$color"
                            numberOfLines={1}
                          >
                            {item.productName}
                          </Text>
                          <Text fontSize="$2" color="$color10">
                            {item.quantity} × ${item.unitPrice.toFixed(2)}
                          </Text>
                        </YStack>
                        <Text fontSize="$4" fontWeight="600" color="$green10">
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
