import {
    CalendarSheet,
    DateNavigator,
    PeriodTabs,
    type DateRange,
    type Period,
} from "@/components/admin/period-selector";
import { StatCard } from "@/components/admin/stat-card";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import {
    currentYearMonth,
    dayLabel,
    daysInMonth,
    fmtMoney,
    fmtTime,
    MONTH_NAMES_SHORT,
    monthLabel,
    rangeLabel,
    shiftDay,
    shiftMonth,
    todayISO,
} from "@/utils/format";
import {
    ChevronDown,
    CreditCard,
    DollarSign,
    Receipt,
    ShoppingCart,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, FlatList, Pressable } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";

const SCREEN_W = Dimensions.get("window").width;

// ── TicketRow ─────────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  onToggle,
  expanded,
  items,
}: {
  ticket: Ticket;
  onToggle: () => void;
  expanded: boolean;
  items: TicketItem[];
}) {
  return (
    <YStack>
      <Pressable onPress={onToggle}>
        <XStack px="$4" py="$3" style={{ alignItems: "center" }} gap="$3">
          <YStack
            width={40}
            height={40}
            bg="$blue3"
            style={{
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Receipt size={18} color="$blue10" />
          </YStack>
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="600" color="$color">
              Ticket #{ticket.id}
            </Text>
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <Text fontSize="$2" color="$color10">
                {fmtTime(ticket.createdAt)}
              </Text>
              <YStack
                bg={ticket.paymentMethod === "CASH" ? "$green3" : "$purple3"}
                px="$2"
                py="$0.5"
                style={{ borderRadius: 4 }}
              >
                <Text
                  fontSize={10}
                  fontWeight="600"
                  color={
                    ticket.paymentMethod === "CASH" ? "$green10" : "$purple10"
                  }
                >
                  {ticket.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta"}
                </Text>
              </YStack>
              <Text fontSize="$2" color="$color10">
                {ticket.itemCount}{" "}
                {ticket.itemCount === 1 ? "producto" : "productos"}
              </Text>
            </XStack>
          </YStack>
          <XStack style={{ alignItems: "center" }} gap="$2">
            <Text fontSize="$4" fontWeight="bold" color="$green10">
              ${fmtMoney(ticket.total)}
            </Text>
            <ChevronDown
              size={14}
              color="$color8"
              style={{
                transform: [{ rotate: expanded ? "180deg" : "0deg" }],
              }}
            />
          </XStack>
        </XStack>
      </Pressable>

      {expanded && items.length > 0 && (
        <YStack bg="$color2" px="$4" py="$2" ml="$10" gap="$1">
          {items.map((item) => (
            <XStack
              key={item.id}
              style={{
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text fontSize="$2" color="$color10" flex={1} numberOfLines={1}>
                {item.productName}
              </Text>
              <Text fontSize="$2" color="$color10" mr="$2">
                x{item.quantity}
              </Text>
              <Text fontSize="$2" fontWeight="600" color="$color">
                ${fmtMoney(item.subtotal)}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}

// ── Sales Section ─────────────────────────────────────────────────────────────

export function SalesSection() {
  const ticketRepo = useTicketRepository();

  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear()),
  );
  const [dateRange, setDateRange] = useState<DateRange>({
    from: todayISO(),
    to: todayISO(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data states
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dailySales, setDailySales] = useState<
    { day: number; total: number }[]
  >([]);
  const [weeklySales, setWeeklySales] = useState<
    { week: number; total: number; tickets: number }[]
  >([]);
  const [yearlySales, setYearlySales] = useState<
    { month: number; total: number; tickets: number }[]
  >([]);
  const [hourlySales, setHourlySales] = useState<
    { hour: number; total: number; tickets: number }[]
  >([]);
  const [daySummary, setDaySummary] = useState({
    totalSales: 0,
    ticketCount: 0,
    avgTicket: 0,
  });
  const [monthlySummary, setMonthlySummary] = useState({
    totalSales: 0,
    ticketCount: 0,
  });
  const [topProducts, setTopProducts] = useState<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  >([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<
    { method: string; total: number; count: number }[]
  >([]);

  // Ticket expansion
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [ticketItems, setTicketItems] = useState<Record<number, TicketItem[]>>(
    {},
  );

  const toggleTicket = useCallback(
    async (ticketId: number) => {
      if (expandedTicket === ticketId) {
        setExpandedTicket(null);
        return;
      }
      setExpandedTicket(ticketId);
      if (!ticketItems[ticketId]) {
        const items = await ticketRepo.findItemsByTicketId(ticketId);
        setTicketItems((prev) => ({ ...prev, [ticketId]: items }));
      }
    },
    [expandedTicket, ticketItems, ticketRepo],
  );

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setExpandedTicket(null);
    try {
      if (period === "day") {
        const [summary, hourly, dayTickets] = await Promise.all([
          ticketRepo.daySummary(selectedDay),
          ticketRepo.hourlySales(selectedDay),
          ticketRepo.findByDateRange(selectedDay, selectedDay),
        ]);
        setDaySummary(summary);
        setHourlySales(hourly);
        setTickets(dayTickets);
      } else if (period === "week") {
        const [weekly, monthSummary, monthDailySales, top, payment] =
          await Promise.all([
            ticketRepo.weeklySales(selectedMonth),
            ticketRepo.monthlySummary(selectedMonth),
            ticketRepo.dailySales(selectedMonth),
            ticketRepo.topProducts(selectedMonth, 5),
            ticketRepo.paymentMethodBreakdown(selectedMonth),
          ]);
        setWeeklySales(weekly);
        setMonthlySummary(monthSummary);
        setDailySales(monthDailySales);
        setTopProducts(top);
        setPaymentBreakdown(payment);
      } else if (period === "month") {
        const [daily, monthSummary, top, payment, monthTickets] =
          await Promise.all([
            ticketRepo.dailySales(selectedMonth),
            ticketRepo.monthlySummary(selectedMonth),
            ticketRepo.topProducts(selectedMonth, 10),
            ticketRepo.paymentMethodBreakdown(selectedMonth),
            ticketRepo.findByDateRange(
              `${selectedMonth}-01`,
              `${selectedMonth}-${String(daysInMonth(selectedMonth)).padStart(2, "0")}`,
            ),
          ]);
        setDailySales(daily);
        setMonthlySummary(monthSummary);
        setTopProducts(top);
        setPaymentBreakdown(payment);
        setTickets(monthTickets);
      } else if (period === "year") {
        const [yearly, top] = await Promise.all([
          ticketRepo.monthlySalesForYear(selectedYear),
          ticketRepo.topProducts(undefined, 10),
        ]);
        setYearlySales(yearly);
        setTopProducts(top);
        setMonthlySummary({
          totalSales: yearly.reduce((s, y) => s + y.total, 0),
          ticketCount: yearly.reduce((s, y) => s + y.tickets, 0),
        });
      } else {
        // range
        const rangeTickets = await ticketRepo.findByDateRange(
          dateRange.from,
          dateRange.to,
        );
        setTickets(rangeTickets);
        setMonthlySummary({
          totalSales: rangeTickets.reduce((s, t) => s + t.total, 0),
          ticketCount: rangeTickets.length,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [period, selectedDay, selectedMonth, selectedYear, dateRange, ticketRepo]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Navigation ────────────────────────────────────────────────────────────
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
  const canGoForward = useMemo(() => {
    if (period === "day") return selectedDay < todayISO();
    if (period === "month" || period === "week")
      return selectedMonth < currentYearMonth();
    if (period === "year")
      return Number(selectedYear) < new Date().getFullYear();
    return false;
  }, [period, selectedDay, selectedMonth, selectedYear]);

  const periodLabel = useMemo(() => {
    if (period === "day") return dayLabel(selectedDay);
    if (period === "month" || period === "week")
      return monthLabel(selectedMonth);
    if (period === "year") return selectedYear;
    return rangeLabel(dateRange.from, dateRange.to);
  }, [period, selectedDay, selectedMonth, selectedYear, dateRange]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (period === "range") return [];
    if (period === "day") {
      return hourlySales.map((h) => ({
        value: h.total,
        label: `${h.hour}h`,
        frontColor: h.total > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      }));
    }
    if (period === "week") {
      return weeklySales.map((w) => ({
        value: w.total,
        label: `S${w.week}`,
        frontColor: "#3b82f6",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (period === "month") {
      const days = daysInMonth(selectedMonth);
      const dataMap = new Map(dailySales.map((d) => [d.day, d.total]));
      return Array.from({ length: days }, (_, i) => ({
        value: dataMap.get(i + 1) ?? 0,
        label:
          i === 0 || (i + 1) % 5 === 0 || i === days - 1 ? String(i + 1) : "",
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 8, color: "#888" },
      };
    });
  }, [
    period,
    hourlySales,
    weeklySales,
    dailySales,
    yearlySales,
    selectedMonth,
  ]);

  const barWidth = useMemo(() => {
    if (period === "day") return 14;
    if (period === "week") return 40;
    if (period === "year") return 16;
    const days = daysInMonth(selectedMonth);
    const chartW = SCREEN_W - 80;
    return Math.max(3, Math.min(14, chartW / days / 1.6));
  }, [period, selectedMonth]);

  const barSpacing = useMemo(() => {
    if (period === "day") return 4;
    if (period === "week") return 12;
    if (period === "year") return 6;
    const days = daysInMonth(selectedMonth);
    return Math.max(1, Math.min(4, (SCREEN_W - 80) / days / 4));
  }, [period, selectedMonth]);

  const paymentPieData = useMemo(() => {
    if (paymentBreakdown.length === 0) return [];
    return paymentBreakdown.map((p) => ({
      value: p.total,
      color: p.method === "CASH" ? "#22c55e" : "#a855f7",
    }));
  }, [paymentBreakdown]);

  const summaryTotal =
    period === "day" ? daySummary.totalSales : monthlySummary.totalSales;
  const summaryTickets =
    period === "day" ? daySummary.ticketCount : monthlySummary.ticketCount;
  const summaryAvg = summaryTickets > 0 ? summaryTotal / summaryTickets : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  const ListHeader = (
    <YStack gap="$4" px="$4" pb="$2">
      {/* KPI cards */}
      <XStack gap="$3">
        <StatCard
          label="Total"
          value={`$${fmtMoney(summaryTotal)}`}
          color="$green10"
          icon={<DollarSign size={16} color="$green10" />}
        />
        <StatCard
          label="Tickets"
          value={String(summaryTickets)}
          color="$blue10"
          icon={<ShoppingCart size={16} color="$blue10" />}
        />
        <StatCard
          label="Promedio"
          value={`$${fmtMoney(summaryAvg)}`}
          color="$purple10"
          icon={<TrendingUp size={16} color="$purple10" />}
        />
      </XStack>

      {/* Bar chart */}
      {chartData.length > 0 && !loading && (
        <Card
          bg="$color1"
          borderWidth={1}
          borderColor="$borderColor"
          style={{ borderRadius: 14 }}
          p="$4"
        >
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="600" color="$color10">
              {period === "day"
                ? "Ventas por hora"
                : period === "week"
                  ? "Ventas por semana"
                  : period === "month"
                    ? "Ventas diarias"
                    : "Ventas mensuales"}
            </Text>
            <BarChart
              data={chartData}
              height={130}
              barWidth={barWidth}
              spacing={barSpacing}
              noOfSections={3}
              hideRules
              yAxisTextStyle={{ fontSize: 9, color: "#888" }}
              yAxisThickness={0}
              xAxisThickness={0}
              isAnimated
              animationDuration={400}
              barBorderRadius={3}
            />
          </YStack>
        </Card>
      )}

      {/* Payment breakdown */}
      {(period === "month" || period === "week") &&
        paymentPieData.length > 0 && (
          <Card
            bg="$color1"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            p="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" style={{ alignItems: "center" }}>
                <CreditCard size={16} color="$purple10" />
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  Métodos de pago
                </Text>
              </XStack>
              <XStack style={{ alignItems: "center" }} gap="$4">
                <PieChart
                  data={paymentPieData}
                  donut
                  radius={50}
                  innerRadius={30}
                  isAnimated
                  animationDuration={400}
                />
                <YStack gap="$2" flex={1}>
                  {paymentBreakdown.map((p) => (
                    <XStack
                      key={p.method}
                      style={{ alignItems: "center" }}
                      gap="$2"
                    >
                      <YStack
                        width={10}
                        height={10}
                        style={{
                          borderRadius: 5,
                          backgroundColor:
                            p.method === "CASH" ? "#22c55e" : "#a855f7",
                        }}
                      />
                      <Text flex={1} fontSize="$3" color="$color10">
                        {p.method === "CASH" ? "Efectivo" : "Tarjeta"}
                      </Text>
                      <Text fontSize="$3" fontWeight="600" color="$color">
                        ${fmtMoney(p.total)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              </XStack>
            </YStack>
          </Card>
        )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <Card
          bg="$color1"
          borderWidth={1}
          borderColor="$borderColor"
          style={{ borderRadius: 14 }}
          overflow="hidden"
        >
          <YStack p="$4" pb="$2">
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <TrendingUp size={16} color="$yellow10" />
              <Text fontSize="$3" fontWeight="600" color="$color10">
                Más vendidos
              </Text>
            </XStack>
          </YStack>
          {topProducts.map((tp, idx) => (
            <YStack key={tp.productId}>
              {idx > 0 && <Separator />}
              <XStack px="$4" py="$2" style={{ alignItems: "center" }} gap="$2">
                <Text
                  fontSize="$2"
                  color="$color8"
                  style={{ width: 22, textAlign: "center" }}
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
                    {tp.productName}
                  </Text>
                  <Text fontSize="$2" color="$color10">
                    {tp.totalQty} uds
                  </Text>
                </YStack>
                <Text fontSize="$3" fontWeight="bold" color="$green10">
                  ${fmtMoney(tp.totalRevenue)}
                </Text>
              </XStack>
            </YStack>
          ))}
        </Card>
      )}

      {/* Tickets header */}
      {period !== "year" && tickets.length > 0 && (
        <XStack gap="$2" style={{ alignItems: "center" }} mt="$2">
          <Receipt size={18} color="$blue10" />
          <Text fontSize="$4" fontWeight="bold" color="$color">
            Tickets ({tickets.length})
          </Text>
        </XStack>
      )}
    </YStack>
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

  const showTickets =
    period !== "year" && period !== "range"
      ? tickets.length > 0
      : period === "range" && tickets.length > 0;

  return (
    <>
      {/* Sticky period selector card */}
      <Card
        mx="$4"
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
            label={periodLabel}
            onPrev={navigateBack}
            onNext={navigateForward}
            canGoForward={canGoForward}
            onCalendarPress={() => setCalendarOpen(true)}
          />
        </YStack>
      </Card>

      {showTickets ? (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          extraData={[expandedTicket, ticketItems]}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <Separator />}
          renderItem={({ item }) => (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              mx="$4"
              mb="$2"
              style={{ borderRadius: 12 }}
              overflow="hidden"
            >
              <TicketRow
                ticket={item}
                expanded={expandedTicket === item.id}
                onToggle={() => toggleTicket(item.id)}
                items={ticketItems[item.id] ?? []}
              />
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={[]}
          keyExtractor={() => "empty"}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={() => null}
        />
      )}

      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        mode={period === "range" ? "range" : "day"}
        selectedDay={selectedDay}
        range={dateRange}
        onSelectDay={(d) => {
          setSelectedDay(d);
          if (period !== "day") setPeriod("day");
        }}
        onSelectRange={(r) => {
          setDateRange(r);
          if (period !== "range") setPeriod("range");
        }}
      />
    </>
  );
}
