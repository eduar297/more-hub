import { FinanceSection } from "@/components/admin/finance-section";
import { InventorySection } from "@/components/admin/inventory-section";
import { OverviewSection } from "@/components/admin/overview-section";
import { SalesSection } from "@/components/admin/sales-section";
import { WorkersSection } from "@/components/admin/workers-section";
import { NotificationHistorySection, SyncSection } from "@/components/settings";
import { useNotifications } from "@/components/ui/notification-provider";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import { ICON_BTN_BG } from "@/constants/colors";
import { useLan } from "@/contexts/lan-context";
import { useColors } from "@/hooks/use-colors";
import {
  Bell,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  X,
} from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text as TText, XStack, YStack } from "tamagui";

type Section = "overview" | "sales" | "inventory" | "finance" | "workers";

const SECTIONS: TabDef<Section>[] = [
  { key: "overview", label: "Resumen", Icon: LayoutDashboard },
  { key: "sales", label: "Ventas", Icon: ShoppingCart },
  { key: "inventory", label: "Inventario", Icon: Package },
  { key: "finance", label: "Finanzas", Icon: TrendingUp },
  { key: "workers", label: "Equipo", Icon: Users },
];

export default function DashboardScreen() {
  const [section, setSection] = useState<Section>("overview");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const c = useColors();
  const { history, clearHistory, unseenCount, markAllSeen } =
    useNotifications();
  const { stopDiscovery, disconnectFromServer } = useLan();
  const navigation = useNavigation();

  const openHistory = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHistoryOpen(true);
    markAllSeen();
  }, [markAllSeen]);

  const closeSync = useCallback(() => {
    stopDiscovery();
    disconnectFromServer();
    setSyncOpen(false);
  }, [stopDiscovery, disconnectFromServer]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 24 }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSyncOpen(true);
            }}
            hitSlop={8}
          >
            <RefreshCw size={24} color={c.blue as any} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openHistory}
            hitSlop={8}
            style={{ marginRight: 12, position: "relative" }}
          >
            <Bell size={24} color={c.text as any} />
            {unseenCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -6,
                  right: -8,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: c.danger,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {unseenCount > 99 ? "99+" : unseenCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, openHistory, c.text, c.danger, unseenCount]);

  return (
    <YStack flex={1} bg="$background">
      <ScreenTabs tabs={SECTIONS} active={section} onSelect={setSection} />

      {/* Active Section */}
      {section === "overview" && <OverviewSection />}
      {section === "sales" && <SalesSection />}
      {section === "inventory" && <InventorySection />}
      {section === "finance" && <FinanceSection />}
      {section === "workers" && <WorkersSection />}

      {/* Sync modal */}
      <Modal
        visible={syncOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSync}
      >
        <SafeAreaView
          edges={["top"]}
          style={[indexStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            items="center"
            justify="space-between"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack items="center" gap="$2">
              <RefreshCw size={18} color={c.blue as any} />
              <TText fontSize={16} fontWeight="700" color="$color">
                Sincronizar
              </TText>
            </XStack>
            <TouchableOpacity
              onPress={closeSync}
              hitSlop={8}
              style={indexStyles.closeBtn}
            >
              <X size={18} color={c.text as any} />
            </TouchableOpacity>
          </XStack>
          <SyncSection />
        </SafeAreaView>
      </Modal>

      {/* Notification history modal */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[indexStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            items="center"
            justify="space-between"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack items="center" gap="$2">
              <Bell size={18} color={c.blue as any} />
              <TText fontSize={16} fontWeight="700" color="$color">
                Notificaciones
              </TText>
            </XStack>
            <TouchableOpacity
              onPress={() => setHistoryOpen(false)}
              hitSlop={8}
              style={indexStyles.closeBtn}
            >
              <X size={18} color={c.text as any} />
            </TouchableOpacity>
          </XStack>
          <NotificationHistorySection
            historyData={history}
            onClear={clearHistory}
          />
        </SafeAreaView>
      </Modal>
    </YStack>
  );
}

const indexStyles = StyleSheet.create({
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
