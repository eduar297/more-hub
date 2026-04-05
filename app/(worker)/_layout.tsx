import { LoginSheet } from "@/components/auth/login-sheet";
import { HapticTab } from "@/components/haptic-tab";
import { useNotifications } from "@/components/ui/notification-provider";
import { useAuth } from "@/contexts/auth-context";
import { useDevice } from "@/contexts/device-context";
import { useLan } from "@/contexts/lan-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import type { SyncCatalogData } from "@/services/lan/protocol";
import {
    applyReceivedCatalog,
    checkCatalogNeeds,
    deleteAllWorkerTickets,
    getLastSyncAt,
    prepareTicketsPayload,
    saveCatalogHash,
    type CatalogChangeSummary,
} from "@/services/lan/sync-service";
import {
    Download,
    LayoutList,
    Monitor,
    ScanLine,
    User,
    Wifi,
} from "@tamagui/lucide-icons";
import { Tabs } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const c = useColors();
  const { connectionStatus, syncStatus, syncProgress, workerName } = useLan();

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
    <View style={[styles.waitRoot, { backgroundColor: c.bg }]}>
      {/* Worker identity badge */}
      {workerName ? (
        <View
          style={[
            styles.nameBadge,
            {
              backgroundColor: c.successBg,
              borderColor: c.greenLight,
            },
          ]}
        >
          <Text style={[styles.nameBadgeText, { color: c.green }]}>
            {workerName}
          </Text>
        </View>
      ) : null}

      {showProgress ? (
        <Download size={56} color={color as any} />
      ) : (
        <Wifi size={56} color={color as any} />
      )}
      <Text style={[styles.waitTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.waitSub, { color: c.muted }]}>{subtitle}</Text>

      {/* Progress bar */}
      {showProgress ? (
        <View style={styles.progressContainer}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
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
        style={[styles.resetBtn, { borderColor: c.border }]}
        onPress={onReset}
      >
        <Text style={[styles.resetBtnText, { color: c.muted }]}>
          Cambiar rol
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export default function WorkerLayout() {
  const c = useColors();
  const theme = useTheme();
  const tint = theme.green10?.val ?? "#22c55e";
  const db = useSQLiteContext();
  const { resetDevice } = useDevice();
  const { user, logout } = useAuth();
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
  const { notify } = useNotifications();
  const [hasSynced, setHasSynced] = useState<boolean | null>(null); // null = loading
  /** Store latest catalog hash so we can save it after successful apply */
  const pendingCatalogHashRef = useRef<string | null>(null);

  const showSyncNotification = useCallback(
    (summary: CatalogChangeSummary) => {
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
      if (summary.deletedProducts > 0) {
        lines.push(
          `• ${summary.deletedProducts} producto${
            summary.deletedProducts > 1 ? "s" : ""
          } eliminado${summary.deletedProducts > 1 ? "s" : ""}`,
        );
      }
      if (summary.priceChanges.length > 0) {
        lines.push(
          `• ${summary.priceChanges.length} cambio${
            summary.priceChanges.length > 1 ? "s" : ""
          } de precio`,
        );
      }
      if (summary.newStores > 0) {
        lines.push(
          `• ${summary.newStores} tienda${
            summary.newStores > 1 ? "s" : ""
          } nueva${summary.newStores > 1 ? "s" : ""}`,
        );
      }
      if (summary.deletedStores > 0) {
        lines.push(
          `• ${summary.deletedStores} tienda${
            summary.deletedStores > 1 ? "s" : ""
          } eliminada${summary.deletedStores > 1 ? "s" : ""}`,
        );
      }
      if (summary.newWorkers > 0) {
        lines.push(
          `• ${summary.newWorkers} vendedor${
            summary.newWorkers > 1 ? "es" : ""
          } nuevo${summary.newWorkers > 1 ? "s" : ""}`,
        );
      }
      if (summary.deletedWorkers > 0) {
        lines.push(
          `• ${summary.deletedWorkers} vendedor${
            summary.deletedWorkers > 1 ? "es" : ""
          } eliminado${summary.deletedWorkers > 1 ? "s" : ""}`,
        );
      }

      const body =
        lines.length > 0
          ? lines.join("\n")
          : `Catálogo sincronizado: ${summary.totalProducts} productos, ${
              summary.totalStores
            } tienda${summary.totalStores > 1 ? "s" : ""}`;

      notify({
        category: "sync_result",
        severity: "success",
        title: "Actualización recibida",
        body,
      });
    },
    [notify],
  );

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

  // Handle sync_prepare from Admin — check delta needs and respond
  useEffect(() => {
    onSyncPrepareReceived.current = async (
      clientId,
      _totalBytes,
      catalogHash,
      photoManifest,
    ) => {
      try {
        const { needsCatalog, neededPhotos } = await checkCatalogNeeds(
          db,
          catalogHash,
          photoManifest,
        );
        // Store hash so we can save it after catalog is applied
        pendingCatalogHashRef.current = catalogHash;
        sendSyncPrepareAck(clientId, needsCatalog, neededPhotos);
      } catch (err) {
        console.error("[Worker] checkCatalogNeeds FAILED:", err);
        // Fallback: request everything
        pendingCatalogHashRef.current = catalogHash;
        sendSyncPrepareAck(clientId, true, Object.keys(photoManifest));
      }
    };
    return () => {
      onSyncPrepareReceived.current = null;
    };
  }, [db, sendSyncPrepareAck, onSyncPrepareReceived]);

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

        // Save catalog hash so next sync can skip if unchanged
        if (pendingCatalogHashRef.current) {
          await saveCatalogHash(db, pendingCatalogHashRef.current);
          pendingCatalogHashRef.current = null;
        }

        sendCatalogAck(clientId);

        // Refresh stores so LoginSheet / StoreContext picks up newly synced stores
        await refreshStores();

        // Bump catalog version so worker screens reload products, etc.
        bumpCatalogVersion();

        // If the currently logged-in worker was deleted by admin, log them out
        if (user) {
          const stillExists = await db.getFirstAsync<{ id: number }>(
            "SELECT id FROM users WHERE id = ?",
            [user.id],
          );
          if (!stillExists) {
            console.log(
              `[Worker] Current user ${user.id} was deleted by admin, logging out`,
            );
            logout();
          }
        }

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
    user,
    logout,
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
      <View style={[styles.waitRoot, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.green} size="large" />
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
          backgroundColor: c.headerBg,
        },
        headerTintColor: c.headerText,
        headerShadowVisible: false,
        tabBarActiveTintColor: tint,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: c.tabBarBg,
          borderTopColor: c.tabBarBorder,
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
        name="display"
        options={{
          title: "Display",
          tabBarIcon: ({ color }) => <Monitor size={26} color={color as any} />,
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
