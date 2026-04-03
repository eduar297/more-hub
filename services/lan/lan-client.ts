import TcpSocket from "react-native-tcp-socket";
import Zeroconf from "react-native-zeroconf";

import {
  type ClientRole,
  type LanMessage,
  LAN_PORT,
  RECONNECT_BASE,
  RECONNECT_MAX,
  SERVICE_PROTOCOL,
  SERVICE_TYPE,
  parse,
  serialize,
} from "./protocol";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredServer {
  name: string;
  host: string;
  port: number;
  storeName: string;
}

export type ConnectionStatus =
  | "idle"
  | "discovering"
  | "connecting"
  | "pairing"
  | "paired"
  | "disconnected"
  | "error";

export interface LanClientCallbacks {
  onMessage?: (msg: LanMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onServersFound?: (servers: DiscoveredServer[]) => void;
}

// ── LanClient ────────────────────────────────────────────────────────────────

export class LanClient {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private zeroconf: Zeroconf | null = null;
  private buffer = "";
  private _status: ConnectionStatus = "idle";
  private _discoveredServers: DiscoveredServer[] = [];
  private callbacks: LanClientCallbacks = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private _deviceId: string;
  private _role: ClientRole;
  private lastHost = "";
  private lastPort = LAN_PORT;
  private lastCode: string | undefined;
  private shouldReconnect = false;

  constructor(deviceId: string, role: ClientRole = "DISPLAY") {
    this._deviceId = deviceId;
    this._role = role;
  }

  get status() {
    return this._status;
  }
  get discoveredServers() {
    return this._discoveredServers;
  }
  get deviceId() {
    return this._deviceId;
  }

  setCallbacks(cb: LanClientCallbacks) {
    this.callbacks = cb;
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  startDiscovery(): void {
    this.stopDiscovery();
    this.setStatus("discovering");
    this._discoveredServers = [];

    try {
      this.zeroconf = new Zeroconf();

      this.zeroconf.on("resolved", (service: any) => {
        const addresses: string[] = service.addresses ?? [];
        // Prefer IPv4
        const host =
          addresses.find((a: string) => a.includes(".") && !a.includes(":")) ??
          addresses[0];
        if (!host) return;

        const server: DiscoveredServer = {
          name: service.name ?? "MoreHub",
          host,
          port: service.port ?? LAN_PORT,
          storeName: service.txt?.store ?? "Tienda",
        };

        // Avoid duplicates
        if (!this._discoveredServers.find((s) => s.host === host)) {
          this._discoveredServers = [...this._discoveredServers, server];
          this.callbacks.onServersFound?.(this._discoveredServers);
        }
      });

      this.zeroconf.on("remove", (name: string) => {
        this._discoveredServers = this._discoveredServers.filter(
          (s) => s.name !== name,
        );
        this.callbacks.onServersFound?.(this._discoveredServers);
      });

      this.zeroconf.on("error", (err: any) => {});

      this.zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, "local.");
    } catch {}
  }

  stopDiscovery(): void {
    if (this.zeroconf) {
      try {
        this.zeroconf.stop();
        this.zeroconf.removeDeviceListeners();
      } catch {
        // ignore
      }
      this.zeroconf = null;
    }
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  connect(host: string, port: number, code?: string): void {
    this.disconnect();
    this.lastHost = host;
    this.lastPort = port;
    this.lastCode = code;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.doConnect(host, port, code);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.cancelReconnect();
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.buffer = "";
    this.setStatus("idle");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private doConnect(host: string, port: number, code?: string) {
    this.setStatus("connecting");

    this.socket = TcpSocket.createConnection(
      {
        host,
        port,
        reuseAddress: true,
      },
      () => {
        // Connected — send pair request

        this.reconnectAttempt = 0;
        this.setStatus("pairing");

        const pairMsg: LanMessage = {
          type: "pair_request",
          code: code ?? "",
          deviceId: this._deviceId,
          role: this._role,
        };

        this.socket?.write(serialize(pairMsg));
      },
    );

    this.socket.on("data", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");

      this.buffer += raw;
      const { messages, remainder } = parse(this.buffer);
      this.buffer = remainder;

      for (const msg of messages) {
        this.handleMessage(msg);
      }
    });

    this.socket.on("error", (err) => {
      this.handleDisconnect();
    });

    this.socket.on("close", () => {
      this.handleDisconnect();
    });
  }

  /** Send a message to the connected server */
  send(msg: LanMessage): void {
    if (!this.socket || this._status !== "paired") return;
    try {
      this.socket.write(serialize(msg));
    } catch {
      // will be cleaned up by reconnect
    }
  }

  private handleMessage(msg: LanMessage) {
    switch (msg.type) {
      case "pair_accepted":
        this.setStatus("paired");
        // After accepted, future reconnects don't need the code
        this.lastCode = undefined;
        this.callbacks.onMessage?.(msg);
        break;
      case "pair_rejected":
        this.shouldReconnect = false;
        this.setStatus("error");
        this.callbacks.onMessage?.(msg);
        this.callbacks.onMessage?.(msg);
        break;
      case "ping":
        // Respond with pong
        try {
          this.socket?.write(serialize({ type: "pong" }));
        } catch {
          // ignore
        }
        break;
      default:
        this.callbacks.onMessage?.(msg);
        break;
    }
  }

  private handleDisconnect() {
    this.socket = null;
    this.buffer = "";

    if (this.shouldReconnect) {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    } else {
      this.setStatus("idle");
    }
  }

  private scheduleReconnect() {
    this.cancelReconnect();
    const delay = Math.min(
      RECONNECT_BASE * 2 ** this.reconnectAttempt,
      RECONNECT_MAX,
    );

    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.doConnect(this.lastHost, this.lastPort, this.lastCode);
      } else {
      }
    }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(s: ConnectionStatus) {
    if (this._status === s) return;

    this._status = s;
    this.callbacks.onStatusChange?.(s);
  }
}
