import type { Ticket, TicketItem } from "@/models/ticket";
import { fmtMoneyFull } from "@/utils/format";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// ── CSV Export ──────────────────────────────────────────────────────────────
// TODO!!!

// ── PDF Export ──────────────────────────────────────────────────────────────

interface FinanceReportData {
  periodLabel: string;
  totalIncome: number;
  totalPurchases: number;
  totalExpenses: number;
  profit: number;
  expensesByCategory: { category: string; amount: number }[];
  topProducts: { name: string; revenue: number; qty: number }[];
}

function buildFinanceHTML(data: FinanceReportData): string {
  const profitColor = data.profit >= 0 ? "#16a34a" : "#dc2626";

  const expenseRows = data.expensesByCategory
    .map(
      (e) =>
        `<tr><td>${e.category}</td><td style="text-align:right">$${fmtMoneyFull(
          e.amount,
        )}</td></tr>`,
    )
    .join("");

  const productRows = data.topProducts
    .map(
      (p, i) =>
        `<tr><td>${i + 1}. ${p.name}</td><td style="text-align:right">${
          p.qty
        }</td><td style="text-align:right">$${fmtMoneyFull(
          p.revenue,
        )}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .period { color: #666; font-size: 14px; margin-bottom: 20px; }
  .summary { display: flex; gap: 12px; margin-bottom: 16px; }
  .card { flex: 1; padding: 12px; border-radius: 8px; }
  .card.green { background: #f0fdf4; }
  .card.red { background: #fef2f2; }
  .card.blue { background: #eff6ff; }
  .card .label { font-size: 11px; color: #666; }
  .card .value { font-size: 20px; font-weight: bold; }
  .card.green .value { color: #16a34a; }
  .card.red .value { color: #dc2626; }
  .card.blue .value { color: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { text-align: left; font-weight: 600; color: #666; }
  .profit { font-size: 28px; font-weight: bold; color: ${profitColor}; text-align: center; padding: 16px 0; }
  .footer { text-align: center; color: #999; font-size: 11px; margin-top: 32px; }
</style>
</head>
<body>
<h1>Reporte Financiero</h1>
<div class="period">${data.periodLabel}</div>

<div class="summary">
  <div class="card green">
    <div class="label">Ingresos</div>
    <div class="value">$${fmtMoneyFull(data.totalIncome)}</div>
  </div>
  <div class="card red">
    <div class="label">Egresos</div>
    <div class="value">$${fmtMoneyFull(
      data.totalPurchases + data.totalExpenses,
    )}</div>
  </div>
  <div class="card blue">
    <div class="label">Compras</div>
    <div class="value">$${fmtMoneyFull(data.totalPurchases)}</div>
  </div>
</div>

<div class="profit">${data.profit >= 0 ? "+" : ""}$${fmtMoneyFull(
    data.profit,
  )}</div>

${
  data.expensesByCategory.length > 0
    ? `<h2>Gastos por Categoría</h2>
<table>
<tr><th>Categoría</th><th style="text-align:right">Monto</th></tr>
${expenseRows}
</table>`
    : ""
}

${
  data.topProducts.length > 0
    ? `<h2>Top Productos</h2>
<table>
<tr><th>Producto</th><th style="text-align:right">Unidades</th><th style="text-align:right">Ingresos</th></tr>
${productRows}
</table>`
    : ""
}

<div class="footer">Generado por MoreHub · ${new Date().toLocaleDateString(
    "es",
  )}</div>
</body>
</html>`;
}

/** Generate a finance report PDF and open the share sheet. */
export async function exportFinancePDF(data: FinanceReportData): Promise<void> {
  const html = buildFinanceHTML(data);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}

// ── Tickets PDF Export ──────────────────────────────────────────────────────

interface TicketsReportData {
  periodLabel: string;
  tickets: Ticket[];
  itemsByTicket: Map<string, TicketItem[]>;
  totalSales: number;
  ticketCount: number;
  avgTicket: number;
}

function buildTicketsHTML(data: TicketsReportData): string {
  const activeTickets = data.tickets.filter((t) => t.status === "ACTIVE");
  const voidedTickets = data.tickets.filter((t) => t.status === "VOIDED");

  const ticketBlocks = data.tickets
    .map((t) => {
      const date = t.createdAt.slice(0, 16).replace("T", " ");
      const worker = t.workerName ?? "—";
      const method = t.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta";
      const isVoided = t.status === "VOIDED";
      const voidedClass = isVoided ? " voided" : "";
      const badge = isVoided ? '<span class="badge-void">ANULADO</span>' : "";
      const items = data.itemsByTicket.get(t.id) ?? [];

      const itemRows = items
        .map(
          (it) =>
            `<tr>
              <td class="item-name">${it.productName}</td>
              <td style="text-align:center">${it.quantity}</td>
              <td style="text-align:right">$${fmtMoneyFull(it.unitPrice)}</td>
              <td style="text-align:right">$${fmtMoneyFull(it.subtotal)}</td>
            </tr>`,
        )
        .join("");

      return `<div class="ticket${voidedClass}">
        <div class="ticket-header">
          <div class="ticket-id">#${String(t.id).slice(0, 8)} ${badge}</div>
          <div class="ticket-total">$${fmtMoneyFull(t.total)}</div>
        </div>
        <div class="ticket-meta">${date} · ${worker} · ${method}</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align:center">Cant.</th>
              <th style="text-align:right">Precio</th>
              <th style="text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 20px; color: #1a1a1a; font-size: 11px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .period { color: #666; font-size: 13px; margin-bottom: 16px; }
  .summary { display: flex; gap: 10px; margin-bottom: 20px; }
  .card { flex: 1; padding: 10px; border-radius: 8px; text-align: center; }
  .card .label { font-size: 10px; color: #666; text-transform: uppercase; }
  .card .value { font-size: 18px; font-weight: bold; margin-top: 2px; }
  .card.green { background: #f0fdf4; }
  .card.green .value { color: #16a34a; }
  .card.blue { background: #eff6ff; }
  .card.blue .value { color: #2563eb; }
  .card.purple { background: #faf5ff; }
  .card.purple .value { color: #9333ea; }
  .ticket { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; padding: 10px; page-break-inside: avoid; }
  .ticket.voided { opacity: 0.5; border-color: #fca5a5; }
  .ticket-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .ticket-id { font-weight: bold; font-size: 13px; }
  .ticket-total { font-weight: bold; font-size: 14px; color: #16a34a; }
  .ticket.voided .ticket-total { color: #dc2626; text-decoration: line-through; }
  .ticket-meta { font-size: 11px; color: #444; margin-bottom: 6px; }
  .badge-void { background: #fef2f2; color: #dc2626; font-size: 9px; padding: 1px 5px; border-radius: 4px; margin-left: 6px; }
  .items-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .items-table th { text-align: left; font-weight: 600; color: #555; padding: 3px 4px; border-bottom: 1px solid #ddd; font-size: 9px; text-transform: uppercase; }
  .items-table td { padding: 3px 4px; border-bottom: 1px solid #f5f5f5; }
  .item-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer { text-align: center; color: #999; font-size: 10px; margin-top: 24px; }
  .note { font-size: 10px; color: #888; margin-top: 12px; }
</style>
</head>
<body>
<h1>Reporte de Ventas</h1>
<div class="period">${data.periodLabel}</div>

<div class="summary">
  <div class="card green">
    <div class="label">Total ventas</div>
    <div class="value">$${fmtMoneyFull(data.totalSales)}</div>
  </div>
  <div class="card blue">
    <div class="label">Tickets</div>
    <div class="value">${data.ticketCount}</div>
  </div>
  <div class="card purple">
    <div class="label">Promedio</div>
    <div class="value">$${fmtMoneyFull(data.avgTicket)}</div>
  </div>
</div>

${ticketBlocks}

${
  voidedTickets.length > 0
    ? `<div class="note">${voidedTickets.length} ticket(s) anulado(s) — no incluidos en los totales.</div>`
    : ""
}

<div class="footer">Generado por MoreHub · ${new Date().toLocaleDateString(
    "es",
  )} · ${activeTickets.length} ventas activas</div>
</body>
</html>`;
}

/** Generate a tickets report PDF (with item details) and open the share sheet. */
export async function exportTicketsPDF(
  tickets: Ticket[],
  periodLabel: string,
  loadItems: (ticketId: string) => Promise<TicketItem[]>,
): Promise<void> {
  // Load items for every ticket in parallel
  const entries = await Promise.all(
    tickets.map(async (t) => {
      const items = await loadItems(t.id);
      return [t.id, items] as const;
    }),
  );
  const itemsByTicket = new Map<string, TicketItem[]>(entries);

  const active = tickets.filter((t) => t.status === "ACTIVE");
  const totalSales = active.reduce((s, t) => s + t.total, 0);
  const ticketCount = active.length;
  const avgTicket = ticketCount > 0 ? totalSales / ticketCount : 0;

  const html = buildTicketsHTML({
    periodLabel,
    tickets,
    itemsByTicket,
    totalSales,
    ticketCount,
    avgTicket,
  });
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}
