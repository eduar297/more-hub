import { StatCard } from "@/components/admin/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import type { User as UserModel } from "@/models/user";
import { exportTicketsPDF } from "@/utils/export";
import {
    daysInMonth,
    fmtMoney,
    fmtMoneyFull,
    fmtTime,
    MONTH_NAMES_SHORT,
    shiftDay,
    shiftMonth,
    shiftWeek,
    shortDayLabel,
    weekEndISO,
} from "@/utils/format";
import {
    Ban,
    ChevronRight,
    CreditCard,
    DollarSign,
    Printer,
    Receipt,
    ShoppingCart,
    TrendingUp,
    User,
    Users,
    X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, ScrollView } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import {
    Button,
    Card,
    Separator,
    Sheet,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";
import { AdminBarChart } from "./admin-bar-chart";
import { PeriodSelector } from "./period-selector";

// ── TicketRow ─────────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  onPress,
}: {
  ticket: Ticket;
  onPress: () => void;
}) {
  const voided = ticket.status === "VOIDED";
  return (
    <Pressable onPress={onPress} style={voided ? { opacity: 0.5 } : undefined}>
      <XStack px="$4" py="$3" style={{ alignItems: "center" }} gap="$3">
        <YStack flex={1}>
          <XStack style={{ alignItems: "center" }} gap="$2">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Ticket #{String(ticket.id).slice(0, 8)}
            </Text>
            {voided && (
              <YStack
                bg="$red3"
                px="$1.5"
                py="$0.5"
                style={{ borderRadius: 4 }}
              >
                <Text fontSize={9} fontWeight="700" color="$red10">
                  ANULADO
                </Text>
              </YStack>
            )}
          </XStack>
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
          {ticket.workerName ? (
            <XStack gap="$1.5" style={{ alignItems: "center" }} mt="$0.5">
              {ticket.workerPhotoUri ? (
                <Image
                  source={{ uri: ticket.workerPhotoUri }}
                  style={{ width: 16, height: 16, borderRadius: 8 }}
                />
              ) : (
                <User size={11} color="$color8" />
              )}
              <Text fontSize="$2" color="$color8">
                {ticket.workerName}
              </Text>
            </XStack>
          ) : null}
        </YStack>
        <XStack style={{ alignItems: "center" }} gap="$2">
          <Text
            fontSize="$4"
            fontWeight="bold"
            color={voided ? "$red10" : "$green10"}
            style={voided ? { textDecorationLine: "line-through" } : undefined}
          >
            ${fmtMoney(ticket.total)}
          </Text>
          <ChevronRight size={14} color="$color8" />
        </XStack>
      </XStack>
    </Pressable>
  );
}

// ── Sales Section ─────────────────────────────────────────────────────────────

export function SalesSection() {
  const ticketRepo = useTicketRepository();
  const userRepo = useUserRepository();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const nav = usePeriodNavigation();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Worker filter
  const [workers, setWorkers] = useState<UserModel[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  useEffect(() => {
    userRepo.findByRole("WORKER").then(setWorkers);
  }, [userRepo]);

  // Data states
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dailySales, setDailySales] = useState<
    { day: number; total: number }[]
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

  // Previous-period data for delta badges
  const [prevTotal, setPrevTotal] = useState(0);
  const [prevTickets, setPrevTickets] = useState(0);

  // Ticket detail sheet
  const [sheetTicket, setSheetTicket] = useState<Ticket | null>(null);
  const [sheetItems, setSheetItems] = useState<TicketItem[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  const openTicketSheet = useCallback(
    async (ticket: Ticket) => {
      setSheetTicket(ticket);
      setSheetLoading(true);
      const items = await ticketRepo.findItemsByTicketId(ticket.id);
      setSheetItems(items);
      setSheetLoading(false);
    },
    [ticketRepo],
  );

  const wId = selectedWorkerId;

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (nav.period === "day") {
        const [summary, hourly, dayTickets, top, payment] = await Promise.all([
          ticketRepo.daySummary(nav.selectedDay, wId),
          ticketRepo.hourlySales(nav.selectedDay, wId),
          ticketRepo.findByDateRange(nav.selectedDay, nav.selectedDay, wId),
          ticketRepo.topProductsByRange(
            nav.selectedDay,
            nav.selectedDay,
            10,
            wId,
          ),
          ticketRepo.paymentMethodBreakdownByRange(
            nav.selectedDay,
            nav.selectedDay,
            wId,
          ),
        ]);
        setDaySummary(summary);
        setHourlySales(hourly);
        setTickets(dayTickets);
        setTopProducts(top);
        setPaymentBreakdown(payment);
      } else if (nav.period === "week") {
        const weekEnd = weekEndISO(nav.selectedWeekStart);
        const [weekTickets, top, payment] = await Promise.all([
          ticketRepo.findByDateRange(nav.selectedWeekStart, weekEnd, wId),
          ticketRepo.topProductsByRange(nav.selectedWeekStart, weekEnd, 5, wId),
          ticketRepo.paymentMethodBreakdownByRange(
            nav.selectedWeekStart,
            weekEnd,
            wId,
          ),
        ]);
        setTickets(weekTickets);
        // Build daily totals for the 7-day chart (index 0=Mon … 6=Sun)
        const weekDailyTotals = Array.from({ length: 7 }, (_, i) => {
          const dayKey = shiftDay(nav.selectedWeekStart, i);
          return {
            day: i + 1,
            total: weekTickets
              .filter((t) => t.createdAt.slice(0, 10) === dayKey)
              .reduce((s, t) => s + t.total, 0),
          };
        });
        setDailySales(weekDailyTotals);
        setMonthlySummary({
          totalSales: weekTickets.reduce((s, t) => s + t.total, 0),
          ticketCount: weekTickets.length,
        });
        setTopProducts(top);
        setPaymentBreakdown(payment);
      } else if (nav.period === "month") {
        const [daily, monthSummary, top, payment, monthTickets] =
          await Promise.all([
            ticketRepo.dailySales(nav.selectedMonth, wId),
            ticketRepo.monthlySummary(nav.selectedMonth, wId),
            ticketRepo.topProducts(nav.selectedMonth, 10, wId),
            ticketRepo.paymentMethodBreakdown(nav.selectedMonth, wId),
            ticketRepo.findByDateRange(
              `${nav.selectedMonth}-01`,
              `${nav.selectedMonth}-${String(
                daysInMonth(nav.selectedMonth),
              ).padStart(2, "0")}`,
              wId,
            ),
          ]);
        setDailySales(daily);
        setMonthlySummary(monthSummary);
        setTopProducts(top);
        setPaymentBreakdown(payment);
        setTickets(monthTickets);
      } else if (nav.period === "year") {
        const yearStart = `${nav.selectedYear}-01-01`;
        const yearEnd = `${nav.selectedYear}-12-31`;
        const [yearly, top, payment, yearTickets] = await Promise.all([
          ticketRepo.monthlySalesForYear(nav.selectedYear, wId),
          ticketRepo.topProductsByRange(yearStart, yearEnd, 10, wId),
          ticketRepo.paymentMethodBreakdownByRange(yearStart, yearEnd, wId),
          ticketRepo.findByDateRange(yearStart, yearEnd, wId),
        ]);
        setYearlySales(yearly);
        setTopProducts(top);
        setPaymentBreakdown(payment);
        setTickets(yearTickets);
        setMonthlySummary({
          totalSales: yearly.reduce((s, y) => s + y.total, 0),
          ticketCount: yearly.reduce((s, y) => s + y.tickets, 0),
        });
      } else {
        // range
        const [rangeTickets, top, payment] = await Promise.all([
          ticketRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to, wId),
          ticketRepo.topProductsByRange(
            nav.dateRange.from,
            nav.dateRange.to,
            10,
            wId,
          ),
          ticketRepo.paymentMethodBreakdownByRange(
            nav.dateRange.from,
            nav.dateRange.to,
            wId,
          ),
        ]);
        setTickets(rangeTickets);
        setTopProducts(top);
        setPaymentBreakdown(payment);
        setMonthlySummary({
          totalSales: rangeTickets.reduce((s, t) => s + t.total, 0),
          ticketCount: rangeTickets.length,
        });
        // Build daily totals for range chart
        const dayCount =
          Math.round(
            (new Date(nav.dateRange.to + "T12:00:00").getTime() -
              new Date(nav.dateRange.from + "T12:00:00").getTime()) /
              86400000,
          ) + 1;
        const rangeDailyTotals = Array.from({ length: dayCount }, (_, i) => {
          const dayKey = shiftDay(nav.dateRange.from, i);
          return {
            day: i + 1,
            total: rangeTickets
              .filter((t) => t.createdAt.slice(0, 10) === dayKey)
              .reduce((s, t) => s + t.total, 0),
          };
        });
        setDailySales(rangeDailyTotals);
      }
    } finally {
      setLoading(false);
    }
  }, [
    nav.period,
    nav.selectedDay,
    nav.selectedMonth,
    nav.selectedWeekStart,
    nav.selectedYear,
    nav.dateRange,
    ticketRepo,
    wId,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Load previous-period data for delta comparison
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (nav.period === "day") {
            const prevDay = shiftDay(nav.selectedDay, -1);
            const prev = await ticketRepo.daySummary(prevDay, wId);
            setPrevTotal(prev.totalSales);
            setPrevTickets(prev.ticketCount);
          } else if (nav.period === "week") {
            const prevWkStart = shiftWeek(nav.selectedWeekStart, -1);
            const prevWkEnd = weekEndISO(prevWkStart);
            const prevTkts = await ticketRepo.findByDateRange(
              prevWkStart,
              prevWkEnd,
              wId,
            );
            setPrevTotal(prevTkts.reduce((s, t) => s + t.total, 0));
            setPrevTickets(prevTkts.length);
          } else if (nav.period === "month") {
            const prevMo = shiftMonth(nav.selectedMonth, -1);
            const prev = await ticketRepo.monthlySummary(prevMo, wId);
            setPrevTotal(prev.totalSales);
            setPrevTickets(prev.ticketCount);
          } else if (nav.period === "year") {
            const prevYearSales = await ticketRepo.monthlySalesForYear(
              String(Number(nav.selectedYear) - 1),
              wId,
            );
            setPrevTotal(prevYearSales.reduce((s, y) => s + y.total, 0));
            setPrevTickets(prevYearSales.reduce((s, y) => s + y.tickets, 0));
          } else {
            setPrevTotal(0);
            setPrevTickets(0);
          }
        } catch {
          setPrevTotal(0);
          setPrevTickets(0);
        }
      })();
    }, [
      nav.period,
      nav.selectedDay,
      nav.selectedWeekStart,
      nav.selectedMonth,
      nav.selectedYear,
      ticketRepo,
      wId,
    ]),
  );

  // ── Void ticket handler ─────────────────────────────────────────────────
  const handleVoidTicket = useCallback(
    (ticket: Ticket) => {
      if (!user) return;
      Alert.prompt(
        "Anular venta",
        `¿Seguro que quieres anular el Ticket #${String(ticket.id).slice(
          0,
          8,
        )} por $${fmtMoney(
          ticket.total,
        )}?\n\nEl stock será restaurado. Escribe la razón:`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Anular",
            style: "destructive",
            onPress: async (reason) => {
              if (!reason?.trim()) {
                Alert.alert("Error", "Debes escribir una razón");
                return;
              }
              try {
                await ticketRepo.voidTicket(ticket.id, user.id, reason.trim());
                setSheetTicket(null);
                loadData();
              } catch (e: any) {
                Alert.alert("Error", e.message ?? "No se pudo anular");
              }
            },
          },
        ],
        "plain-text",
        "",
        "default",
      );
    },
    [ticketRepo, user, loadData],
  );

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (nav.period === "day") {
      const hourMap = new Map(hourlySales.map((h) => [h.hour, h.total]));
      return Array.from({ length: 24 }, (_, i) => {
        const total = hourMap.get(i) ?? 0;
        return {
          value: total,
          label: `${i}h`,
          frontColor: total > 0 ? "#3b82f6" : "#555555",
          labelTextStyle: { fontSize: 10, color: "#888" },
        };
      });
    }
    if (nav.period === "week") {
      const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      return dailySales.map((d, i) => ({
        value: d.total,
        label: DAY_LABELS[i] ?? String(i + 1),
        frontColor: d.total > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (nav.period === "month") {
      const days = daysInMonth(nav.selectedMonth);
      const dataMap = new Map(dailySales.map((d) => [d.day, d.total]));
      return Array.from({ length: days }, (_, i) => ({
        value: dataMap.get(i + 1) ?? 0,
        label: String(i + 1),
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
      }));
    }
    if (nav.period === "range") {
      const dayCount = dailySales.length;
      if (dayCount === 0) return [];
      return dailySales.map((d, i) => ({
        value: d.total,
        label: shortDayLabel(shiftDay(nav.dateRange.from, i))
          .replace(/\sde\s/g, " ")
          .slice(0, 6),
        frontColor: d.total > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 9, color: "#888" },
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? "#3b82f6" : "#555555",
        labelTextStyle: { fontSize: 10, color: "#888" },
        labelWidth: 28,
      };
    });
  }, [
    nav.period,
    hourlySales,
    dailySales,
    yearlySales,
    nav.selectedMonth,
    nav.dateRange,
  ]);

  const paymentPieData = useMemo(() => {
    if (paymentBreakdown.length === 0) return [];
    return paymentBreakdown.map((p) => ({
      value: p.total,
      color: p.method === "CASH" ? "#22c55e" : "#a855f7",
    }));
  }, [paymentBreakdown]);

  const summaryTotal =
    nav.period === "day" ? daySummary.totalSales : monthlySummary.totalSales;
  const summaryTickets =
    nav.period === "day" ? daySummary.ticketCount : monthlySummary.ticketCount;
  const summaryAvg = summaryTickets > 0 ? summaryTotal / summaryTickets : 0;

  // Delta computation
  const pctDelta = (cur: number, prev: number) =>
    prev > 0 ? ((cur - prev) / prev) * 100 : undefined;
  const showDelta = nav.period !== "range";
  const totalDelta = showDelta ? pctDelta(summaryTotal, prevTotal) : undefined;
  const ticketsDelta = showDelta
    ? pctDelta(summaryTickets, prevTickets)
    : undefined;
  const prevAvg = prevTickets > 0 ? prevTotal / prevTickets : 0;
  const avgDelta = showDelta ? pctDelta(summaryAvg, prevAvg) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────
  const ListHeader = (
    <YStack gap="$4" px="$4" pb="$2">
      {/* KPI cards */}
      <XStack gap="$3">
        <StatCard
          label="Total"
          value={`$${fmtMoney(summaryTotal)}`}
          detail={`$${fmtMoneyFull(summaryTotal)}`}
          color="$green10"
          icon={<DollarSign size={16} color="$green10" />}
          delta={totalDelta}
        />
        <StatCard
          label="Tickets"
          value={String(summaryTickets)}
          color="$blue10"
          icon={<ShoppingCart size={16} color="$blue10" />}
          delta={ticketsDelta}
        />
        <StatCard
          label="Promedio"
          value={`$${fmtMoney(summaryAvg)}`}
          detail={`$${fmtMoneyFull(summaryAvg)}`}
          color="$purple10"
          icon={<TrendingUp size={16} color="$purple10" />}
          delta={avgDelta}
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
              {nav.period === "day"
                ? "Ventas por hora"
                : nav.period === "week"
                ? "Ventas de la semana"
                : nav.period === "month"
                ? "Ventas diarias"
                : nav.period === "range"
                ? "Ventas del período"
                : "Ventas mensuales"}
            </Text>
            <AdminBarChart data={chartData} lineColor="#60a5fa" />
          </YStack>
        </Card>
      )}

      {/* Payment breakdown */}
      {paymentPieData.length > 0 && (
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

      {/* Export tickets PDF button */}
      {tickets.length > 0 && (
        <Button
          size="$3"
          bg="$blue3"
          borderWidth={1}
          borderColor="$blue6"
          style={{ borderRadius: 12 }}
          icon={
            exporting ? (
              <Spinner size="small" color="$blue10" />
            ) : (
              <Printer size={16} color="$blue10" />
            )
          }
          disabled={exporting}
          opacity={exporting ? 0.6 : 1}
          onPress={async () => {
            setExporting(true);
            try {
              await exportTicketsPDF(
                tickets,
                nav.periodLabel,
                ticketRepo.findItemsByTicketId.bind(ticketRepo),
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          <Text fontSize="$3" fontWeight="600" color="$blue10">
            {exporting ? "Generando…" : "Exportar ventas PDF"}
          </Text>
        </Button>
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

  const showTickets = tickets.length > 0;

  return (
    <>
      {/* Sticky period selector + worker filter */}
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
          <PeriodSelector nav={nav} />
          {/* Worker filter chips */}
          {workers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
              <Pressable onPress={() => setSelectedWorkerId(null)}>
                <XStack
                  bg={selectedWorkerId === null ? "$blue10" : "$color3"}
                  px="$3"
                  py="$1.5"
                  style={{ borderRadius: 20, alignItems: "center" }}
                  gap="$1.5"
                >
                  <Users
                    size={14}
                    color={selectedWorkerId === null ? "#fff" : "$color10"}
                  />
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color={selectedWorkerId === null ? "#fff" : "$color10"}
                  >
                    Todos
                  </Text>
                </XStack>
              </Pressable>
              {workers.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() =>
                    setSelectedWorkerId(selectedWorkerId === w.id ? null : w.id)
                  }
                >
                  <XStack
                    bg={selectedWorkerId === w.id ? "$blue10" : "$color3"}
                    px="$3"
                    py="$1.5"
                    style={{ borderRadius: 20, alignItems: "center" }}
                    gap="$1.5"
                  >
                    {w.photoUri ? (
                      <Image
                        source={{ uri: w.photoUri }}
                        style={{ width: 18, height: 18, borderRadius: 9 }}
                      />
                    ) : (
                      <User
                        size={14}
                        color={selectedWorkerId === w.id ? "#fff" : "$color10"}
                      />
                    )}
                    <Text
                      fontSize="$2"
                      fontWeight="600"
                      color={selectedWorkerId === w.id ? "#fff" : "$color10"}
                    >
                      {w.name}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </YStack>
      </Card>

      {showTickets ? (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
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
              <TicketRow ticket={item} onPress={() => openTicketSheet(item)} />
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

      {/* Ticket detail Sheet */}
      <Sheet
        open={!!sheetTicket}
        onOpenChange={(open: boolean) => {
          if (!open) setSheetTicket(null);
        }}
        snapPoints={[75]}
        dismissOnSnapToBottom
        modal
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {sheetTicket && (
              <YStack gap="$4">
                {/* Title */}
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    Ticket #{String(sheetTicket.id).slice(0, 8)}
                  </Text>
                  <Button
                    size="$3"
                    circular
                    chromeless
                    icon={<X size={18} />}
                    onPress={() => setSheetTicket(null)}
                  />
                </XStack>

                {/* Info */}
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    {fmtTime(sheetTicket.createdAt)}
                  </Text>
                  <XStack style={{ alignItems: "center" }} gap="$2">
                    <YStack
                      bg={
                        sheetTicket.paymentMethod === "CASH"
                          ? "$green3"
                          : "$purple3"
                      }
                      px="$2"
                      py="$1"
                      style={{ borderRadius: 6 }}
                    >
                      <Text
                        fontSize="$2"
                        fontWeight="600"
                        color={
                          sheetTicket.paymentMethod === "CASH"
                            ? "$green10"
                            : "$purple10"
                        }
                      >
                        {sheetTicket.paymentMethod === "CASH"
                          ? "Efectivo"
                          : "Tarjeta"}
                      </Text>
                    </YStack>
                    {sheetTicket.workerName ? (
                      <XStack gap="$1.5" style={{ alignItems: "center" }}>
                        {sheetTicket.workerPhotoUri ? (
                          <Image
                            source={{ uri: sheetTicket.workerPhotoUri }}
                            style={{ width: 18, height: 18, borderRadius: 9 }}
                          />
                        ) : (
                          <User size={14} color="$color8" />
                        )}
                        <Text fontSize="$3" color="$color8">
                          {sheetTicket.workerName}
                        </Text>
                      </XStack>
                    ) : null}
                  </XStack>
                </XStack>

                {/* Items */}
                {sheetLoading ? (
                  <YStack
                    py="$4"
                    style={{ alignItems: "center", justifyContent: "center" }}
                  >
                    <Spinner size="small" color="$blue10" />
                  </YStack>
                ) : (
                  <Card
                    borderWidth={1}
                    borderColor="$borderColor"
                    style={{ borderRadius: 14 }}
                    overflow="hidden"
                    bg="$background"
                  >
                    {sheetItems.map((item, idx) => (
                      <YStack key={item.id}>
                        {idx > 0 && <Separator />}
                        <XStack
                          px="$3"
                          py="$2.5"
                          gap="$2.5"
                          style={{ alignItems: "center" }}
                        >
                          {item.photoUri ? (
                            <Image
                              source={{ uri: item.photoUri }}
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 6,
                              }}
                              resizeMode="cover"
                            />
                          ) : (
                            <YStack
                              width={38}
                              height={38}
                              bg="$color3"
                              style={{
                                borderRadius: 6,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Receipt size={18} color="$color8" />
                            </YStack>
                          )}
                          <YStack flex={1} gap="$0.5">
                            <Text
                              fontSize="$2"
                              fontWeight="bold"
                              color="$color"
                              numberOfLines={1}
                            >
                              {item.productName}
                            </Text>
                            {item.barcode ? (
                              <Text
                                fontSize="$1"
                                color="$color9"
                                numberOfLines={1}
                              >
                                {item.barcode}
                              </Text>
                            ) : null}
                            <Text fontSize="$1" color="$color10">
                              {item.quantity} x ${fmtMoney(item.unitPrice)}
                            </Text>
                          </YStack>
                          <Text fontSize="$3" fontWeight="600" color="$green10">
                            ${fmtMoney(item.subtotal)}
                          </Text>
                        </XStack>
                      </YStack>
                    ))}
                  </Card>
                )}

                {/* Total */}
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
                  <Text
                    fontSize="$7"
                    fontWeight="bold"
                    color={
                      sheetTicket.status === "VOIDED" ? "$red10" : "$green10"
                    }
                    style={
                      sheetTicket.status === "VOIDED"
                        ? { textDecorationLine: "line-through" }
                        : undefined
                    }
                  >
                    ${fmtMoney(sheetTicket.total)}
                  </Text>
                </XStack>

                {/* Void info or void button */}
                {sheetTicket.status === "VOIDED" ? (
                  <Card
                    bg="$red2"
                    borderWidth={1}
                    borderColor="$red6"
                    style={{ borderRadius: 12 }}
                    p="$3"
                  >
                    <XStack style={{ alignItems: "center" }} gap="$2" mb="$1">
                      <Ban size={16} color="$red10" />
                      <Text fontSize="$4" fontWeight="bold" color="$red10">
                        Ticket anulado
                      </Text>
                    </XStack>
                    {sheetTicket.voidReason && (
                      <Text fontSize="$2" color="$color10">
                        Razón: {sheetTicket.voidReason}
                      </Text>
                    )}
                    {sheetTicket.voidedAt && (
                      <Text fontSize="$2" color="$color10">
                        Fecha: {fmtTime(sheetTicket.voidedAt)}
                      </Text>
                    )}
                  </Card>
                ) : (
                  <Button
                    bg="$red3"
                    icon={<Ban size={16} color="$red10" />}
                    onPress={() => handleVoidTicket(sheetTicket)}
                  >
                    <Text color="$red10" fontWeight="600">
                      Anular venta
                    </Text>
                  </Button>
                )}
              </YStack>
            )}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}
