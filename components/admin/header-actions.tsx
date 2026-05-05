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
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const startShakeAnimation = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 2,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -2,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 2,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnimation]);

  useEffect(() => {
    if (unseenCount > 0) {
      const interval = setInterval(() => {
        startShakeAnimation();
      }, 3000); // Vibra cada 3 segundos

      return () => clearInterval(interval);
    }
  }, [unseenCount, startShakeAnimation]);

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
          marginHorizontal: 6,
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
            borderColor: c.headerText,
            borderWidth: 1,
          }}
        >
          <RefreshCw size={19} color="#fff" />
        </TouchableOpacity>
        <Animated.View
          style={{
            transform: [{ translateX: shakeAnimation }],
          }}
        >
          <TouchableOpacity onPress={openHistory} hitSlop={8}>
            <Bell size={24} color={c.text as any} />
            {unseenCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  minWidth: unseenCount > 9 ? 16 : 10,
                  height: unseenCount > 9 ? 16 : 10,
                  borderRadius: unseenCount > 9 ? 8 : 5,
                  backgroundColor: c.green,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unseenCount > 9 ? (
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {unseenCount > 99 ? "99+" : unseenCount}
                  </Text>
                ) : (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "#fff",
                    }}
                  />
                )}
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
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
