import type { PaymentMethod } from "@/models/ticket";

// ── Slim cart item sent over the wire (no full Product) ──────────────────────

export interface CartItemWire {
  productId: number;
  name: string;
  photoUri: string | null;
  quantity: number;
  unitPrice: number;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export type LanMessage =
  | { type: "cart_update"; cart: CartItemWire[]; total: number }
  | { type: "cart_clear" }
  | {
      type: "checkout_complete";
      total: number;
      itemCount: number;
      paymentMethod: PaymentMethod;
    }
  | { type: "pair_request"; code: string; deviceId: string }
  | { type: "pair_accepted"; deviceId: string }
  | { type: "pair_rejected"; reason?: string }
  | { type: "ping" }
  | { type: "pong" };

// ── State exposed to Display UI ──────────────────────────────────────────────

export interface CartMirrorState {
  cart: CartItemWire[];
  total: number;
  /** When set, Display should show a "thank you" screen then reset */
  lastCheckout: {
    total: number;
    itemCount: number;
    paymentMethod: PaymentMethod;
  } | null;
}

export const EMPTY_MIRROR: CartMirrorState = {
  cart: [],
  total: 0,
  lastCheckout: null,
};

// ── Wire helpers (newline-delimited JSON) ────────────────────────────────────

const DELIMITER = "\n";

export function serialize(msg: LanMessage): string {
  return JSON.stringify(msg) + DELIMITER;
}

/**
 * Accumulates raw TCP data into a buffer and extracts complete messages.
 * Returns the parsed messages and the remaining (incomplete) buffer.
 */
export function parse(buffer: string): {
  messages: LanMessage[];
  remainder: string;
} {
  const messages: LanMessage[] = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === "\n") {
      const line = buffer.slice(start, i).trim();
      start = i + 1;
      if (line.length === 0) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.type === "string") {
          messages.push(parsed as LanMessage);
        }
      } catch {
        // Malformed line — skip
      }
    }
  }

  return { messages, remainder: buffer.slice(start) };
}

// ── Constants ────────────────────────────────────────────────────────────────

export const LAN_PORT = 9847;
export const SERVICE_TYPE = "morehub";
export const SERVICE_PROTOCOL = "tcp";
export const HEARTBEAT_INTERVAL = 10_000; // 10s
export const HEARTBEAT_TIMEOUT = 5_000; // 5s
export const RECONNECT_BASE = 1_000; // 1s
export const RECONNECT_MAX = 30_000; // 30s
