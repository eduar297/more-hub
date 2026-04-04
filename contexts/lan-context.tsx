import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { AppState } from "react-native";

import { useDevice } from "@/contexts/device-context";
import {
    LanClient,
    type ConnectionStatus,
    type DiscoveredServer,
} from "@/services/lan/lan-client";
import { LanServer } from "@/services/lan/lan-server";
import {
    EMPTY_MIRROR,
    type CartItemWire,
    type CartMirrorState,
    type LanMessage,
    type SyncCatalogData,
    type SyncTicketsData,
} from "@/services/lan/protocol";

// ── Context value ────────────────────────────────────────────────────────────

export type SyncStatus =
  | "idle"
  | "preparing"
  | "sending_catalog"
  | "requesting_tickets"
  | "receiving_tickets"
  | "complete"
  | "error";

export interface SyncProgress {
  receivedBytes: number;
  totalBytes: number;
}

interface LanContextValue {
  // Server (Worker) side — used when deviceRole === 'WORKER'
  /** Friendly name shown as "Vendedor-XXXX" (last 4 of deviceId) */
  workerName: string;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  broadcastCart: (cart: CartItemWire[], total: number) => void;
  broadcastCheckout: (
    total: number,
    itemCount: number,
    paymentMethod: "CASH" | "CARD",
  ) => void;
  broadcastClear: () => void;
  pairingCode: string;
  serverIp: string;
  serverRunning: boolean;
  connectedDisplays: number;

  // Client side — used by Display (cart mirror) and Admin (sync)
  startDiscovery: () => void;
  stopDiscovery: () => void;
  connectToServer: (host: string, port: number, code?: string) => void;
  disconnectFromServer: () => void;
  discoveredServers: DiscoveredServer[];
  connectionStatus: ConnectionStatus;
  cartMirror: CartMirrorState;

  // Sync state — used by Admin (as client) and Worker (as server)
  syncStatus: SyncStatus;
  syncProgress: SyncProgress | null;
  lastSyncAt: string | null;
  /** Admin: notify worker about incoming data size, then send catalog */
  sendSyncPrepare: (totalBytes: number) => void;
  /** Admin: send catalog to Worker */
  sendCatalog: (data: SyncCatalogData) => void;
  /** Admin: request tickets from Worker */
  requestTickets: (since: string | null) => void;
  /** Worker: respond with tickets */
  sendTickets: (clientId: string, data: SyncTicketsData) => void;
  /** Worker: acknowledge catalog received */
  sendCatalogAck: (clientId: string) => void;
  /** Worker: acknowledge sync prepare (ready to receive) */
  sendSyncPrepareAck: (clientId: string) => void;
  /** Admin: acknowledge tickets received (so Worker can delete them) */
  sendTicketsAck: () => void;
  /** Callback: set from outside to handle sync messages on Worker/Admin */
  onSyncCatalogReceived: React.MutableRefObject<
    ((clientId: string, data: SyncCatalogData) => void) | null
  >;
  onSyncTicketsReceived: React.MutableRefObject<
    ((data: SyncTicketsData) => void) | null
  >;
  onSyncTicketsRequested: React.MutableRefObject<
    ((clientId: string, since: string | null) => void) | null
  >;
  /** Callback: worker receives sync_prepare from admin */
  onSyncPrepareReceived: React.MutableRefObject<
    ((clientId: string, totalBytes: number) => void) | null
  >;
  /** Callback: worker receives sync_tickets_ack — tickets confirmed received by admin */
  onSyncTicketsAckReceived: React.MutableRefObject<(() => void) | null>;

  /** Worker server ref for direct access */
  serverRef: React.MutableRefObject<LanServer | null>;

  /** Monotonic counter bumped after each catalog apply — screens watch this to reload */
  catalogVersion: number;
  bumpCatalogVersion: () => void;
}

const LanContext = createContext<LanContextValue>({
  workerName: "",
  startServer: async () => {},
  stopServer: async () => {},
  broadcastCart: () => {},
  broadcastCheckout: () => {},
  broadcastClear: () => {},
  pairingCode: "",
  serverIp: "",
  serverRunning: false,
  connectedDisplays: 0,
  startDiscovery: () => {},
  stopDiscovery: () => {},
  connectToServer: () => {},
  disconnectFromServer: () => {},
  discoveredServers: [],
  connectionStatus: "idle",
  cartMirror: EMPTY_MIRROR,
  syncStatus: "idle",
  syncProgress: null,
  lastSyncAt: null,
  sendSyncPrepare: () => {},
  sendCatalog: () => {},
  requestTickets: () => {},
  sendTickets: () => {},
  sendCatalogAck: () => {},
  sendSyncPrepareAck: () => {},
  sendTicketsAck: () => {},
  onSyncCatalogReceived: { current: null },
  onSyncTicketsReceived: { current: null },
  onSyncTicketsRequested: { current: null },
  onSyncPrepareReceived: { current: null },
  onSyncTicketsAckReceived: { current: null },
  serverRef: { current: null },
  catalogVersion: 0,
  bumpCatalogVersion: () => {},
});

// Module-level singleton so the server survives React hot-reloads.
// Without this the old instance is orphaned and the TCP port stays bound.
let _serverSingleton: LanServer | null = null;

// ── Provider ─────────────────────────────────────────────────────────────────

export function LanProvider({ children }: { children: React.ReactNode }) {
  const { deviceId, deviceRole } = useDevice();

  // ── Sync callback refs (set by admin/worker screens) ─────────────────────
  const onSyncCatalogReceived = useRef<
    ((clientId: string, data: SyncCatalogData) => void) | null
  >(null);
  const onSyncTicketsReceived = useRef<
    ((data: SyncTicketsData) => void) | null
  >(null);
  const onSyncTicketsRequested = useRef<
    ((clientId: string, since: string | null) => void) | null
  >(null);
  const onSyncPrepareReceived = useRef<
    ((clientId: string, totalBytes: number) => void) | null
  >(null);
  const onSyncTicketsAckReceived = useRef<(() => void) | null>(null);

  // ── Server state (Worker) ────────────────────────────────────────────────

  // Ref mirrors the module-level singleton for context consumers
  const serverRef = useRef<LanServer | null>(_serverSingleton);
  const [pairingCode, setPairingCode] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [serverRunning, setServerRunning] = useState(false);
  const [connectedDisplays, setConnectedDisplays] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const bumpCatalogVersion = useCallback(
    () => setCatalogVersion((v) => v + 1),
    [],
  );

  const updateDisplayCount = useCallback(() => {
    const count = serverRef.current?.displayClients.length ?? 0;
    setConnectedDisplays(count);
  }, []);

  const startServer = useCallback(async () => {
    // Always stop any existing server first (handles hot-reload EADDRINUSE)
    // Check both the ref AND the module singleton (ref may be stale after reload)
    const existing = _serverSingleton ?? serverRef.current;
    if (existing) {
      console.log("[LanCtx] Stopping existing server before restart");
      await existing.stop();
      _serverSingleton = null;
      serverRef.current = null;
    }

    console.log("[LanCtx] Creating new LanServer...");
    const server = new LanServer();
    server.setCallbacks({
      onClientConnected: (client) => {
        console.log(
          `[LanCtx:Server] Client connected: ${client.id} role=${client.role} paired=${client.paired}`,
        );
        updateDisplayCount();
      },
      onClientDisconnected: (clientId) => {
        console.log(`[LanCtx:Server] Client disconnected: ${clientId}`);
        updateDisplayCount();
      },
      isDevicePaired: async () => {
        return true; // Worker accepts all connections
      },
      onDevicePaired: async () => {},
      onSyncMessage: (clientId, msg) => {
        console.log(
          `[LanCtx:Server] Sync message from ${clientId}: type=${msg.type}`,
        );
        switch (msg.type) {
          case "sync_prepare":
            setSyncProgress({ receivedBytes: 0, totalBytes: msg.totalBytes });
            onSyncPrepareReceived.current?.(clientId, msg.totalBytes);
            break;
          case "sync_catalog":
            setSyncProgress(null);
            onSyncCatalogReceived.current?.(clientId, msg.data);
            break;
          case "sync_tickets_request":
            onSyncTicketsRequested.current?.(clientId, msg.since);
            break;
          case "sync_tickets_ack": {
            const now = new Date().toISOString();
            setLastSyncAt(now);
            setSyncStatus("complete");
            // Notify worker layout so it can delete sent tickets
            onSyncTicketsAckReceived.current?.();
            break;
          }
          case "sync_complete":
            setSyncStatus("idle");
            break;
        }
      },
      onSyncProgress: (_clientId, receivedBytes, totalBytes) => {
        setSyncProgress({ receivedBytes, totalBytes });
      },
    });

    const shortId = deviceId.slice(-4).toUpperCase();
    const name = `Vendedor-${shortId}`;

    try {
      await server.start(name);
      console.log(
        `[LanCtx] Server started as "${name}" on ${server.ipAddress}:9847 code=${server.pairingCode}`,
      );

      _serverSingleton = server;
      serverRef.current = server;
      setPairingCode(server.pairingCode);
      setServerIp(server.ipAddress);
      setServerRunning(true);
    } catch (err) {
      console.error("[LanCtx] Server start FAILED:", err);
    }
  }, [deviceId, updateDisplayCount]);

  const stopServer = useCallback(async () => {
    const existing = _serverSingleton ?? serverRef.current;
    if (existing) {
      await existing.stop();
      _serverSingleton = null;
      serverRef.current = null;
    }
    setPairingCode("");
    setServerIp("");
    setServerRunning(false);
    setConnectedDisplays(0);
  }, []);

  const broadcastCart = useCallback((cart: CartItemWire[], total: number) => {
    serverRef.current?.broadcast({ type: "cart_update", cart, total });
  }, []);

  const broadcastCheckout = useCallback(
    (total: number, itemCount: number, paymentMethod: "CASH" | "CARD") => {
      serverRef.current?.broadcast({
        type: "checkout_complete",
        total,
        itemCount,
        paymentMethod,
      });
    },
    [],
  );

  const broadcastClear = useCallback(() => {
    serverRef.current?.broadcast({ type: "cart_clear" });
  }, []);

  // Worker sync responses
  const sendCatalogAck = useCallback((clientId: string) => {
    serverRef.current?.sendToClient(clientId, { type: "sync_catalog_ack" });
  }, []);

  const sendSyncPrepareAck = useCallback((clientId: string) => {
    serverRef.current?.sendToClient(clientId, { type: "sync_prepare_ack" });
  }, []);

  const sendTickets = useCallback((clientId: string, data: SyncTicketsData) => {
    serverRef.current?.sendToClient(clientId, {
      type: "sync_tickets",
      data,
    });
  }, []);

  // Cleanup server on unmount
  useEffect(() => {
    return () => {
      const existing = _serverSingleton ?? serverRef.current;
      if (existing) {
        existing.stop();
        _serverSingleton = null;
        serverRef.current = null;
      }
    };
  }, []);

  // ── Client state (Display + Admin) ───────────────────────────────────────

  const clientRef = useRef<LanClient | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [discoveredServers, setDiscoveredServers] = useState<
    DiscoveredServer[]
  >([]);
  const [cartMirror, setCartMirror] = useState<CartMirrorState>(EMPTY_MIRROR);
  const checkoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create client with the correct role
  useEffect(() => {
    if (!deviceId) return;
    const clientRole =
      deviceRole === "ADMIN"
        ? "ADMIN"
        : deviceRole === "DISPLAY"
        ? "DISPLAY"
        : null;
    if (!clientRole) return; // Worker doesn't need a client

    const client = new LanClient(deviceId, clientRole);
    console.log(
      `[LanCtx:Client] Creating LanClient role=${clientRole} deviceId=${deviceId}`,
    );
    client.setCallbacks({
      onStatusChange: (s) => {
        console.log(`[LanCtx:Client] Status changed: ${s}`);
        setConnectionStatus(s);
      },
      onServersFound: (servers) => {
        setDiscoveredServers(servers);
      },
      onMessage: (msg) => {
        console.log(`[LanCtx:Client] Message received: type=${msg.type}`);
        handleServerMessage(msg);
      },
    });
    clientRef.current = client;

    return () => {
      client.disconnect();
      client.stopDiscovery();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, deviceRole]);

  const handleServerMessage = useCallback((msg: LanMessage) => {
    switch (msg.type) {
      case "cart_update":
        if (checkoutTimerRef.current) {
          clearTimeout(checkoutTimerRef.current);
          checkoutTimerRef.current = null;
        }
        setCartMirror({ cart: msg.cart, total: msg.total, lastCheckout: null });
        break;
      case "cart_clear":
        setCartMirror(EMPTY_MIRROR);
        break;
      case "checkout_complete":
        setCartMirror({
          cart: [],
          total: 0,
          lastCheckout: {
            total: msg.total,
            itemCount: msg.itemCount,
            paymentMethod: msg.paymentMethod,
          },
        });
        checkoutTimerRef.current = setTimeout(() => {
          setCartMirror(EMPTY_MIRROR);
          checkoutTimerRef.current = null;
        }, 5000);
        break;
      // Sync responses from Worker → Admin
      case "sync_prepare_ack":
        setSyncStatus("sending_catalog");
        break;
      case "sync_catalog_ack":
        setSyncStatus("complete");
        break;
      case "sync_tickets": {
        setSyncStatus("receiving_tickets");
        onSyncTicketsReceived.current?.(msg.data);
        break;
      }
      case "pair_accepted":
      case "pair_rejected":
        break;
      default:
        break;
    }
  }, []);

  // Admin sync actions
  const sendSyncPrepare = useCallback((totalBytes: number) => {
    setSyncStatus("preparing");
    clientRef.current?.send({ type: "sync_prepare", totalBytes });
  }, []);

  const sendCatalog = useCallback((data: SyncCatalogData) => {
    setSyncStatus("sending_catalog");
    clientRef.current?.send({ type: "sync_catalog", data });
  }, []);

  const requestTickets = useCallback((since: string | null) => {
    setSyncStatus("requesting_tickets");
    clientRef.current?.send({ type: "sync_tickets_request", since });
  }, []);

  const sendTicketsAck = useCallback(() => {
    clientRef.current?.send({ type: "sync_tickets_ack" });
  }, []);

  const startDiscovery = useCallback(() => {
    clientRef.current?.startDiscovery();
  }, []);

  const stopDiscovery = useCallback(() => {
    clientRef.current?.stopDiscovery();
  }, []);

  const connectToServer = useCallback(
    (host: string, port: number, code?: string) => {
      console.log(
        `[LanCtx:Client] connectToServer(${host}:${port}, code=${
          code ?? "none"
        })`,
      );
      if (!clientRef.current) {
        console.warn(
          "[LanCtx:Client] clientRef.current is NULL! Cannot connect.",
        );
        return;
      }

      clientRef.current.connect(host, port, code);
    },
    [],
  );

  const disconnectFromServer = useCallback(() => {
    clientRef.current?.disconnect();
    setCartMirror(EMPTY_MIRROR);
  }, []);

  // Handle app state changes
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && clientRef.current?.status === "disconnected") {
        // auto-reconnect handled by LanClient
      }
    });
    return () => sub.remove();
  }, []);

  // Cleanup checkout timer
  useEffect(() => {
    return () => {
      if (checkoutTimerRef.current) {
        clearTimeout(checkoutTimerRef.current);
      }
    };
  }, []);

  // ── Context value ────────────────────────────────────────────────────────

  const workerName = useMemo(() => {
    if (!deviceId) return "";
    return `Vendedor-${deviceId.slice(-4).toUpperCase()}`;
  }, [deviceId]);

  const value = useMemo<LanContextValue>(
    () => ({
      workerName,
      startServer,
      stopServer,
      broadcastCart,
      broadcastCheckout,
      broadcastClear,
      pairingCode,
      serverIp,
      serverRunning,
      connectedDisplays,
      startDiscovery,
      stopDiscovery,
      connectToServer,
      disconnectFromServer,
      discoveredServers,
      connectionStatus,
      cartMirror,
      syncStatus,
      syncProgress,
      lastSyncAt,
      sendSyncPrepare,
      sendCatalog,
      requestTickets,
      sendTickets,
      sendCatalogAck,
      sendSyncPrepareAck,
      sendTicketsAck,
      onSyncCatalogReceived,
      onSyncTicketsReceived,
      onSyncTicketsRequested,
      onSyncPrepareReceived,
      onSyncTicketsAckReceived,
      serverRef,
      catalogVersion,
      bumpCatalogVersion,
    }),
    [
      workerName,
      startServer,
      stopServer,
      broadcastCart,
      broadcastCheckout,
      broadcastClear,
      pairingCode,
      serverIp,
      serverRunning,
      connectedDisplays,
      startDiscovery,
      stopDiscovery,
      connectToServer,
      disconnectFromServer,
      discoveredServers,
      connectionStatus,
      cartMirror,
      syncStatus,
      syncProgress,
      lastSyncAt,
      sendSyncPrepare,
      sendCatalog,
      requestTickets,
      sendTickets,
      sendCatalogAck,
      sendSyncPrepareAck,
      sendTicketsAck,
      catalogVersion,
    ],
  );

  return <LanContext.Provider value={value}>{children}</LanContext.Provider>;
}

export function useLan() {
  return useContext(LanContext);
}
