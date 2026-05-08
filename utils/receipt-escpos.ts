import type { Ticket, TicketItem } from "@/models/ticket";
import { fmtMoneyFull } from "@/utils/format";

/** Width in characters for an 80mm thermal printer (POS-8360-L is 80mm). */
export const POS_WIDTH_80 = 48;
export const POS_WIDTH_58 = 32;

// ── ESC/POS command bytes ──────────────────────────────────────────────────
// All cheap thermal printers (POS-8360-L, POS-58, POS-80, MTP, GP-Lxxx, etc.)
// follow the same Epson-derived command set. We build the byte stream by hand
// so we don't depend on any third-party library that might be tied to a
// specific vendor SDK or precompiled blob.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** ESC @ — initialize printer (clears mode + buffer). */
const INIT = new Uint8Array([ESC, 0x40]);
/** Single line feed. */
const NL = new Uint8Array([LF]);
/** GS V 0 — full paper cut (printer ignores if it has no cutter). */
const CUT = new Uint8Array([GS, 0x56, 0x00]);
/** ESC t 19 — select code page CP858 (Latin-1 + €). Most thermal printers
 *  accept it; if not, the printer just prints whatever is in its default
 *  page. We strip accents anyway so this is just belt-and-suspenders. */
const SET_CP858 = new Uint8Array([ESC, 0x74, 19]);

function alignBytes(mode: 0 | 1 | 2): Uint8Array {
  // ESC a n  (0=left, 1=center, 2=right)
  return new Uint8Array([ESC, 0x61, mode]);
}

function boldBytes(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function sizeBytes(width: number, height: number): Uint8Array {
  // GS ! n — width and height multipliers in [1..8]
  const w = Math.max(1, Math.min(8, width)) - 1;
  const h = Math.max(1, Math.min(8, height)) - 1;
  return new Uint8Array([GS, 0x21, (w << 4) | h]);
}

function feedBytes(lines: number): Uint8Array {
  // ESC d n — feed n lines
  return new Uint8Array([ESC, 0x64, Math.max(0, Math.min(255, lines))]);
}

// ── String → bytes ─────────────────────────────────────────────────────────

/** Strip accents and replace ñ/Ñ so the ticket prints cleanly in ASCII. */
function asAscii(s: string): string {
  return s
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

function textBytes(s: string): Uint8Array {
  const ascii = asAscii(s);
  const out = new Uint8Array(ascii.length);
  for (let i = 0; i < ascii.length; i++) out[i] = ascii.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** Append text + newline. */
function ln(s: string): Uint8Array {
  const bytes = textBytes(s);
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes, 0);
  out[bytes.length] = LF;
  return out;
}

// ── Layout helpers ─────────────────────────────────────────────────────────

function divider(width: number): string {
  return "-".repeat(width);
}
function padRight(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

/** Two-column row: label flush-left, value flush-right within `width`. */
function row2(label: string, value: string, width: number): string {
  const space = width - value.length;
  return padRight(label, Math.max(0, space - 1)) + " " + value;
}

/** Wrap long product names; emit a `qty x price ............ subtotal` line. */
function itemLines(
  name: string,
  qty: number,
  unitPrice: number,
  subtotal: number,
  width: number,
): string {
  const right = `$${fmtMoneyFull(subtotal)}`;
  const qtyLine = `  ${qty} x $${fmtMoneyFull(unitPrice)}`;
  const padded =
    qtyLine +
    " ".repeat(Math.max(1, width - qtyLine.length - right.length)) +
    right;

  const nameLines: string[] = [];
  let remaining = name;
  while (remaining.length > width) {
    nameLines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  if (remaining.length > 0) nameLines.push(remaining);

  return nameLines.join("\n") + "\n" + padded;
}

// ── Builders ───────────────────────────────────────────────────────────────

interface BuildReceiptInput {
  ticket: Ticket;
  items: TicketItem[];
  storeName?: string | null;
  width?: number;
}

/** Build the raw ESC/POS byte stream for a single sale receipt. */
export function buildReceiptBytes({
  ticket,
  items,
  storeName,
  width = POS_WIDTH_80,
}: BuildReceiptInput): Uint8Array {
  const date = ticket.createdAt.slice(0, 16).replace("T", " ");
  const worker = ticket.workerName ?? "-";
  const method = ticket.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta";
  const hr = divider(width);

  const parts: Uint8Array[] = [];
  parts.push(INIT, SET_CP858);

  // Header — store name (centered, double size, bold)
  parts.push(alignBytes(1), boldBytes(true), sizeBytes(2, 2));
  parts.push(ln(storeName ?? "MoreHub"));
  parts.push(sizeBytes(1, 1), boldBytes(false));
  parts.push(ln(`Ticket #${String(ticket.id).slice(0, 8)}`));
  parts.push(ln(date));

  // Meta
  parts.push(alignBytes(0));
  parts.push(ln(hr));
  parts.push(ln(`Vendedor: ${worker}`));
  parts.push(ln(`Pago:     ${method}`));
  if (ticket.cardTypeName) parts.push(ln(`Tarjeta:  ${ticket.cardTypeName}`));
  parts.push(ln(hr));

  // Items
  for (const it of items) {
    parts.push(
      ln(
        itemLines(
          it.productName,
          it.quantity,
          it.unitPrice,
          it.subtotal,
          width,
        ),
      ),
    );
  }

  // Totals
  parts.push(ln(hr));
  parts.push(boldBytes(true), sizeBytes(2, 2));
  parts.push(
    ln(row2("TOTAL", `$${fmtMoneyFull(ticket.total)}`, Math.floor(width / 2))),
  );
  parts.push(sizeBytes(1, 1), boldBytes(false));
  parts.push(ln(row2("Articulos", String(ticket.itemCount), width)));
  parts.push(ln(hr));

  // Voided badge
  if (ticket.status === "VOIDED") {
    parts.push(alignBytes(1), boldBytes(true));
    parts.push(ln("*** ANULADO ***"));
    parts.push(boldBytes(false), alignBytes(0));
  }

  // Footer
  parts.push(alignBytes(1));
  parts.push(NL);
  parts.push(ln("Gracias por su compra!"));
  parts.push(feedBytes(3));
  parts.push(CUT);

  return concat(parts);
}

/** Tiny test page used from the settings screen. */
export function buildTestBytes(
  storeName?: string | null,
  width = POS_WIDTH_80,
): Uint8Array {
  const hr = divider(width);
  const parts: Uint8Array[] = [];
  parts.push(INIT, SET_CP858);
  parts.push(alignBytes(1), boldBytes(true), sizeBytes(2, 2));
  parts.push(ln(storeName ?? "MoreHub"));
  parts.push(sizeBytes(1, 1), boldBytes(false));
  parts.push(ln("Prueba de impresora"));
  parts.push(ln(new Date().toLocaleString("es")));
  parts.push(ln(hr));
  parts.push(alignBytes(0));
  parts.push(ln("Si lees esto, la impresora"));
  parts.push(ln("esta lista para imprimir tickets."));
  parts.push(feedBytes(3));
  parts.push(CUT);
  return concat(parts);
}
