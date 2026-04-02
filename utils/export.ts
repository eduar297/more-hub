import type { Ticket } from "@/models/ticket";
import { fmtMoneyFull } from "@/utils/format";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// ── CSV Export ──────────────────────────────────────────────────────────────

/** Generate a CSV string from ticket data. */
function ticketsToCSV(tickets: Ticket[]): string {
  const header = "Fecha,Ticket,Vendedor,Método de Pago,Total,Artículos,Estado";
  const rows = tickets.map((t) => {
    const date = t.createdAt.replace(",", "");
    const worker = (t.workerName ?? "—").replace(",", " ");
    const method = t.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta";
    const status = t.status === "VOIDED" ? "Anulado" : "Activo";
    return `${date},#${t.id},${worker},${method},${t.total.toFixed(2)},${
      t.itemCount
    },${status}`;
  });
  return [header, ...rows].join("\n");
}

/** Export tickets as a CSV file and open the share sheet. */
export async function exportTicketsCSV(
  tickets: Ticket[],
  periodLabel: string,
): Promise<void> {
  const csv = ticketsToCSV(tickets);
  const fileName = `ventas_${periodLabel.replace(/\s+/g, "_")}.csv`;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}

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
