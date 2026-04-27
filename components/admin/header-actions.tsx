import {
  CloudSyncSection,
  NotificationHistorySection,
  SyncSection,
} from "@/components/settings";
import { SyncModeSelector } from "@/components/settings/sync-mode-selector";
import { useNotifications } from "@/components/ui/notification-provider";
import { ICON_BTN_BG } from "@/constants/colors";
import { useLan } from "@/contexts/lan-context";
import { useColors } from "@/hooks/use-colors";
import { Bell, RefreshCw, X } from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { XStack } from "tamagui";

export function HeaderActions() {
  const c = useColors();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<"lan" | "cloud">("lan");
  const { history, clearHistory, unseenCount, markAllSeen } =
    useNotifications();
  const { stopDiscovery, disconnectFromServer } = useLan();

  const openHistory = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHistoryOpen(true);
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    markAllSeen();
  }, [markAllSeen]);

  const closeSync = useCallback(() => {
    stopDiscovery();
    disconnectFromServer();
    setSyncOpen(false);
  }, [stopDiscovery, disconnectFromServer]);

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 18,
          marginHorizontal: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSyncOpen(true);
          }}
          hitSlop={4}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.blue as any,
            padding: 4,
            borderRadius: 20,
          }}
        >
          <RefreshCw size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={openHistory} hitSlop={8}>
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

      <Modal
        visible={syncOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSync}
      >
        <SafeAreaView
          edges={["top", "bottom"]}
          style={[styles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <RefreshCw size={18} color={c.blue as any} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>
                Sincronizar
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={closeSync}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <X size={18} color={c.text as any} />
            </TouchableOpacity>
          </XStack>

          <SyncModeSelector value={syncMode} onChange={setSyncMode} />
          {syncMode === "lan" ? <SyncSection /> : <CloudSyncSection />}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={historyOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeHistory}
      >
        <SafeAreaView
          edges={["top", "bottom"]}
          style={[styles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Bell size={18} color={c.blue as any} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>
                Notificaciones
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={closeHistory}
              hitSlop={8}
              style={styles.closeBtn}
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
    </>
  );
}

const styles = StyleSheet.create({
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
