import * as Crypto from "expo-crypto";
import { useSQLiteContext } from "expo-sqlite";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { AppState, Platform } from "react-native";

import { useStore } from "@/contexts/store-context";
import { PairingRepository } from "@/repositories/pairing.repository";
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
} from "@/services/lan/protocol";

// ── Context value ────────────────────────────────────────────────────────────

interface LanContextValue {
  // Server (Worker) side
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

  // Client (Display) side
  startDiscovery: () => void;
  stopDiscovery: () => void;
  connectToServer: (host: string, port: number, code?: string) => void;
  disconnectFromServer: () => void;
  discoveredServers: DiscoveredServer[];
  connectionStatus: ConnectionStatus;
  cartMirror: CartMirrorState;
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
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function LanProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { currentStore } = useStore();
  const storeId = currentStore?.id ?? 1;

  const pairingRepo = useMemo(
    () => new PairingRepository(db, storeId),
    [db, storeId],
  );

  // Stable device ID for this device (generated once)
  const [deviceId, setDeviceId] = useState("");
  useEffect(() => {
    Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Platform.OS}-${Date.now()}-${Math.random()}`,
    ).then((hash) => setDeviceId(hash.slice(0, 16)));
  }, []);

  // ── Server state ─────────────────────────────────────────────────────────

  const serverRef = useRef<LanServer | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [serverRunning, setServerRunning] = useState(false);
  const [connectedDisplays, setConnectedDisplays] = useState(0);

  const updateDisplayCount = useCallback(() => {
    const count = serverRef.current?.pairedClients.length ?? 0;
    setConnectedDisplays(count);
  }, []);

  const startServer = useCallback(async () => {
    if (serverRef.current?.running) return;

    const server = new LanServer();
    server.setCallbacks({
      onClientConnected: () => updateDisplayCount(),
      onClientDisconnected: () => updateDisplayCount(),
      isDevicePaired: async (devId) => {
        const device = await pairingRepo.findByDeviceId(devId);
        return device !== null;
      },
      onDevicePaired: async (devId) => {
        await pairingRepo.savePairing(devId);
      },
    });

    const storeName = currentStore?.name ?? "Tienda";
    await server.start(storeName);
    serverRef.current = server;
    setPairingCode(server.pairingCode);
    setServerIp(server.ipAddress);
    setServerRunning(true);
  }, [currentStore?.name, pairingRepo, updateDisplayCount]);

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

  // Cleanup server on unmount
  useEffect(() => {
    return () => {
      serverRef.current?.stop();
    };
  }, []);

  // ── Client state ─────────────────────────────────────────────────────────

  const clientRef = useRef<LanClient | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [discoveredServers, setDiscoveredServers] = useState<
    DiscoveredServer[]
  >([]);
  const [cartMirror, setCartMirror] = useState<CartMirrorState>(EMPTY_MIRROR);
  const checkoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure client exists with stable deviceId
  useEffect(() => {
    if (!deviceId) return;
    const client = new LanClient(deviceId);
    client.setCallbacks({
      onStatusChange: (s) => setConnectionStatus(s),
      onServersFound: (servers) => setDiscoveredServers(servers),
      onMessage: (msg) => handleServerMessage(msg),
    });
    clientRef.current = client;

    return () => {
      client.disconnect();
      client.stopDiscovery();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleServerMessage = useCallback((msg: LanMessage) => {
    switch (msg.type) {
      case "cart_update":
        // Clear any pending checkout display
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
        // Reset after showing thank-you for 5 seconds
        checkoutTimerRef.current = setTimeout(() => {
          setCartMirror(EMPTY_MIRROR);
          checkoutTimerRef.current = null;
        }, 5000);
        break;
      case "pair_accepted":
      case "pair_rejected":
        // Status updates handled by LanClient internally
        break;
      default:
        break;
    }
  }, []);

  const startDiscovery = useCallback(() => {
    clientRef.current?.startDiscovery();
  }, []);

  const stopDiscovery = useCallback(() => {
    clientRef.current?.stopDiscovery();
  }, []);

  const connectToServer = useCallback(
    (host: string, port: number, code?: string) => {
      clientRef.current?.connect(host, port, code);
    },
    [],
  );

  const disconnectFromServer = useCallback(() => {
    clientRef.current?.disconnect();
    setCartMirror(EMPTY_MIRROR);
  }, []);

  // Handle app state changes (background/foreground) for client reconnection
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && clientRef.current?.status === "disconnected") {
        // Trigger reconnect by re-connecting to last known server
        // (LanClient handles this internally with auto-reconnect)
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
    ],
  );

  return <LanContext.Provider value={value}>{children}</LanContext.Provider>;
}

export function useLan() {
  return useContext(LanContext);
}
