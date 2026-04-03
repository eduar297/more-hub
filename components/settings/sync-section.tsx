import { useLan } from "@/contexts/lan-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColors } from "@/hooks/use-colors";
import type { DiscoveredServer } from "@/services/lan/lan-client";
import {
  applyReceivedTickets,
  prepareCatalogPayload,
} from "@/services/lan/sync-service";
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ────────────────────────────────────────────────────────────────────

type WorkerSyncState =
  | "idle"
  | "connecting"
  | "sending"
  | "receiving"
  | "done"
  | "error";

interface CatalogSentSummary {
  products: number;
  stores: number;
  workers: number;
  units: number;
  tickets: number;
}

interface WorkerSyncInfo {
  server: DiscoveredServer;
  state: WorkerSyncState;
  lastSyncAt: string | null;
  ticketsImported: number;
  catalogSent: CatalogSentSummary | null;
  error: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SyncSection() {
  const c = useColors();
  const isDark = useColorScheme() === "dark";
  const db = useSQLiteContext();
  const {
    discoveredServers,
    connectionStatus,
    syncStatus,
    startDiscovery,
    stopDiscovery,
    connectToServer,
    disconnectFromServer,
    sendCatalog,
    requestTickets,
    onSyncTicketsReceived,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSyncCatalogReceived: _onSyncCatalogReceived,
  } = useLan();

  const tint = c.green;
  const [scanning, setScanning] = useState(false);
  const [workers, setWorkers] = useState<WorkerSyncInfo[]>([]);
  const activeWorkerRef = useRef<WorkerSyncInfo | null>(null);
  const catalogPayloadRef = useRef<any>(null);

  // ── Discovery ────────────────────────────────────────────────────────────

  const startScan = useCallback(() => {
    setWorkers([]);
    setScanning(true);
    startDiscovery();
    // Auto-stop after 15 s
    setTimeout(() => {
      stopDiscovery();
      setScanning(false);
    }, 15000);
  }, [startDiscovery, stopDiscovery]);

  // Update workers list when new servers discovered
  useEffect(() => {
    setWorkers((prev) => {
      const existing = new Map(prev.map((w) => [w.server.host, w]));
      for (const s of discoveredServers) {
        if (!existing.has(s.host)) {
          existing.set(s.host, {
            server: s,
            state: "idle",
            lastSyncAt: null,
            ticketsImported: 0,
            catalogSent: null,
            error: null,
          });
        }
      }
      return Array.from(existing.values());
    });
  }, [discoveredServers]);

  // ── Sync flow ────────────────────────────────────────────────────────────

  const updateWorker = useCallback(
    (host: string, patch: Partial<WorkerSyncInfo>) => {
      setWorkers((prev) =>
        prev.map((w) => (w.server.host === host ? { ...w, ...patch } : w)),
      );
    },
    [],
  );

  // Wire up ticket received callback
  useEffect(() => {
    onSyncTicketsReceived.current = async (data) => {
      const worker = activeWorkerRef.current;
      if (!worker) return;

      try {
        const imported = await applyReceivedTickets(db, data);
        const now = new Date().toLocaleString("es-MX");
        updateWorker(worker.server.host, {
          state: "done",
          ticketsImported: imported,
          lastSyncAt: now,
          error: null,
        });
        disconnectFromServer();
        activeWorkerRef.current = null;
      } catch (e: any) {
        updateWorker(worker.server.host, {
          state: "error",
          error: `Error al guardar tickets: ${e?.message || "desconocido"}`,
        });
        disconnectFromServer();
        activeWorkerRef.current = null;
      }
    };

    return () => {
      onSyncTicketsReceived.current = null;
    };
  }, [db, updateWorker, disconnectFromServer, onSyncTicketsReceived]);

  // React to syncStatus changes from lan-context
  useEffect(() => {
    const worker = activeWorkerRef.current;
    if (!worker) return;

    if (syncStatus === "requesting_tickets") {
      updateWorker(worker.server.host, { state: "receiving" });
      requestTickets(null); // request ALL tickets (first sync)
    }
  }, [syncStatus, requestTickets, updateWorker]);

  // React to connection status
  useEffect(() => {
    const worker = activeWorkerRef.current;
    if (!worker) return;

    if (connectionStatus === "paired" && catalogPayloadRef.current) {
      // Connected — now send catalog

      updateWorker(worker.server.host, { state: "sending" });
      sendCatalog(catalogPayloadRef.current);
    }

    if (connectionStatus === "error" && worker.state !== "idle") {
      updateWorker(worker.server.host, {
        state: "error",
        error: "No se pudo conectar al Worker",
      });
      activeWorkerRef.current = null;
    }
  }, [connectionStatus, sendCatalog, updateWorker]);

  const syncWithWorker = useCallback(
    async (info: WorkerSyncInfo) => {
      if (
        info.state !== "idle" &&
        info.state !== "done" &&
        info.state !== "error"
      ) {
        return;
      }

      try {
        // Prepare catalog payload
        const payload = await prepareCatalogPayload(db);

        catalogPayloadRef.current = payload;
        activeWorkerRef.current = info;

        const catalogSummary: CatalogSentSummary = {
          products: (payload.products as any[]).length,
          stores: (payload.stores as any[]).length,
          workers: (payload.workers as any[]).length,
          units: (payload.units as any[]).length,
          tickets: (payload.tickets as any[]).length,
        };

        updateWorker(info.server.host, {
          state: "connecting",
          error: null,
          ticketsImported: 0,
          catalogSent: catalogSummary,
        });

        connectToServer(info.server.host, info.server.port);
      } catch {
        updateWorker(info.server.host, {
          state: "error",
          error: "Error al preparar catálogo",
        });
      }
    },
    [db, connectToServer, updateWorker],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const borderColor = isDark ? "#2a2a2a" : "#e5e5e5";
  const cardBg = isDark ? "#1c1c1e" : "#f9f9f9";
  const mutedText = isDark ? "#888" : "#999";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          Sincronizar con Workers
        </Text>
        <Text style={[styles.headerSub, { color: mutedText }]}>
          Envía el catálogo y recibe tickets de venta
        </Text>
      </View>

      {/* Scan button */}
      <TouchableOpacity
        style={[
          styles.scanBtn,
          { backgroundColor: scanning ? "#6b7280" : tint },
        ]}
        onPress={startScan}
        disabled={scanning}
      >
        {scanning ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Wifi size={18} color="#fff" />
        )}
        <Text style={styles.scanBtnText}>
          {scanning ? "Buscando Workers..." : "Buscar Workers en la red"}
        </Text>
      </TouchableOpacity>

      {/* Workers list */}
      {workers.length === 0 && !scanning && (
        <View style={styles.emptyBox}>
          <WifiOff size={40} color={mutedText} />
          <Text style={[styles.emptyText, { color: mutedText }]}>
            No se encontraron Workers.{"\n"}
            Verifica que el Worker esté en modo &quot;Esperando datos&quot; y en
            la misma red WiFi.
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: tint as any }]}
            onPress={startScan}
          >
            <RefreshCw size={14} color={tint as any} />
            <Text style={[styles.retryText, { color: tint as any }]}>
              Buscar de nuevo
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {workers.map((info) => (
        <WorkerCard
          key={info.server.host}
          info={info}
          onSync={() => syncWithWorker(info)}
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={c.text}
          mutedText={mutedText}
          tint={tint}
        />
      ))}
    </ScrollView>
  );
}

// ── Worker card ──────────────────────────────────────────────────────────────

function WorkerCard({
  info,
  onSync,
  cardBg,
  borderColor,
  textColor,
  mutedText,
  tint,
}: {
  info: WorkerSyncInfo;
  onSync: () => void;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedText: string;
  tint: string;
}) {
  const { state, server, lastSyncAt, ticketsImported, catalogSent, error } =
    info;
  const busy =
    state === "connecting" || state === "sending" || state === "receiving";

  const statusLabel = {
    idle: "Listo para sincronizar",
    connecting: "Conectando...",
    sending: "Enviando catálogo...",
    receiving: "Recibiendo tickets...",
    done: "Sincronización completada",
    error: error ?? "Error desconocido",
  }[state];

  const statusColor = {
    idle: mutedText,
    connecting: "#f59e0b",
    sending: "#3b82f6",
    receiving: "#8b5cf6",
    done: "#22c55e",
    error: "#ef4444",
  }[state];

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: textColor }]}>
            {server.name}
          </Text>
          <Text style={[styles.cardIp, { color: mutedText }]}>
            {server.host}:{server.port}
          </Text>
          {lastSyncAt && (
            <Text style={[styles.cardLastSync, { color: mutedText }]}>
              Última sync: {lastSyncAt}
            </Text>
          )}
        </View>
        <View style={styles.cardActions}>
          {busy ? (
            <ActivityIndicator color={tint} size="small" />
          ) : state === "done" ? (
            <CheckCircle size={24} color="#22c55e" />
          ) : state === "error" ? (
            <AlertCircle size={24} color="#ef4444" />
          ) : null}

          <TouchableOpacity
            style={[
              styles.syncBtn,
              { backgroundColor: busy ? "#6b7280" : tint },
            ]}
            onPress={onSync}
            disabled={busy}
          >
            <RefreshCw size={14} color="#fff" />
            <Text style={styles.syncBtnText}>
              {state === "done" || state === "error"
                ? "Re-sync"
                : "Sincronizar"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status bar */}
      <View style={[styles.statusBar, { borderTopColor: borderColor }]}>
        <Zap size={12} color={statusColor as any} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>

      {/* Sync summary — shown when done or during sync */}
      {(state === "done" || catalogSent) && (
        <View style={[styles.summaryBox, { borderTopColor: borderColor }]}>
          {/* Sent */}
          {catalogSent && (
            <View style={styles.summarySection}>
              <Text style={[styles.summaryLabel, { color: "#3b82f6" }]}>
                ↑ Enviado al Worker
              </Text>
              <View style={styles.summaryRow}>
                <SummaryPill
                  label="Productos"
                  value={catalogSent.products}
                  color="#3b82f6"
                />
                <SummaryPill
                  label="Tiendas"
                  value={catalogSent.stores}
                  color="#8b5cf6"
                />
                <SummaryPill
                  label="Vendedores"
                  value={catalogSent.workers}
                  color="#f59e0b"
                />
                <SummaryPill
                  label="Unidades"
                  value={catalogSent.units}
                  color="#6b7280"
                />
                <SummaryPill
                  label="Tickets"
                  value={catalogSent.tickets}
                  color="#ec4899"
                />
              </View>
            </View>
          )}

          {/* Received */}
          {state === "done" && (
            <View style={styles.summarySection}>
              <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>
                ↓ Recibido del Worker
              </Text>
              <View style={styles.summaryRow}>
                <SummaryPill
                  label="Tickets"
                  value={ticketsImported}
                  color="#22c55e"
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SummaryPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}15` }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  header: {
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  headerSub: { fontSize: 13 },

  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  scanBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  retryText: { fontSize: 13, fontWeight: "500" },

  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: "600" },
  cardIp: { fontSize: 12 },
  cardLastSync: { fontSize: 11 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 10 },

  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  syncBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusText: { fontSize: 12 },

  summaryBox: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  summarySection: {
    gap: 6,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  pillLabel: {
    fontSize: 11,
  },
});
