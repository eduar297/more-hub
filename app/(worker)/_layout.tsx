import { LoginSheet } from "@/components/auth/login-sheet";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/contexts/auth-context";
import { useDevice } from "@/contexts/device-context";
import { useLan } from "@/contexts/lan-context";
import { useStore } from "@/contexts/store-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { SyncCatalogData } from "@/services/lan/protocol";
import {
  applyReceivedCatalog,
  type CatalogChangeSummary,
  deleteAllWorkerTickets,
  getLastSyncAt,
  prepareTicketsPayload,
} from "@/services/lan/sync-service";
import {
  Download,
  LayoutList,
  ScanLine,
  User,
  Wifi,
} from "@tamagui/lucide-icons";
import { Tabs } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "tamagui";

// ── Helper ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Waiting-for-sync screen ─────────────────────────────────────────────────

function WaitingForAdmin({ onReset }: { onReset: () => void }) {
  const colorScheme = useColorScheme();
  const { connectionStatus, syncStatus, syncProgress, workerName } = useLan();
  const isDark = colorScheme === "dark";

  const progressFraction =
    syncProgress && syncProgress.totalBytes > 0
      ? Math.min(syncProgress.receivedBytes / syncProgress.totalBytes, 1)
      : 0;

  // Show different states based on connection/sync status
  const getStatusInfo = () => {
    if (connectionStatus === "connecting") {
      return {
        title: "Conectando...",
        subtitle: "El administrador está estableciendo conexión",
        color: "#f59e0b",
        showProgress: false,
      };
    }
    // Admin sent sync_prepare — we know the size, waiting for data
    if (
      syncProgress &&
      syncProgress.totalBytes > 0 &&
      syncStatus !== "complete"
    ) {
      const pct = Math.round(progressFraction * 100);
      return {
        title: "Recibiendo datos",
        subtitle: `Descargando catálogo del administrador\n${formatBytes(
          syncProgress.receivedBytes,
        )} / ${formatBytes(syncProgress.totalBytes)} (${pct}%)`,
        color: "#3b82f6",
        showProgress: true,
      };
    }
    if (connectionStatus === "paired" || syncStatus === "receiving_tickets") {
      return {
        title: "Recibiendo datos",
        subtitle: "Descargando catálogo de productos desde el administrador",
        color: "#3b82f6",
        showProgress: false,
      };
    }
    return {
      title: "Esperando datos",
      subtitle:
        "El administrador debe sincronizar este Worker desde su app antes de poder iniciar sesión.",
      color: "#22c55e",
      showProgress: false,
    };
  };

  const { title, subtitle, color, showProgress } = getStatusInfo();

  return (
    <View
      style={[
        styles.waitRoot,
        { backgroundColor: isDark ? "#151718" : "#ffffff" },
      ]}
    >
      {/* Worker identity badge */}
      {workerName ? (
        <View
          style={[
            styles.nameBadge,
            {
              backgroundColor: isDark ? "#1c2a1c" : "#ecfdf5",
              borderColor: isDark ? "#2a4a2a" : "#a7f3d0",
            },
          ]}
        >
          <Text
            style={[
              styles.nameBadgeText,
              { color: isDark ? "#86efac" : "#059669" },
            ]}
          >
            {workerName}
          </Text>
        </View>
      ) : null}

      {showProgress ? (
        <Download size={56} color={color as any} />
      ) : (
        <Wifi size={56} color={color as any} />
      )}
      <Text
        style={[styles.waitTitle, { color: isDark ? "#f2f2f7" : "#18181b" }]}
      >
        {title}
      </Text>
      <Text style={[styles.waitSub, { color: isDark ? "#888" : "#999" }]}>
        {subtitle}
      </Text>

      {/* Progress bar */}
      {showProgress ? (
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: isDark ? "#2a2a2a" : "#e5e5e5" },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: color,
                  width: `${Math.round(progressFraction * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      ) : (
        <ActivityIndicator
          color={color as any}
          size="large"
          style={{ marginTop: 16 }}
        />
      )}

      <TouchableOpacity
        style={[styles.resetBtn, { borderColor: isDark ? "#333" : "#ddd" }]}
        onPress={onReset}
      >
        <Text
          style={[styles.resetBtnText, { color: isDark ? "#888" : "#999" }]}
        >
          Cambiar rol
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export default function WorkerLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const tint = theme.green10?.val ?? "#22c55e";
  const db = useSQLiteContext();
  const { resetDevice } = useDevice();
  const { user } = useAuth();
  const { refreshStores } = useStore();
  const {
    startServer,
    onSyncCatalogReceived,
    onSyncTicketsRequested,
    onSyncPrepareReceived,
    onSyncTicketsAckReceived,
    sendCatalogAck,
    sendSyncPrepareAck,
    sendTickets,
    bumpCatalogVersion,
  } = useLan();
  const [hasSynced, setHasSynced] = useState<boolean | null>(null); // null = loading

  const showSyncNotification = useCallback((summary: CatalogChangeSummary) => {
    const lines: string[] = [];

    if (summary.newProducts > 0) {
      lines.push(
        `• ${summary.newProducts} producto${
          summary.newProducts > 1 ? "s" : ""
        } nuevo${summary.newProducts > 1 ? "s" : ""}`,
      );
    }
    if (summary.updatedProducts > 0) {
      lines.push(
        `• ${summary.updatedProducts} producto${
          summary.updatedProducts > 1 ? "s" : ""
        } actualizado${summary.updatedProducts > 1 ? "s" : ""}`,
      );
    }
    if (summary.priceChanges.length > 0) {
      lines.push(
        `• ${summary.priceChanges.length} cambio${
          summary.priceChanges.length > 1 ? "s" : ""
        } de precio:`,
      );
      for (const pc of summary.priceChanges.slice(0, 5)) {
        lines.push(
          `   ${pc.name}: $${pc.oldPrice.toFixed(2)} → $${pc.newPrice.toFixed(
            2,
          )}`,
        );
      }
      if (summary.priceChanges.length > 5) {
        lines.push(`   ...y ${summary.priceChanges.length - 5} más`);
      }
    }
    if (summary.newStores > 0) {
      lines.push(
        `• ${summary.newStores} tienda${
          summary.newStores > 1 ? "s" : ""
        } nueva${summary.newStores > 1 ? "s" : ""}`,
      );
    }
    if (summary.newWorkers > 0) {
      lines.push(
        `• ${summary.newWorkers} vendedor${
          summary.newWorkers > 1 ? "es" : ""
        } nuevo${summary.newWorkers > 1 ? "s" : ""}`,
      );
    }
    const title = "Actualización recibida";
    const body =
      lines.length > 0
        ? lines.join("\n")
        : `Catálogo sincronizado: ${summary.totalProducts} productos, ${
            summary.totalStores
          } tienda${summary.totalStores > 1 ? "s" : ""}`;

    Alert.alert(title, body, [{ text: "OK" }]);
  }, []);

  const handleReset = useCallback(() => {
    Alert.alert(
      "Cambiar rol",
      "Esto borrará el rol de este dispositivo y volverás a la pantalla de selección. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cambiar", style: "destructive", onPress: () => resetDevice() },
      ],
    );
  }, [resetDevice]);

  // Check if this worker has ever received a sync
  useEffect(() => {
    getLastSyncAt(db).then((ts) => setHasSynced(ts !== null));
  }, [db]);

  // Auto-start TCP server
  useEffect(() => {
    startServer();
  }, [startServer]);

  // Handle sync_prepare from Admin — acknowledge immediately so Admin starts sending
  useEffect(() => {
    onSyncPrepareReceived.current = (clientId, _totalBytes) => {
      sendSyncPrepareAck(clientId);
    };
    return () => {
      onSyncPrepareReceived.current = null;
    };
  }, [sendSyncPrepareAck, onSyncPrepareReceived]);

  // Handle catalog from Admin
  useEffect(() => {
    onSyncCatalogReceived.current = async (clientId, data: SyncCatalogData) => {
      try {
        console.log(`[Worker] Catalog received from ${clientId}, applying...`);
        // Log a few product stocks for debugging
        for (const p of (data.products as any[]).slice(0, 3)) {
          console.log(
            `[Worker] Incoming product "${p.name}" stock=${p.stockBaseQty}`,
          );
        }
        const summary = await applyReceivedCatalog(db, data);
        console.log(`[Worker] Catalog applied successfully, sending ACK`);

        sendCatalogAck(clientId);

        // Refresh stores so LoginSheet / StoreContext picks up newly synced stores
        await refreshStores();

        // Bump catalog version so worker screens reload products, etc.
        bumpCatalogVersion();

        setHasSynced(true);

        // Show notification with changes
        showSyncNotification(summary);
      } catch (err) {
        console.error(`[Worker] applyReceivedCatalog FAILED:`, err);
      }
    };
    return () => {
      onSyncCatalogReceived.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    db,
    sendCatalogAck,
    onSyncCatalogReceived,
    refreshStores,
    bumpCatalogVersion,
  ]);

  // Handle ticket request from Admin
  useEffect(() => {
    onSyncTicketsRequested.current = async (
      clientId: string,
      since: string | null,
    ) => {
      try {
        console.log(
          `[Worker] Tickets requested by ${clientId}, since=${since}`,
        );
        const payload = await prepareTicketsPayload(db, since);
        console.log(`[Worker] Sending tickets to ${clientId}`);
        sendTickets(clientId, payload);
      } catch (err) {
        console.error(`[Worker] prepareTicketsPayload FAILED:`, err);
      }
    };
    return () => {
      onSyncTicketsRequested.current = null;
    };
  }, [db, sendTickets, onSyncTicketsRequested]);

  // Admin confirmed it received our tickets → delete them locally
  useEffect(() => {
    onSyncTicketsAckReceived.current = async () => {
      try {
        const deleted = await deleteAllWorkerTickets(db);
        console.log(
          `[Worker] Deleted ${deleted} tickets after admin confirmed receipt`,
        );
      } catch (err) {
        console.error(`[Worker] deleteAllWorkerTickets FAILED:`, err);
      }
    };
    return () => {
      onSyncTicketsAckReceived.current = null;
    };
  }, [db, onSyncTicketsAckReceived]);

  // Show loading while checking DB
  if (hasSynced === null) {
    return (
      <View
        style={[
          styles.waitRoot,
          { backgroundColor: colorScheme === "dark" ? "#151718" : "#fff" },
        ]}
      >
        <ActivityIndicator color="#22c55e" size="large" />
      </View>
    );
  }

  // Block access until Admin syncs catalog
  if (!hasSynced) {
    return <WaitingForAdmin onReset={handleReset} />;
  }

  // Worker must log in (select store → select user → enter PIN)
  if (!user) {
    return (
      <LoginSheet
        open
        role="WORKER"
        onClose={handleReset}
        onSuccess={() => {}}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colorScheme === "dark" ? "#151718" : "#ffffff",
        },
        headerTintColor: colorScheme === "dark" ? "#f2f2f7" : "#18181b",
        headerShadowVisible: false,
        tabBarActiveTintColor: tint,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colorScheme === "dark" ? "#151718" : "#ffffff",
          borderTopColor: colorScheme === "dark" ? "#2a2a2a" : "#e5e5e5",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ventas",
          tabBarIcon: ({ color }) => (
            <ScanLine size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Registro",
          tabBarIcon: ({ color }) => (
            <LayoutList size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <User size={26} color={color as any} />,
        }}
      />
    </Tabs>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  waitRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  nameBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  nameBadgeText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  waitTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  waitSub: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  progressContainer: {
    width: "100%",
    marginTop: 16,
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    minWidth: 4,
  },
  resetBtn: {
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
