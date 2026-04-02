import { StatCard } from "@/components/admin/stat-card";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import {
    daysInMonth,
    fmtMoney,
    fmtMoneyFull,
    weekEndISO,
} from "@/utils/format";
import { Award, ShoppingCart, Trophy, Users } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Image } from "react-native";
import { Card, Separator, Spinner, Text, XStack, YStack } from "tamagui";
import { PeriodSelector } from "./period-selector";

interface LeaderboardEntry {
  workerId: number;
  workerName: string;
  workerPhotoUri: string | null;
  totalSales: number;
  ticketCount: number;
  avgTicket: number;
}

export function WorkersSection() {
  const ticketRepo = useTicketRepository();
  const nav = usePeriodNavigation();
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
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
        from = `${nav.selectedMonth}-01`;
        to = `${nav.selectedMonth}-${String(
          daysInMonth(nav.selectedMonth),
        ).padStart(2, "0")}`;
      } else if (nav.period === "year") {
        from = `${nav.selectedYear}-01-01`;
        to = `${nav.selectedYear}-12-31`;
      } else {
        from = nav.dateRange.from;
        to = nav.dateRange.to;
      }

      const data = await ticketRepo.workerLeaderboard(from, to);
      setLeaderboard(data);
    } finally {
      setLoading(false);
    }
  }, [
    ticketRepo,
    nav.period,
    nav.selectedDay,
    nav.selectedWeekStart,
    nav.selectedMonth,
    nav.selectedYear,
    nav.dateRange,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const totalSales = leaderboard.reduce((s, w) => s + w.totalSales, 0);
  const totalTickets = leaderboard.reduce((s, w) => s + w.ticketCount, 0);
  const workerCount = leaderboard.length;

  const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"] as const;

  const ListHeader = (
    <YStack gap="$4" px="$4" pb="$2">
      {/* KPI cards */}
      <XStack gap="$3">
        <StatCard
          label="Ventas"
          value={`$${fmtMoney(totalSales)}`}
          detail={`$${fmtMoneyFull(totalSales)}`}
          color="$green10"
          icon={<Trophy size={16} color="$green10" />}
        />
        <StatCard
          label="Tickets"
          value={String(totalTickets)}
          color="$blue10"
          icon={<ShoppingCart size={16} color="$blue10" />}
        />
        <StatCard
          label="Equipo"
          value={String(workerCount)}
          color="$purple10"
          icon={<Users size={16} color="$purple10" />}
        />
      </XStack>

      {/* Section header */}
      {leaderboard.length > 0 && (
        <XStack gap="$2" style={{ alignItems: "center" }} mt="$2">
          <Award size={18} color="$yellow10" />
          <Text fontSize="$4" fontWeight="bold" color="$color">
            Ranking
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

  return (
    <>
      <Card
        mx="$4"
        mb="$2"
        p="$3"
        bg="$color1"
        borderWidth={1}
        borderColor="$borderColor"
        style={{ borderRadius: 16 }}
      >
        <PeriodSelector nav={nav} />
      </Card>

      <FlatList
        data={leaderboard}
        keyExtractor={(item) => String(item.workerId)}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 40 }}
        ItemSeparatorComponent={() => <Separator />}
        ListEmptyComponent={
          <YStack
            flex={1}
            style={{ justifyContent: "center", alignItems: "center" }}
            p="$6"
          >
            <Users size={40} color="$color6" />
            <Text color="$color10" mt="$3">
              Sin actividad en este período
            </Text>
          </YStack>
        }
        renderItem={({ item, index }) => {
          const medal = index < 3 ? MEDAL_COLORS[index] : null;
          const pct =
            totalSales > 0
              ? ((item.totalSales / totalSales) * 100).toFixed(1)
              : "0";
          return (
            <Card
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
              mx="$4"
              mb="$2"
              style={{ borderRadius: 12 }}
              overflow="hidden"
              p="$3"
            >
              <XStack style={{ alignItems: "center" }} gap="$3">
                {/* Rank */}
                <YStack
                  width={32}
                  height={32}
                  style={{
                    borderRadius: 16,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: medal ?? "transparent",
                  }}
                  borderWidth={medal ? 0 : 1}
                  borderColor="$borderColor"
                >
                  <Text
                    fontSize="$3"
                    fontWeight="bold"
                    color={medal ? "#fff" : "$color10"}
                  >
                    {index + 1}
                  </Text>
                </YStack>

                {/* Photo */}
                {item.workerPhotoUri ? (
                  <Image
                    source={{ uri: item.workerPhotoUri }}
                    style={{ width: 36, height: 36, borderRadius: 18 }}
                  />
                ) : (
                  <YStack
                    width={36}
                    height={36}
                    bg="$color4"
                    style={{
                      borderRadius: 18,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$4" fontWeight="bold" color="$color10">
                      {item.workerName.charAt(0).toUpperCase()}
                    </Text>
                  </YStack>
                )}

                {/* Info */}
                <YStack flex={1}>
                  <Text fontSize="$3" fontWeight="bold" color="$color">
                    {item.workerName}
                  </Text>
                  <Text fontSize="$2" color="$color10">
                    {item.ticketCount} tickets · prom $
                    {fmtMoney(item.avgTicket)}
                  </Text>
                </YStack>

                {/* Sales */}
                <YStack style={{ alignItems: "flex-end" }}>
                  <Text fontSize="$3" fontWeight="bold" color="$green10">
                    ${fmtMoney(item.totalSales)}
                  </Text>
                  <Text fontSize="$2" color="$color10">
                    {pct}%
                  </Text>
                </YStack>
              </XStack>

              {/* Progress bar */}
              <YStack
                mt="$2"
                height={4}
                bg="$color3"
                style={{ borderRadius: 2, overflow: "hidden" }}
              >
                <YStack
                  height={4}
                  bg={medal ? medal : "$blue8"}
                  style={{
                    borderRadius: 2,
                    width: `${
                      totalSales > 0 ? (item.totalSales / totalSales) * 100 : 0
                    }%` as any,
                  }}
                />
              </YStack>
            </Card>
          );
        }}
      />
    </>
  );
}
