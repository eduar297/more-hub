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

      this.zeroconf.on("error", (err: any) => {
        console.warn("[LanClient] Zeroconf error:", err);
      });

      this.zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, "local.");
    } catch (err) {
      console.warn("[LanClient] Zeroconf scan failed:", err);
    }
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
    console.log("[LAN CLIENT] Iniciando conexión:", { host, port, code });
    this.disconnect();
    this.lastHost = host;
    this.lastPort = port;
    this.lastCode = code;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    console.log("[LAN CLIENT] Llamando doConnect...");
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
    console.log("[LAN CLIENT] doConnect iniciando:", {
      host,
      port,
      code,
      currentStatus: this._status,
    });
    this.setStatus("connecting");
    console.log("[LAN CLIENT] Status cambiado a connecting");

    console.log("[LAN CLIENT] Creando socket TCP...");
    this.socket = TcpSocket.createConnection(
      {
        host,
        port,
        reuseAddress: true,
      },
      () => {
        // Connected — send pair request
        console.log("[LAN CLIENT] Socket conectado exitosamente!");
        this.reconnectAttempt = 0;
        this.setStatus("pairing");
        console.log(
          "[LAN CLIENT] Status cambiado a pairing, enviando pair request...",
        );
        const pairMsg: LanMessage = {
          type: "pair_request",
          code: code ?? "",
          deviceId: this._deviceId,
          role: this._role,
        };
        console.log("[LAN CLIENT] Enviando mensaje de pairing:", pairMsg);
        this.socket?.write(serialize(pairMsg));
        console.log("[LAN CLIENT] Mensaje de pairing enviado");
      },
    );
    console.log("[LAN CLIENT] Socket creado, configurando event handlers...");

    this.socket.on("data", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      console.log("[LAN CLIENT] Datos recibidos:", raw.length, "caracteres");
      this.buffer += raw;
      const { messages, remainder } = parse(this.buffer);
      this.buffer = remainder;
      console.log("[LAN CLIENT] Mensajes parseados:", messages.length);

      for (const msg of messages) {
        console.log("[LAN CLIENT] Procesando mensaje:", msg.type);
        this.handleMessage(msg);
      }
    });

    this.socket.on("error", (err) => {
      console.error("[LAN CLIENT] Socket error:", err);
      this.handleDisconnect();
    });

    this.socket.on("close", () => {
      console.log("[LAN CLIENT] Socket cerrado");
      this.handleDisconnect();
    });

    console.log("[LAN CLIENT] Todos los event handlers configurados");
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
    console.log("[LAN CLIENT] Procesando mensaje:", msg.type);
    switch (msg.type) {
      case "pair_accepted":
        console.log("[LAN CLIENT] Pairing aceptado!");
        this.setStatus("paired");
        // After accepted, future reconnects don't need the code
        this.lastCode = undefined;
        console.log("[LAN CLIENT] Enviando mensaje pair_accepted al callback");
        this.callbacks.onMessage?.(msg);
        break;
      case "pair_rejected":
        console.log("[LAN CLIENT] Pairing rechazado!");
        this.shouldReconnect = false;
        this.setStatus("error");
        console.log("[LAN CLIENT] Enviando mensaje pair_rejected al callback");
        this.callbacks.onMessage?.(msg);
        break;
      case "ping":
        console.log("[LAN CLIENT] Ping recibido, respondiendo pong");
        // Respond with pong
        try {
          this.socket?.write(serialize({ type: "pong" }));
        } catch {
          // ignore
        }
        break;
      default:
        console.log(
          "[LAN CLIENT] Mensaje genérico:",
          msg.type,
          "enviando al callback",
        );
        this.callbacks.onMessage?.(msg);
        break;
    }
  }

  private handleDisconnect() {
    console.log(
      "[LAN CLIENT] handleDisconnect ejecutándose, shouldReconnect:",
      this.shouldReconnect,
    );
    this.socket = null;
    this.buffer = "";

    if (this.shouldReconnect) {
      console.log("[LAN CLIENT] Programando reconexión...");
      this.setStatus("disconnected");
      this.scheduleReconnect();
    } else {
      console.log("[LAN CLIENT] No se debe reconectar, estableciendo idle");
      this.setStatus("idle");
    }
  }

  private scheduleReconnect() {
    this.cancelReconnect();
    const delay = Math.min(
      RECONNECT_BASE * 2 ** this.reconnectAttempt,
      RECONNECT_MAX,
    );
    console.log(
      "[LAN CLIENT] Programando reconexión en",
      delay,
      "ms, intento #",
      this.reconnectAttempt + 1,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        console.log("[LAN CLIENT] Ejecutando reconexión...");
        this.doConnect(this.lastHost, this.lastPort, this.lastCode);
      } else {
        console.log(
          "[LAN CLIENT] Cancelando reconexión (shouldReconnect = false)",
        );
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
    console.log("[LAN CLIENT] Cambio de status:", this._status, "→", s);
    this._status = s;
    this.callbacks.onStatusChange?.(s);
  }
}
