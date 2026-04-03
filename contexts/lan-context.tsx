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
    LAN_PORT,
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
    console.log("[LAN SERVER] Iniciando servidor...");
    if (serverRef.current?.running) {
      console.log("[LAN SERVER] Servidor ya está ejecutándose");
      return;
    }

    const server = new LanServer();
    server.setCallbacks({
      onClientConnected: () => {
        console.log("[LAN SERVER] Cliente conectado");
        updateDisplayCount();
      },
      onClientDisconnected: () => {
        console.log("[LAN SERVER] Cliente desconectado");
        updateDisplayCount();
      },
      isDevicePaired: async () => {
        console.log(
          "[LAN SERVER] Verificando emparejamiento - Worker acepta todo",
        );
        return true; // Worker accepts all connections
      },
      onDevicePaired: async () => {
        console.log("[LAN SERVER] Dispositivo emparejado");
      },
      onSyncMessage: (clientId, msg) => {
        console.log("[LAN SERVER] Mensaje de sync recibido:", {
          clientId,
          type: msg.type,
          data:
            msg.type === "sync_catalog"
              ? {
                  products: msg.data?.products?.length || 0,
                  units: msg.data?.units?.length || 0,
                  unitCategories: msg.data?.unitCategories?.length || 0,
                }
              : msg.type === "sync_tickets_request"
              ? {
                  since: msg.since,
                }
              : "other",
        });

        switch (msg.type) {
          case "sync_catalog":
            console.log("[LAN SERVER] Enviando catálogo a callback...");
            onSyncCatalogReceived.current?.(clientId, msg.data);
            break;
          case "sync_tickets_request":
            console.log(
              "[LAN SERVER] Enviando solicitud de tickets a callback...",
            );
            onSyncTicketsRequested.current?.(clientId, msg.since);
            break;
          case "sync_tickets_ack": {
            console.log("[LAN SERVER] ACK de tickets recibido");
            const now = new Date().toISOString();
            setLastSyncAt(now);
            setSyncStatus("complete");
            break;
          }
          case "sync_complete":
            console.log("[LAN SERVER] Sync completo");
            setSyncStatus("idle");
            break;
        }
      },
    });

    const storeName = "Worker";
    console.log("[LAN SERVER] Iniciando servidor con nombre:", storeName);

    try {
      await server.start(storeName);
      console.log("[LAN SERVER] Servidor iniciado exitosamente:", {
        ip: server.ipAddress,
        port: LAN_PORT,
        pairingCode: server.pairingCode,
      });

      serverRef.current = server;
      setPairingCode(server.pairingCode);
      setServerIp(server.ipAddress);
      setServerRunning(true);
    } catch (error) {
      console.error("[LAN SERVER] Error iniciando servidor:", error);
    }
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
    console.log("[LAN CONTEXT] Enviando ACK de catálogo:", { clientId });
    serverRef.current?.sendToClient(clientId, { type: "sync_catalog_ack" });
  }, []);

  const sendTickets = useCallback((clientId: string, data: SyncTicketsData) => {
    console.log("[LAN CONTEXT] Enviando tickets:", {
      clientId,
      tickets: data.tickets?.length || 0,
    });
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

    console.log("[LAN CLIENT] Creando cliente:", { deviceId, clientRole });
    const client = new LanClient(deviceId, clientRole);
    client.setCallbacks({
      onStatusChange: (s) => {
        console.log("[LAN CLIENT] Cambio de status:", s);
        setConnectionStatus(s);
      },
      onServersFound: (servers) => {
        console.log(
          "[LAN CLIENT] Servidores encontrados:",
          servers.map((s) => ({ host: s.host, port: s.port, name: s.name })),
        );
        setDiscoveredServers(servers);
      },
      onMessage: (msg) => {
        console.log("[LAN CLIENT] Mensaje recibido:", { type: msg.type });
        handleServerMessage(msg);
      },
    });
    clientRef.current = client;

    return () => {
      console.log("[LAN CLIENT] Limpiando cliente");
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
        console.log("[LAN CLIENT] ACK de catálogo recibido");
        setSyncStatus("requesting_tickets");
        break;
      case "sync_tickets": {
        console.log("[LAN CLIENT] Tickets recibidos:", {
          tickets: msg.data?.tickets?.length || 0,
        });
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
    console.log("[LAN CONTEXT] Enviando catálogo:", {
      products: data.products?.length || 0,
      units: data.units?.length || 0,
      unitCategories: data.unitCategories?.length || 0,
      clientConnected: clientRef.current?.status,
    });
    setSyncStatus("sending_catalog");
    clientRef.current?.send({ type: "sync_catalog", data });
  }, []);

  const requestTickets = useCallback((since: string | null) => {
    console.log("[LAN CONTEXT] Solicitando tickets:", { since });
    setSyncStatus("requesting_tickets");
    clientRef.current?.send({ type: "sync_tickets_request", since });
  }, []);

  const startDiscovery = useCallback(() => {
    console.log("[LAN CLIENT] Iniciando discovery de servidores");
    clientRef.current?.startDiscovery();
  }, []);

  const stopDiscovery = useCallback(() => {
    console.log("[LAN CLIENT] Deteniendo discovery de servidores");
    clientRef.current?.stopDiscovery();
  }, []);

  const connectToServer = useCallback(
    (host: string, port: number, code?: string) => {
      console.log("[LAN CONTEXT] Conectando a servidor:", { host, port, code });
      console.log("[LAN CONTEXT] Cliente disponible:", !!clientRef.current);
      console.log(
        "[LAN CONTEXT] Estado cliente actual:",
        clientRef.current?.status,
      );

      if (!clientRef.current) {
        console.error("[LAN CONTEXT] ERROR: Cliente no inicializado");
        return;
      }

      console.log("[LAN CONTEXT] Llamando cliente.connect...");
      clientRef.current.connect(host, port, code);
      console.log("[LAN CONTEXT] cliente.connect() ejecutado");
    },
    [],
  );

  const disconnectFromServer = useCallback(() => {
    console.log("[LAN CONTEXT] Desconectando del servidor");
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
