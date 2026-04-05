import { useNotifications } from "@/components/ui/notification-provider";
import { useLan } from "@/contexts/lan-context";
import { useColors } from "@/hooks/use-colors";
import type { DiscoveredServer } from "@/services/lan/lan-client";
import { LAN_PORT, serialize } from "@/services/lan/protocol";
import {
    applyReceivedTickets,
    attachPhotos,
    filterCatalogDelta,
    prepareCatalogMeta,
    type TicketImportSummary,
} from "@/services/lan/sync-service";
import {
    AlertCircle,
    ArrowDownToLine,
    ArrowUpFromLine,
    Camera,
    CheckCircle,
    Image,
    Key,
    Package,
    Receipt,
    RefreshCw,
    SkipForward,
    Store,
    Users,
    Wifi,
    WifiOff,
    Zap,
} from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ── Types ────────────────────────────────────────────────────────────────────

type WorkerSyncState =
  | "idle"
  | "connecting"
  | "preparing"
  | "sending"
  | "receiving"
  | "done"
  | "error";

interface CatalogSentSummary {
  products: number;
  stores: number;
  workers: number;
  units: number;
  /** Whether catalog was skipped (worker already had it) */
  catalogSkipped: boolean;
  /** Number of photos actually sent (only those the worker needed) */
  photosSent: number;
  /** Total photos in manifest */
  photosTotal: number;
  /** Whether a delta filter was applied (only changed rows sent) */
  isDelta?: boolean;
  /** Total counts in admin catalog (shown alongside delta counts) */
  totalProducts?: number;
  totalStores?: number;
  totalWorkers?: number;
}

interface WorkerSyncInfo {
  server: DiscoveredServer;
  state: WorkerSyncState;
  lastSyncAt: string | null;
  ticketSummary: TicketImportSummary | null;
  catalogSent: CatalogSentSummary | null;
  catalogBytes: number;
  error: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SyncSection() {
  const c = useColors();
  const db = useSQLiteContext();
  const { checkStockAlerts } = useNotifications();
  const {
    discoveredServers,
    connectionStatus,
    syncStatus,
    startDiscovery,
    stopDiscovery,
    connectToServer,
    disconnectFromServer,
    sendSyncPrepare,
    sendCatalog,
    requestTickets,
    sendTicketsAck,
    onSyncTicketsReceived,
    syncPrepareAckRef,
    bumpCatalogVersion,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSyncCatalogReceived: _onSyncCatalogReceived,
  } = useLan();

  const tint = c.blue;
  const [scanning, setScanning] = useState(false);
  const [workers, setWorkers] = useState<WorkerSyncInfo[]>([]);
  const [manualIp, setManualIp] = useState("");
  const activeWorkerRef = useRef<WorkerSyncInfo | null>(null);
  const catalogPayloadRef = useRef<any>(null);
  const catalogBytesRef = useRef<number>(0);
  const catalogHashRef = useRef<string>("");
  const photoManifestRef = useRef<Record<string, string>>({});
  const catalogSentRef = useRef<CatalogSentSummary | null>(null);
  const shouldSendPrepareRef = useRef(false);

  // ── Discovery ────────────────────────────────────────────────────────────

  const startScan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkers([]);
    setScanning(true);
    startDiscovery();
    // Auto-stop after 15 s
    setTimeout(() => {
      stopDiscovery();
      setScanning(false);
    }, 15000);
  }, [startDiscovery, stopDiscovery]);

  const connectManually = useCallback(() => {
    const ip = manualIp.trim();
    if (!ip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let host = ip;
    let port = LAN_PORT;
    if (ip.includes(":")) {
      const parts = ip.split(":");
      host = parts[0];
      const parsed = parseInt(parts[1], 10);
      if (!isNaN(parsed)) port = parsed;
    }

    const manualServer: DiscoveredServer = {
      name: `Manual-${host}`,
      host,
      port,
      storeName: host,
    };

    setWorkers((prev) => {
      if (prev.find((w) => w.server.host === host)) return prev;
      return [
        ...prev,
        {
          server: manualServer,
          state: "idle",
          lastSyncAt: null,
          ticketSummary: null,
          catalogSent: null,
          catalogBytes: 0,
          error: null,
        },
      ];
    });

    setManualIp("");
  }, [manualIp]);

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
            ticketSummary: null,
            catalogSent: null,
            catalogBytes: 0,
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

  // Wire up ticket received callback — tickets arrive FIRST, then we prepare+send catalog
  useEffect(() => {
    onSyncTicketsReceived.current = async (data) => {
      const worker = activeWorkerRef.current;
      if (!worker) return;

      try {
        const ticketSummary = await applyReceivedTickets(db, data);
        console.log(
          `[SyncSection] Tickets applied: ${ticketSummary.imported} imported, ${ticketSummary.totalReceived} total received`,
        );

        // Signal other admin screens to reload (e.g. WorkersSection photos)
        bumpCatalogVersion();

        // Prepare catalog meta (hash + photo manifest) — no photos yet
        const { payload, catalogHash, photoManifest } =
          await prepareCatalogMeta(db);
        // Log first 3 products' stock for debugging
        for (const p of (payload.products as any[]).slice(0, 3)) {
          console.log(
            `[SyncSection] Catalog product "${p.name}" stock=${p.stockBaseQty}`,
          );
        }
        catalogPayloadRef.current = payload;
        catalogHashRef.current = catalogHash;
        photoManifestRef.current = photoManifest;
        const serialized = serialize({ type: "sync_catalog", data: payload });
        const totalBytes = serialized.length;
        catalogBytesRef.current = totalBytes;

        const catalogSummary: CatalogSentSummary = {
          products: (payload.products as any[]).length,
          stores: (payload.stores as any[]).length,
          workers: (payload.workers as any[]).length,
          units: (payload.units as any[]).length,
          catalogSkipped: false,
          photosSent: 0,
          photosTotal: Object.keys(photoManifest).length,
        };
        catalogSentRef.current = catalogSummary;

        updateWorker(worker.server.host, {
          state: "preparing",
          ticketSummary,
          catalogSent: catalogSummary,
          catalogBytes: totalBytes,
        });

        // Now send sync_prepare with hash + photo manifest for delta sync
        sendSyncPrepare(
          catalogBytesRef.current,
          catalogHashRef.current,
          photoManifestRef.current,
        );
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        updateWorker(worker.server.host, {
          state: "error",
          error: `Error al procesar tickets/catálogo: ${
            e?.message || "desconocido"
          }`,
        });
        disconnectFromServer();
        activeWorkerRef.current = null;
      }
    };

    return () => {
      onSyncTicketsReceived.current = null;
    };
  }, [
    db,
    updateWorker,
    disconnectFromServer,
    sendSyncPrepare,
    onSyncTicketsReceived,
    bumpCatalogVersion,
  ]);

  // React to syncStatus changes from lan-context
  useEffect(() => {
    const worker = activeWorkerRef.current;
    console.log(
      `[SyncSection] syncStatus changed: ${syncStatus}, activeWorker=${
        worker?.server.host ?? "none"
      }`,
    );
    if (!worker) return;

    // Worker acknowledged sync_prepare → check delta-sync response
    if (syncStatus === "sending_catalog" && catalogPayloadRef.current) {
      const ack = syncPrepareAckRef.current;
      const needsCatalog = ack?.needsCatalog ?? true;
      const neededPhotos = ack?.neededPhotos ?? [];
      const lastSyncAt = ack?.lastSyncAt ?? null;
      syncPrepareAckRef.current = null; // consumed

      if (!needsCatalog && neededPhotos.length === 0) {
        // ✨ Fast path — worker already has everything
        console.log(
          "[SyncSection] Worker has latest catalog + photos, skipping catalog send",
        );
        sendTicketsAck();
        const now = new Date().toLocaleString("es-MX");
        updateWorker(worker.server.host, {
          state: "done",
          lastSyncAt: now,
          error: null,
          catalogSent: {
            ...(catalogSentRef.current ?? {
              products: 0,
              stores: 0,
              workers: 0,
              units: 0,
              catalogSkipped: false,
              photosSent: 0,
              photosTotal: 0,
            }),
            catalogSkipped: true,
            photosSent: 0,
          },
        });
        setTimeout(() => {
          disconnectFromServer();
        }, 300);
        activeWorkerRef.current = null;
      } else {
        // Apply delta filtering if worker has a previous sync timestamp
        let payloadToSend = catalogPayloadRef.current;
        if (lastSyncAt) {
          payloadToSend = filterCatalogDelta(payloadToSend, lastSyncAt);
          console.log(
            `[SyncSection] Delta sync: sending ${
              (payloadToSend.products as any[]).length
            } products (of ${payloadToSend.allProductIds?.length ?? "?"})`,
          );
        }

        // Update summary with actual counts being sent (delta or full)
        const updatedSummary: CatalogSentSummary = {
          ...(catalogSentRef.current ?? {
            products: 0,
            stores: 0,
            workers: 0,
            units: 0,
            catalogSkipped: false,
            photosSent: 0,
            photosTotal: 0,
          }),
          products: (payloadToSend.products as any[]).length,
          stores: (payloadToSend.stores as any[]).length,
          workers: (payloadToSend.workers as any[]).length,
          photosSent: neededPhotos.length,
          isDelta: !!lastSyncAt,
          totalProducts:
            payloadToSend.allProductIds?.length ??
            (payloadToSend.products as any[]).length,
          totalStores:
            payloadToSend.allStoreIds?.length ??
            (payloadToSend.stores as any[]).length,
          totalWorkers:
            payloadToSend.allWorkerIds?.length ??
            (payloadToSend.workers as any[]).length,
        };
        catalogSentRef.current = updatedSummary;

        // Attach only needed photos, then send
        updateWorker(worker.server.host, {
          state: "sending",
          catalogSent: updatedSummary,
        });
        attachPhotos(payloadToSend, neededPhotos).then((withPhotos) => {
          sendCatalog(withPhotos);
        });
      }
    }

    // Worker acknowledged catalog → sync complete
    if (syncStatus === "complete") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendTicketsAck();
      const now = new Date().toLocaleString("es-MX");
      updateWorker(worker.server.host, {
        state: "done",
        lastSyncAt: now,
        error: null,
      });
      // Check stock alerts now that tickets have decremented inventory
      checkStockAlerts();
      // Small delay so sync_tickets_ack reaches worker before socket is destroyed
      setTimeout(() => {
        disconnectFromServer();
      }, 300);
      activeWorkerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    syncStatus,
    sendCatalog,
    sendTicketsAck,
    updateWorker,
    disconnectFromServer,
    checkStockAlerts,
  ]);

  // React to connection status
  useEffect(() => {
    const worker = activeWorkerRef.current;
    console.log(
      `[SyncSection] connectionStatus changed: ${connectionStatus}, activeWorker=${
        worker?.server.host ?? "none"
      }, hasCatalog=${!!catalogPayloadRef.current}`,
    );
    if (!worker) return;

    if (connectionStatus === "paired" && shouldSendPrepareRef.current) {
      shouldSendPrepareRef.current = false;
      console.log(`[SyncSection] Paired! Requesting tickets first`);
      updateWorker(worker.server.host, { state: "receiving" });
      requestTickets(null);
    }

    if (connectionStatus === "error" && worker.state !== "idle") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      updateWorker(worker.server.host, {
        state: "error",
        error: "No se pudo conectar al Worker",
      });
      catalogPayloadRef.current = null;
      activeWorkerRef.current = null;
      shouldSendPrepareRef.current = false;
    }

    // If disconnected during active sync (sending/receiving), stop and show error
    if (
      connectionStatus === "disconnected" &&
      (worker.state === "sending" ||
        worker.state === "receiving" ||
        worker.state === "preparing")
    ) {
      disconnectFromServer(); // stops auto-reconnect
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      updateWorker(worker.server.host, {
        state: "error",
        error: "Conexión perdida durante sincronización",
      });
      catalogPayloadRef.current = null;
      activeWorkerRef.current = null;
      shouldSendPrepareRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, sendSyncPrepare, updateWorker, disconnectFromServer]);

  const syncWithWorker = useCallback(
    async (info: WorkerSyncInfo) => {
      if (
        info.state !== "idle" &&
        info.state !== "done" &&
        info.state !== "error"
      ) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      activeWorkerRef.current = info;
      catalogPayloadRef.current = null; // will be prepared after receiving tickets

      updateWorker(info.server.host, {
        state: "connecting",
        error: null,
        ticketSummary: null,
        catalogSent: null,
        catalogBytes: 0,
      });

      shouldSendPrepareRef.current = true;
      connectToServer(info.server.host, info.server.port);
      console.log(
        `[SyncSection] syncWithWorker → connecting to ${info.server.host}:${info.server.port}`,
      );
    },
    [connectToServer, updateWorker],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const borderColor = c.border;
  const cardBg = c.card;
  const mutedText = c.muted;

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

      {/* Manual IP connection */}
      <View style={[styles.manualBox, { borderColor }]}>
        <Text style={[styles.manualLabel, { color: mutedText }]}>
          ¿No aparece? Conectar por IP manualmente:
        </Text>
        <View style={styles.manualRow}>
          <TextInput
            style={[
              styles.manualInput,
              {
                backgroundColor: cardBg,
                borderColor,
                color: c.text,
              },
            ]}
            placeholder="192.168.1.x"
            placeholderTextColor={mutedText}
            value={manualIp}
            onChangeText={setManualIp}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={connectManually}
          />
          <TouchableOpacity
            style={[
              styles.manualBtn,
              {
                backgroundColor: manualIp.trim() ? tint : "#6b7280",
              },
            ]}
            onPress={connectManually}
            disabled={!manualIp.trim()}
          >
            <Text style={styles.manualBtnText}>Conectar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Workers list */}
      {workers.length === 0 && !scanning && (
        <View style={styles.emptyBox}>
          <WifiOff size={40} color={mutedText as any} />
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
  const {
    state,
    server,
    lastSyncAt,
    ticketSummary,
    catalogSent,
    catalogBytes,
    error,
  } = info;
  const busy =
    state === "connecting" ||
    state === "preparing" ||
    state === "sending" ||
    state === "receiving";

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMoney = (amount: number) =>
    `$${amount.toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const statusLabel = {
    idle: "Listo para sincronizar",
    connecting: "Conectando...",
    preparing: `Notificando al Worker... (${formatSize(catalogBytes)})`,
    sending: `Enviando catálogo (${formatSize(catalogBytes)})...`,
    receiving: "Recibiendo tickets...",
    done: "Sincronización completada",
    error: error ?? "Error desconocido",
  }[state];

  const statusColor = {
    idle: mutedText,
    connecting: "#f59e0b",
    preparing: "#f59e0b",
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
            {server.storeName}
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

      {/* Progress bar — shown during active sync */}
      {(state === "preparing" ||
        state === "sending" ||
        state === "receiving") && (
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: `${statusColor}20` },
            ]}
          >
            <View
              style={[
                styles.progressBarIndeterminate,
                { backgroundColor: statusColor },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: mutedText }]}>
            {state === "preparing"
              ? `Preparando envío de ${formatSize(catalogBytes)}...`
              : state === "sending"
              ? `Enviando ${formatSize(catalogBytes)}...`
              : "Recibiendo tickets..."}
          </Text>
        </View>
      )}

      {/* ── Sync summary ────────────────────────────────────────────────── */}
      {(state === "done" || ticketSummary || catalogSent) && (
        <View style={[styles.summaryBox, { borderTopColor: borderColor }]}>
          {/* ── RECEIVED from Worker ── */}
          {ticketSummary && (
            <View style={styles.summarySection}>
              <View style={styles.summaryHeader}>
                <ArrowDownToLine size={13} color="#22c55e" />
                <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>
                  Recibido del Worker
                </Text>
              </View>

              {ticketSummary.imported > 0 ? (
                <>
                  <View style={styles.summaryRow}>
                    <SummaryPill
                      icon={<Receipt size={11} color="#22c55e" />}
                      label="Tickets"
                      value={`${ticketSummary.imported}`}
                      color="#22c55e"
                    />
                    <SummaryPill
                      label="Monto total"
                      value={formatMoney(ticketSummary.totalAmount)}
                      color="#22c55e"
                    />
                    <SummaryPill
                      label="Artículos"
                      value={`${ticketSummary.totalItems}`}
                      color="#22c55e"
                    />
                  </View>
                  {ticketSummary.duplicates > 0 && (
                    <Text style={[styles.detailLine, { color: mutedText }]}>
                      {ticketSummary.duplicates} ticket
                      {ticketSummary.duplicates > 1 ? "s" : ""} duplicado
                      {ticketSummary.duplicates > 1 ? "s" : ""} (omitido
                      {ticketSummary.duplicates > 1 ? "s" : ""})
                    </Text>
                  )}
                </>
              ) : (
                <Text style={[styles.detailLine, { color: mutedText }]}>
                  Sin tickets nuevos
                </Text>
              )}

              {/* Worker profile changes */}
              {(ticketSummary.pinUpdates.length > 0 ||
                ticketSummary.photoUpdates.length > 0) && (
                <View style={styles.profileChanges}>
                  {ticketSummary.pinUpdates.length > 0 && (
                    <View style={styles.profileRow}>
                      <Key size={11} color="#f59e0b" />
                      <Text style={[styles.profileText, { color: textColor }]}>
                        PIN actualizado: {ticketSummary.pinUpdates.join(", ")}
                      </Text>
                    </View>
                  )}
                  {ticketSummary.photoUpdates.length > 0 && (
                    <View style={styles.profileRow}>
                      <Camera size={11} color="#8b5cf6" />
                      <Text style={[styles.profileText, { color: textColor }]}>
                        Foto actualizada:{" "}
                        {ticketSummary.photoUpdates.join(", ")}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ── SENT to Worker ── */}
          {catalogSent && (
            <View style={styles.summarySection}>
              <View style={styles.summaryHeader}>
                <ArrowUpFromLine size={13} color="#3b82f6" />
                <Text style={[styles.summaryLabel, { color: "#3b82f6" }]}>
                  Enviado al Worker
                </Text>
              </View>

              {catalogSent.catalogSkipped ? (
                <View style={styles.skippedRow}>
                  <SkipForward size={12} color="#f59e0b" />
                  <Text style={[styles.skippedText, { color: "#f59e0b" }]}>
                    Catálogo sin cambios — no se envió
                  </Text>
                </View>
              ) : (
                <View style={styles.summaryRow}>
                  <SummaryPill
                    icon={<Package size={11} color="#3b82f6" />}
                    label="Productos"
                    value={
                      catalogSent.isDelta
                        ? `${catalogSent.products}/${
                            catalogSent.totalProducts ?? catalogSent.products
                          }`
                        : `${catalogSent.products}`
                    }
                    color="#3b82f6"
                  />
                  <SummaryPill
                    icon={<Store size={11} color="#8b5cf6" />}
                    label="Tiendas"
                    value={
                      catalogSent.isDelta
                        ? `${catalogSent.stores}/${
                            catalogSent.totalStores ?? catalogSent.stores
                          }`
                        : `${catalogSent.stores}`
                    }
                    color="#8b5cf6"
                  />
                  <SummaryPill
                    icon={<Users size={11} color="#f59e0b" />}
                    label="Vendedores"
                    value={
                      catalogSent.isDelta
                        ? `${catalogSent.workers}/${
                            catalogSent.totalWorkers ?? catalogSent.workers
                          }`
                        : `${catalogSent.workers}`
                    }
                    color="#f59e0b"
                  />
                </View>
              )}

              {/* Photo summary */}
              {catalogSent.photosTotal > 0 && (
                <View style={styles.profileRow}>
                  <Image size={11} color={mutedText as any} />
                  <Text style={[styles.profileText, { color: mutedText }]}>
                    Fotos: {catalogSent.photosSent} enviada
                    {catalogSent.photosSent !== 1 ? "s" : ""} de{" "}
                    {catalogSent.photosTotal} total
                    {catalogSent.photosTotal !== 1 ? "es" : ""}
                    {catalogSent.photosSent === 0 &&
                      catalogSent.photosTotal > 0 &&
                      " (Worker ya las tenía)"}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SummaryPill({
  icon,
  label,
  value,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}15` }]}>
      {icon}
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

  manualBox: {
    gap: 8,
    paddingVertical: 8,
  },
  manualLabel: { fontSize: 13 },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  manualInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  manualBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  manualBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

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

  progressContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarIndeterminate: {
    height: "100%",
    width: "30%",
    borderRadius: 3,
    opacity: 0.7,
  },
  progressText: {
    fontSize: 11,
  },

  summaryBox: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  summarySection: {
    gap: 6,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  detailLine: {
    fontSize: 12,
    marginLeft: 4,
  },
  profileChanges: {
    gap: 4,
    marginTop: 2,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 4,
  },
  profileText: {
    fontSize: 12,
  },
  skippedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 4,
    paddingVertical: 2,
  },
  skippedText: {
    fontSize: 12,
    fontWeight: "500",
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
