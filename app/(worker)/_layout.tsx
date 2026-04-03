import { LoginSheet } from "@/components/auth/login-sheet";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/contexts/auth-context";
import { useDevice } from "@/contexts/device-context";
import { useLan } from "@/contexts/lan-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { SyncCatalogData } from "@/services/lan/protocol";
import {
  applyReceivedCatalog,
  type CatalogChangeSummary,
  getLastSyncAt,
  prepareTicketsPayload,
} from "@/services/lan/sync-service";
import { LayoutList, ScanLine, User, Wifi } from "@tamagui/lucide-icons";
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

// ── Waiting-for-sync screen ─────────────────────────────────────────────────

function WaitingForAdmin({ onReset }: { onReset: () => void }) {
  const colorScheme = useColorScheme();
  const { connectionStatus, syncStatus } = useLan();
  const isDark = colorScheme === "dark";

  // Show different states based on connection status
  const getStatusInfo = () => {
    if (connectionStatus === "connecting") {
      return {
        title: "Conectando...",
        subtitle: "El administrador está estableciendo conexión",
        color: "#f59e0b", // orange
      };
    }
    if (connectionStatus === "paired" || syncStatus === "receiving_tickets") {
      return {
        title: "Recibiendo datos",
        subtitle: "Descargando catálogo de productos desde el administrador",
        color: "#3b82f6", // blue
      };
    }
    return {
      title: "Esperando datos",
      subtitle:
        "El administrador debe sincronizar este Worker desde su app antes de poder iniciar sesión.",
      color: "#22c55e", // green
    };
  };

  const { title, subtitle, color } = getStatusInfo();

  return (
    <View
      style={[
        styles.waitRoot,
        { backgroundColor: isDark ? "#151718" : "#ffffff" },
      ]}
    >
      <Wifi size={56} color={color as any} />
      <Text
        style={[styles.waitTitle, { color: isDark ? "#f2f2f7" : "#18181b" }]}
      >
        {title}
      </Text>
      <Text style={[styles.waitSub, { color: isDark ? "#888" : "#999" }]}>
        {subtitle}
      </Text>
      <ActivityIndicator
        color={color as any}
        size="large"
        style={{ marginTop: 16 }}
      />
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
  const {
    startServer,
    onSyncCatalogReceived,
    onSyncTicketsRequested,
    sendCatalogAck,
    sendTickets,
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
    if (summary.ticketsImported > 0) {
      lines.push(
        `• ${summary.ticketsImported} ticket${
          summary.ticketsImported > 1 ? "s" : ""
        } recibido${summary.ticketsImported > 1 ? "s" : ""}`,
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

  // Handle catalog from Admin
  useEffect(() => {
    onSyncCatalogReceived.current = async (clientId, data: SyncCatalogData) => {
      try {
        const summary = await applyReceivedCatalog(db, data);

        sendCatalogAck(clientId);

        setHasSynced(true);

        // Show notification with changes
        showSyncNotification(summary);
      } catch {}
    };
    return () => {
      onSyncCatalogReceived.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sendCatalogAck, onSyncCatalogReceived]);

  // Handle ticket request from Admin
  useEffect(() => {
    onSyncTicketsRequested.current = async (
      clientId: string,
      since: string | null,
    ) => {
      try {
        const payload = await prepareTicketsPayload(db, since);

        sendTickets(clientId, payload);
      } catch {}
    };
    return () => {
      onSyncTicketsRequested.current = null;
    };
  }, [db, sendTickets, onSyncTicketsRequested]);

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
