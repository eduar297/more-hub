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
  | "sending_catalog"
  | "requesting_tickets"
  | "receiving_tickets"
  | "complete"
  | "error";

interface LanContextValue {
  // Server (Worker) side — used when deviceRole === 'WORKER'
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
  lastSyncAt: string | null;
  /** Admin: send catalog to Worker */
  sendCatalog: (data: SyncCatalogData) => void;
  /** Admin: request tickets from Worker */
  requestTickets: (since: string | null) => void;
  /** Worker: respond with tickets */
  sendTickets: (clientId: string, data: SyncTicketsData) => void;
  /** Worker: acknowledge catalog received */
  sendCatalogAck: (clientId: string) => void;
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

  /** Worker server ref for direct access */
  serverRef: React.MutableRefObject<LanServer | null>;
}

const LanContext = createContext<LanContextValue>({
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
  lastSyncAt: null,
  sendCatalog: () => {},
  requestTickets: () => {},
  sendTickets: () => {},
  sendCatalogAck: () => {},
  onSyncCatalogReceived: { current: null },
  onSyncTicketsReceived: { current: null },
  onSyncTicketsRequested: { current: null },
  serverRef: { current: null },
});

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

  // ── Server state (Worker) ────────────────────────────────────────────────

  const serverRef = useRef<LanServer | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [serverRunning, setServerRunning] = useState(false);
  const [connectedDisplays, setConnectedDisplays] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const updateDisplayCount = useCallback(() => {
    const count = serverRef.current?.displayClients.length ?? 0;
    setConnectedDisplays(count);
  }, []);

  const startServer = useCallback(async () => {
    if (serverRef.current?.running) {
      return;
    }

    const server = new LanServer();
    server.setCallbacks({
      onClientConnected: () => {
        updateDisplayCount();
      },
      onClientDisconnected: () => {
        updateDisplayCount();
      },
      isDevicePaired: async () => {
        return true; // Worker accepts all connections
      },
      onDevicePaired: async () => {},
      onSyncMessage: (clientId, msg) => {
        switch (msg.type) {
          case "sync_catalog":
            onSyncCatalogReceived.current?.(clientId, msg.data);
            break;
          case "sync_tickets_request":
            onSyncTicketsRequested.current?.(clientId, msg.since);
            break;
          case "sync_tickets_ack": {
            const now = new Date().toISOString();
            setLastSyncAt(now);
            setSyncStatus("complete");
            break;
          }
          case "sync_complete":
            setSyncStatus("idle");
            break;
        }
      },
    });

    const storeName = "Worker";

    try {
      await server.start(storeName);

      serverRef.current = server;
      setPairingCode(server.pairingCode);
      setServerIp(server.ipAddress);
      setServerRunning(true);
    } catch {}
  }, [updateDisplayCount]);

  const stopServer = useCallback(async () => {
    if (serverRef.current) {
      await serverRef.current.stop();
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

  const sendTickets = useCallback((clientId: string, data: SyncTicketsData) => {
    serverRef.current?.sendToClient(clientId, {
      type: "sync_tickets",
      data,
    });
  }, []);

  // Cleanup server on unmount
  useEffect(() => {
    return () => {
      serverRef.current?.stop();
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
    client.setCallbacks({
      onStatusChange: (s) => {
        setConnectionStatus(s);
      },
      onServersFound: (servers) => {
        setDiscoveredServers(servers);
      },
      onMessage: (msg) => {
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
      case "sync_catalog_ack":
        setSyncStatus("requesting_tickets");
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
  const sendCatalog = useCallback((data: SyncCatalogData) => {
    setSyncStatus("sending_catalog");
    clientRef.current?.send({ type: "sync_catalog", data });
  }, []);

  const requestTickets = useCallback((since: string | null) => {
    setSyncStatus("requesting_tickets");
    setSyncStatus("requesting_tickets");
    clientRef.current?.send({ type: "sync_tickets_request", since });
  }, []);

  const startDiscovery = useCallback(() => {
    clientRef.current?.startDiscovery();
  }, []);

  const stopDiscovery = useCallback(() => {
    clientRef.current?.stopDiscovery();
  }, []);

  const connectToServer = useCallback(
    (host: string, port: number, code?: string) => {
      if (!clientRef.current) {
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

  const value = useMemo<LanContextValue>(
    () => ({
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
      lastSyncAt,
      sendCatalog,
      requestTickets,
      sendTickets,
      sendCatalogAck,
      onSyncCatalogReceived,
      onSyncTicketsReceived,
      onSyncTicketsRequested,
      serverRef,
    }),
    [
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
      lastSyncAt,
      sendCatalog,
      requestTickets,
      sendTickets,
      sendCatalogAck,
    ],
  );

  return <LanContext.Provider value={value}>{children}</LanContext.Provider>;
}

export function useLan() {
  return useContext(LanContext);
}
