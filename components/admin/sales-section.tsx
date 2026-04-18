import { StatCard } from "@/components/admin/stat-card";
import { SearchInput } from "@/components/ui/search-input";
import { CHART_PALETTE, ICON_BTN_BG } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
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
    Search,
    ShoppingCart,
    TrendingUp,
    User,
    Users,
    X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Button,
    Card,
    Separator,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";
import { AdminBarChart } from "./admin-bar-chart";
import { AdminPieChart } from "./admin-pie-chart";
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
  const db = useSQLiteContext();
  const { currentStore, syncVersion } = useStore();
  const ticketRepo = useTicketRepository();
  const userRepo = useUserRepository();
  const { user } = useAuth();
  const c = useColors();

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

  // Void rate
  const [voidedCount, setVoidedCount] = useState(0);

  // Ticket detail sheet
  const [sheetTicket, setSheetTicket] = useState<Ticket | null>(null);
  const [sheetItems, setSheetItems] = useState<TicketItem[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  // Ticket search by ID
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Ticket[] | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const trimmed = text.trim();
      if (!trimmed) {
        setSearchResults(null);
        return;
      }
      searchTimerRef.current = setTimeout(async () => {
        const results = await ticketRepo.searchById(trimmed);
        setSearchResults(results);
      }, 300);
    },
    [ticketRepo],
  );

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
    syncVersion,
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

  // Load voided ticket count for current period
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          let from: string;
          let to: string;
          if (nav.period === "day") {
            from = nav.selectedDay;
            to = nav.selectedDay;
          } else if (nav.period === "week") {
            from = nav.selectedWeekStart;
            to = weekEndISO(nav.selectedWeekStart);
          } else if (nav.period === "month") {
            const days = daysInMonth(nav.selectedMonth);
            from = `${nav.selectedMonth}-01`;
            to = `${nav.selectedMonth}-${String(days).padStart(2, "0")}`;
          } else if (nav.period === "year") {
            from = `${nav.selectedYear}-01-01`;
            to = `${nav.selectedYear}-12-31`;
          } else {
            from = nav.dateRange.from;
            to = nav.dateRange.to;
          }
          const sFilter =
            currentStore?.id !== undefined ? " AND storeId = ?" : "";
          const params: (string | number)[] = [from, to];
          if (currentStore?.id !== undefined) params.push(currentStore.id);
          const row = await db.getFirstAsync<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM tickets WHERE date(createdAt) >= ? AND date(createdAt) <= ? AND status = 'VOIDED'${sFilter}`,
            params,
          );
          setVoidedCount(row?.cnt ?? 0);
        } catch {
          setVoidedCount(0);
        }
      })();
    }, [
      nav.period,
      nav.selectedDay,
      nav.selectedWeekStart,
      nav.selectedMonth,
      nav.selectedYear,
      nav.dateRange,
      db,
      currentStore?.id,
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
          frontColor: total > 0 ? c.blue : c.muted,
          labelTextStyle: { fontSize: 10, color: c.muted },
        };
      }).filter((item) => item.value > 0);
    }
    if (nav.period === "week") {
      const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      return dailySales
        .map((d, i) => ({
          value: d.total,
          label: DAY_LABELS[i] ?? String(i + 1),
          frontColor: d.total > 0 ? c.blue : c.muted,
          labelTextStyle: { fontSize: 10, color: c.muted },
        }))
        .filter((item) => item.value > 0);
    }
    if (nav.period === "month") {
      const days = daysInMonth(nav.selectedMonth);
      const dataMap = new Map(dailySales.map((d) => [d.day, d.total]));
      return Array.from({ length: days }, (_, i) => ({
        value: dataMap.get(i + 1) ?? 0,
        label: String(i + 1),
        frontColor: (dataMap.get(i + 1) ?? 0) > 0 ? c.blue : c.muted,
        labelTextStyle: { fontSize: 10, color: c.muted },
      })).filter((item) => item.value > 0);
    }
    if (nav.period === "range") {
      const dayCount = dailySales.length;
      if (dayCount === 0) return [];
      return dailySales
        .map((d, i) => ({
          value: d.total,
          label: shortDayLabel(shiftDay(nav.dateRange.from, i))
            .replace(/\sde\s/g, " ")
            .slice(0, 6),
          frontColor: d.total > 0 ? c.blue : c.muted,
          labelTextStyle: { fontSize: 9, color: c.muted },
        }))
        .filter((item) => item.value > 0);
    }
    return Array.from({ length: 12 }, (_, i) => {
      const entry = yearlySales.find((y) => y.month === i + 1);
      return {
        value: entry?.total ?? 0,
        label: MONTH_NAMES_SHORT[i],
        frontColor: (entry?.total ?? 0) > 0 ? c.blue : c.muted,
        labelTextStyle: { fontSize: 10, color: c.muted },
        labelWidth: 28,
      };
    }).filter((item) => item.value > 0);
  }, [
    nav.period,
    hourlySales,
    dailySales,
    yearlySales,
    nav.selectedMonth,
    nav.dateRange,
    c.blue,
    c.muted,
  ]);

  const paymentPieData = useMemo(() => {
    if (paymentBreakdown.length === 0) return [];
    return paymentBreakdown.map((p) => ({
      value: p.total,
      color: p.method === "CASH" ? c.green : c.purple,
      label: p.method === "CASH" ? "Efectivo" : "Tarjeta",
      subtitle: `${p.count} tickets · prom $${fmtMoney(
        p.count > 0 ? p.total / p.count : 0,
      )}`,
    }));
  }, [paymentBreakdown, c.green, c.purple]);

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

  // Best/worst day and peak hour insights
  const insights = useMemo(() => {
    const result: { label: string; value: string; color: string }[] = [];
    if (nav.period === "day" && hourlySales.length > 0) {
      const active = hourlySales.filter((h) => h.total > 0);
      if (active.length > 0) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        result.push({
          label: "Hora pico",
          value: `${best.hour}:00 · $${fmtMoney(best.total)}`,
          color: "$green10",
        });
      }
    }
    if (
      (nav.period === "week" || nav.period === "month") &&
      dailySales.length > 0
    ) {
      const active = dailySales.filter((d) => d.total > 0);
      if (active.length >= 2) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        const worst = active.reduce((a, b) => (b.total < a.total ? b : a));
        if (nav.period === "week") {
          const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
          result.push({
            label: "Mejor día",
            value: `${DAY_LABELS[best.day - 1]} · $${fmtMoney(best.total)}`,
            color: "$green10",
          });
          result.push({
            label: "Peor día",
            value: `${DAY_LABELS[worst.day - 1]} · $${fmtMoney(worst.total)}`,
            color: "$red10",
          });
        } else {
          result.push({
            label: "Mejor día",
            value: `Día ${best.day} · $${fmtMoney(best.total)}`,
            color: "$green10",
          });
          result.push({
            label: "Peor día",
            value: `Día ${worst.day} · $${fmtMoney(worst.total)}`,
            color: "$red10",
          });
        }
      }
    }
    if (nav.period === "year" && yearlySales.length > 0) {
      const active = yearlySales.filter((m) => m.total > 0);
      if (active.length >= 2) {
        const best = active.reduce((a, b) => (b.total > a.total ? b : a));
        const worst = active.reduce((a, b) => (b.total < a.total ? b : a));
        result.push({
          label: "Mejor mes",
          value: `${MONTH_NAMES_SHORT[best.month - 1]} · $${fmtMoney(
            best.total,
          )}`,
          color: "$green10",
        });
        result.push({
          label: "Peor mes",
          value: `${MONTH_NAMES_SHORT[worst.month - 1]} · $${fmtMoney(
            worst.total,
          )}`,
          color: "$red10",
        });
      }
    }
    return result;
  }, [nav.period, hourlySales, dailySales, yearlySales]);

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

      {/* Export tickets PDF button */}
      {tickets.length > 0 && (
        <Button
          size="$2"
          bg="$blue3"
          borderWidth={1}
          borderColor="$blue6"
          style={{ borderRadius: 12, minHeight: 44 }}
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
          <Text fontSize="$2" fontWeight="600" color="$blue10">
            {exporting ? "Generando…" : "Exportar ventas PDF"}
          </Text>
        </Button>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <XStack gap="$3" flexWrap="wrap">
          {insights.map((ins) => (
            <Card
              key={ins.label}
              flex={1}
              minWidth="45%"
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 12 }}
              p="$3"
            >
              <Text fontSize="$1" color="$color10">
                {ins.label}
              </Text>
              <Text fontSize="$3" fontWeight="bold" color={ins.color as any}>
                {ins.value}
              </Text>
            </Card>
          ))}
        </XStack>
      )}

      {/* Void rate card */}
      {voidedCount > 0 && (
        <Card
          bg="$red2"
          borderWidth={1}
          borderColor="$red6"
          style={{ borderRadius: 12 }}
          p="$3"
        >
          <XStack style={{ alignItems: "center" }} gap="$3">
            <Ban size={18} color="$red10" />
            <YStack flex={1}>
              <Text fontSize="$3" fontWeight="bold" color="$red10">
                {voidedCount} ticket{voidedCount > 1 ? "s" : ""} anulado
                {voidedCount > 1 ? "s" : ""}
              </Text>
              <Text fontSize="$2" color="$color10">
                Tasa de anulación:{" "}
                {summaryTickets + voidedCount > 0
                  ? (
                      (voidedCount / (summaryTickets + voidedCount)) *
                      100
                    ).toFixed(1)
                  : "0"}
                %
              </Text>
            </YStack>
          </XStack>
        </Card>
      )}

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
            <AdminBarChart
              data={chartData}
              xAxisLabel={
                nav.period === "day"
                  ? "Hora"
                  : nav.period === "year"
                  ? "Mes"
                  : "Día"
              }
              yAxisLabel="Monto ($)"
            />
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
            <AdminPieChart
              data={paymentPieData}
              radius={50}
              innerRadius={30}
              showPercentage={false}
            />
          </YStack>
        </Card>
      )}

      {/* Top products chart */}
      {topProducts.length > 0 && (
        <Card
          bg="$color1"
          borderWidth={1}
          borderColor="$borderColor"
          style={{ borderRadius: 14 }}
          p="$4"
        >
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: "center" }}>
              <TrendingUp size={16} color="$yellow10" />
              <Text fontSize="$3" fontWeight="600" color="$color10">
                Más vendidos
              </Text>
            </XStack>
            <AdminBarChart
              data={topProducts.map((tp, idx) => ({
                value: tp.totalRevenue,
                label:
                  tp.productName.length > 8
                    ? tp.productName.slice(0, 7) + "…"
                    : tp.productName,
                frontColor: CHART_PALETTE[idx % CHART_PALETTE.length],
                labelTextStyle: { fontSize: 9, color: c.muted },
              }))}
              showLine={false}
              showVerticalLines={false}
              xAxisLabel="Producto"
              yAxisLabel="Ingresos ($)"
            />
          </YStack>
        </Card>
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

  const isSearching = searchResults !== null;
  const displayTickets = isSearching ? searchResults : tickets;
  const showTickets = displayTickets.length > 0;

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

          {/* Search by ticket ID */}
          <SearchInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Buscar por ID de ticket…"
          />
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
          data={displayTickets}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            isSearching ? (
              <YStack px="$4" py="$2" gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color10">
                  {displayTickets.length} resultado
                  {displayTickets.length !== 1 ? "s" : ""}
                </Text>
              </YStack>
            ) : (
              <>
                {ListHeader}
                <YStack px="$4" pt="$6" gap="$1" pb="$2">
                  <Text fontSize="$3" fontWeight="700" color="$color10">
                    Tickets
                  </Text>
                </YStack>
              </>
            )
          }
          contentContainerStyle={{ paddingBottom: 100 }}
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
          ListHeaderComponent={
            isSearching ? (
              <YStack px="$4" py="$4" style={{ alignItems: "center" }} gap="$2">
                <Search size={32} color="$color8" />
                <Text fontSize="$3" color="$color10">
                  No se encontraron tickets con ese ID
                </Text>
              </YStack>
            ) : (
              ListHeader
            )
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={() => null}
        />
      )}

      {/* Ticket detail Modal */}
      <Modal
        visible={!!sheetTicket}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheetTicket(null)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[salStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            px="$4"
            py="$3"
            style={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Receipt size={20} color="$blue10" />
              <Text fontSize="$5" fontWeight="bold" color="$color">
                {sheetTicket
                  ? `Ticket #${String(sheetTicket.id).slice(0, 8)}`
                  : "Detalle"}
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setSheetTicket(null)}
              style={salStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {sheetTicket && (
              <YStack gap="$4">
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
                            {item.code ? (
                              <Text
                                fontSize="$1"
                                color="$color9"
                                numberOfLines={1}
                              >
                                {item.code}
                              </Text>
                            ) : null}
                            <Text fontSize="$1" color="$color10">
                              {item.quantity} x ${item.unitPrice}
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
        </SafeAreaView>
      </Modal>
    </>
  );
}

const salStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
