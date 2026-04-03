import * as Network from "expo-network";
import TcpSocket from "react-native-tcp-socket";
import Zeroconf from "react-native-zeroconf";

import {
    type ClientRole,
    type LanMessage,
    HEARTBEAT_INTERVAL,
    HEARTBEAT_TIMEOUT,
    LAN_PORT,
    SERVICE_PROTOCOL,
    SERVICE_TYPE,
    parse,
    serialize,
} from "./protocol";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConnectedClient {
  id: string;
  deviceId: string | null;
  paired: boolean;
  role: ClientRole;
  socket: ReturnType<typeof TcpSocket.createConnection>;
}

export interface LanServerCallbacks {
  onClientConnected?: (client: ConnectedClient) => void;
  onClientDisconnected?: (clientId: string) => void;
  onPairRequest?: (clientId: string, deviceId: string, code: string) => void;
  /** Return true if this deviceId is already known/paired */
  isDevicePaired?: (deviceId: string) => Promise<boolean>;
  /** Persist a newly paired device */
  onDevicePaired?: (deviceId: string) => Promise<void>;
  /** Called when an Admin sends a sync message to the Worker server */
  onSyncMessage?: (clientId: string, msg: LanMessage) => void;
}

// ── LanServer ────────────────────────────────────────────────────────────────

export class LanServer {
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private zeroconf: Zeroconf | null = null;
  private clients = new Map<string, ConnectedClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private buffers = new Map<string, string>();
  private _pairingCode = "";
  private _ipAddress = "";
  private _running = false;
  private _storeName = "";
  private callbacks: LanServerCallbacks = {};
  private clientCounter = 0;

  get pairingCode() {
    return this._pairingCode;
  }
  get ipAddress() {
    return this._ipAddress;
  }
  get running() {
    return this._running;
  }
  get connectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }
  get pairedClients(): ConnectedClient[] {
    return this.connectedClients.filter((c) => c.paired);
  }
  get displayClients(): ConnectedClient[] {
    return this.connectedClients.filter(
      (c) => c.paired && c.role === "DISPLAY",
    );
  }
  get adminClients(): ConnectedClient[] {
    return this.connectedClients.filter((c) => c.paired && c.role === "ADMIN");
  }

  setCallbacks(cb: LanServerCallbacks) {
    this.callbacks = cb;
  }

  async start(storeName: string): Promise<void> {
    if (this._running) return;

    this._storeName = storeName;
    this._pairingCode = generateCode();
    this._ipAddress = await Network.getIpAddressAsync();

    await this.startTcpServer();
    this.publishZeroconf();
    this.startHeartbeat();
    this._running = true;
  }

  async stop(): Promise<void> {
    this._running = false;
    this.stopHeartbeat();
    this.unpublishZeroconf();

    // Close all client sockets
    for (const client of this.clients.values()) {
      try {
        client.socket.destroy();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    this.buffers.clear();

    // Close server
    if (this.server) {
      try {
        this.server.close();
      } catch {
        // ignore
      }
      this.server = null;
    }
  }

  broadcast(msg: LanMessage): void {
    const data = serialize(msg);
    for (const client of this.clients.values()) {
      if (client.paired && client.role === "DISPLAY") {
        try {
          client.socket.write(data);
        } catch {
          // will be cleaned up by heartbeat
        }
      }
    }
  }

  /** Send a message to a specific paired client (e.g. Admin sync responses) */
  sendToClient(clientId: string, msg: LanMessage): void {
    const client = this.clients.get(clientId);
    if (!client?.paired) return;
    try {
      client.socket.write(serialize(msg));
    } catch {
      // will be cleaned up by heartbeat
    }
  }

  acceptPairing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.deviceId) return;

    client.paired = true;
    const msg: LanMessage = {
      type: "pair_accepted",
      deviceId: client.deviceId,
    };
    try {
      client.socket.write(serialize(msg));
    } catch {
      // ignore
    }
    this.callbacks.onDevicePaired?.(client.deviceId);
    this.callbacks.onClientConnected?.(client);
  }

  rejectPairing(clientId: string, reason?: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const msg: LanMessage = { type: "pair_rejected", reason };
    try {
      client.socket.write(serialize(msg));
      client.socket.destroy();
    } catch {
      // ignore
    }
    this.removeClient(clientId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = TcpSocket.createServer((socket) => {
        this.handleNewConnection(socket);
      });

      this.server.on("error", (err) => {
        console.warn("[LanServer] Server error:", err);
      });

      this.server.listen(
        { port: LAN_PORT, host: "0.0.0.0", reuseAddress: true },
        () => {
          resolve();
        },
      );

      // Timeout safety
      setTimeout(() => reject(new Error("TCP server start timeout")), 5000);
    });
  }

  private handleNewConnection(
    socket: ReturnType<typeof TcpSocket.createConnection>,
  ) {
    const clientId = `client_${++this.clientCounter}`;
    const client: ConnectedClient = {
      id: clientId,
      deviceId: null,
      paired: false,
      role: "DISPLAY",
      socket,
    };
    this.clients.set(clientId, client);
    this.buffers.set(clientId, "");

    socket.on("data", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const currentBuffer = (this.buffers.get(clientId) ?? "") + raw;
      const { messages, remainder } = parse(currentBuffer);
      this.buffers.set(clientId, remainder);

      for (const msg of messages) {
        this.handleMessage(clientId, msg);
      }
    });

    socket.on("error", () => {
      this.removeClient(clientId);
    });

    socket.on("close", () => {
      this.removeClient(clientId);
    });
  }

  private async handleMessage(clientId: string, msg: LanMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case "pair_request": {
        const { code, deviceId, role } = msg;
        client.deviceId = deviceId;
        client.role = role ?? "DISPLAY";

        // Check if already paired device
        const knownDevice = await this.callbacks.isDevicePaired?.(deviceId);
        if (knownDevice) {
          client.paired = true;
          client.socket.write(serialize({ type: "pair_accepted", deviceId }));
          this.callbacks.onClientConnected?.(client);
          return;
        }

        // Validate pairing code
        if (code === this._pairingCode) {
          this.acceptPairing(clientId);
        } else {
          this.rejectPairing(clientId, "Código incorrecto");
        }
        break;
      }
      case "pong": {
        // Clear the pong timeout for this client
        const timer = this.pongTimers.get(clientId);
        if (timer) {
          clearTimeout(timer);
          this.pongTimers.delete(clientId);
        }
        break;
      }
      // ── Sync messages from Admin clients ──
      case "sync_catalog":
      case "sync_tickets_request":
      case "sync_tickets_ack":
      case "sync_complete": {
        if (client.paired && client.role === "ADMIN") {
          this.callbacks.onSyncMessage?.(clientId, msg);
        }
        break;
      }
      default:
        break;
    }
  }

  private removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    this.clients.delete(clientId);
    this.buffers.delete(clientId);
    const timer = this.pongTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.pongTimers.delete(clientId);
    }
    if (client) {
      this.callbacks.onClientDisconnected?.(clientId);
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const ping = serialize({ type: "ping" });
      for (const client of this.clients.values()) {
        if (!client.paired) continue;
        try {
          client.socket.write(ping);
          // Set pong timeout
          this.pongTimers.set(
            client.id,
            setTimeout(() => {
              // No pong received — drop client
              try {
                client.socket.destroy();
              } catch {
                // ignore
              }
              this.removeClient(client.id);
            }, HEARTBEAT_TIMEOUT),
          );
        } catch {
          this.removeClient(client.id);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const timer of this.pongTimers.values()) {
      clearTimeout(timer);
    }
    this.pongTimers.clear();
  }

  private publishZeroconf() {
    try {
      this.zeroconf = new Zeroconf();
      this.zeroconf.publishService(
        SERVICE_TYPE,
        SERVICE_PROTOCOL,
        "local.",
        `MoreHub-${this._storeName}`,
        LAN_PORT,
        { store: this._storeName },
      );
    } catch (err) {
      console.warn("[LanServer] Zeroconf publish failed:", err);
    }
  }

  private unpublishZeroconf() {
    if (this.zeroconf) {
      try {
        this.zeroconf.unpublishService(`MoreHub-${this._storeName}`);
        this.zeroconf.removeDeviceListeners();
      } catch {
        // ignore
      }
      this.zeroconf = null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return digits.toString();
}
