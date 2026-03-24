import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Ticket, TicketItem } from "@/models/ticket";
import {
  Banknote,
  ClipboardList,
  CreditCard,
  Receipt,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
      <Receipt size={20} color="$green10" />
      <YStack flex={1}>
        <Text fontSize="$4" fontWeight="bold" color="$color">
          Ticket #{ticket.id}
        </Text>
        <XStack style={{ alignItems: "center" }} gap="$2">
          <PayIcon size={14} color="$color10" />
          <Text fontSize="$2" color="$color10">
            {ticket.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta"} ·{" "}
            {formatTime(ticket.createdAt)}
          </Text>
        </XStack>
      </YStack>
      <YStack style={{ alignItems: "flex-end" }}>
        <Text fontSize="$4" fontWeight="600" color="$green10">
          ${ticket.total.toFixed(2)}
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

  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const t = await ticketRepo.findToday();
      setAllTickets(t);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketRepo]);

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets]),
  );

  const openDetail = useCallback(
    async (ticket: Ticket) => {
      setSelectedTicket(ticket);
      const items = await ticketRepo.findItemsByTicketId(ticket.id);
      setTicketItems(items);
      setShowDetail(true);
    },
    [ticketRepo],
  );

  const todayTotal = allTickets.reduce((s, t) => s + t.total, 0);

  return (
    <YStack flex={1} bg="$background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack p="$4" gap="$5" pb="$8">
          {/* Header */}
          <XStack gap="$3" mt="$2" style={{ alignItems: "center" }}>
            <ClipboardList size={26} color="$green10" />
            <YStack>
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Registro de ventas
              </Text>
              <Text fontSize="$3" color="$color10">
                {allTickets.length} tickets · Total ${todayTotal.toFixed(2)}
              </Text>
            </YStack>
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
                  Sin ventas hoy
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
