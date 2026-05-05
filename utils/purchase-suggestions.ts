import type { Product } from "@/models/product";
import type { SQLiteDatabase } from "expo-sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type Urgency = "critical" | "low" | "ok" | "overstock";
export type SalesTrend = "rising" | "stable" | "falling";

export interface PurchaseSuggestion {
  product: Product;
  /** Average daily sales velocity (units/day) over full period. */
  dailySalesRate: number;
  /** Current stock in base units. */
  currentStock: number;
  /** Estimated days of stock remaining at current velocity. */
  daysOfStock: number;
  /** Suggested qty to purchase (to reach `targetDays` of stock). */
  suggestedQty: number;
  /** Estimated cost of the suggested purchase. */
  estimatedCost: number;
  /** Weighted-average purchase cost per unit. */
  avgUnitCost: number;
  /** Urgency classification. */
  urgency: Urgency;
  // ── Deep analysis fields ──
  /** Sales trend: compares recent half vs older half of period. */
  salesTrend: SalesTrend;
  /** Trend multiplier (>1 = rising, <1 = falling). */
  trendFactor: number;
  /** Adjusted daily rate using trend (weighted toward recent). */
  adjustedDailyRate: number;
  /** Gross margin % (salePrice − cost) / salePrice. */
  marginPct: number;
  /** Expected gross profit per unit. */
  profitPerUnit: number;
  /** ROI = profitPerUnit / avgUnitCost. Higher = better investment. */
  roi: number;
  /** Revenue contribution % of this product vs total. */
  revenueShare: number;
  /** Stock turnover: units sold / average stock (higher = better). */
  stockTurnover: number;
  /** Priority score 0–100: composite of urgency, trend, ROI, revenue share. */
  priorityScore: number;
  /** Short recommendation text. */
  recommendation: string;
}

export interface PurchaseReport {
  suggestions: PurchaseSuggestion[];
  /** Target days of stock coverage. */
  targetDays: number;
  /** Number of working days analysed for velocity. */
  analysedDays: number;
  /** Total estimated cost to restock everything suggested. */
  totalEstimatedCost: number;
  /** Number of products with critical urgency. */
  criticalCount: number;
  /** Number of products with rising trend. */
  risingCount: number;
  /** Average ROI across products that need restocking. */
  avgRoi: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Deep purchase suggestion analysis.
 *
 * Goes beyond simple stock coverage to include:
 *  1. **Sales trend detection** — splits the period into two halves and
 *     compares recent vs older velocity to detect rising/falling demand.
 *  2. **Trend-adjusted velocity** — weights the daily rate toward recent
 *     data so rising products get more stock and falling products less.
 *  3. **Margin & ROI ranking** — calculates gross margin and return on
 *     investment per unit so you prioritize buying profitable products.
 *  4. **Revenue contribution** — how much each product contributes to
 *     total sales so you don't miss restocking high-revenue items.
 *  5. **Stock turnover** — how fast stock moves; low turnover + high stock
 *     = overstock warning.
 *  6. **Composite priority score** (0–100) — combines urgency, trend,
 *     ROI, and revenue share into a single ranking number.
 *  7. **Smart recommendations** — human-readable advice per product.
 */
export async function runPurchaseSuggestions(
  db: SQLiteDatabase,
  targetDays = 15,
  storeId?: number,
): Promise<PurchaseReport> {
  const now = new Date();

  // ── Auto-detect analysis period from earliest ticket ────────────────────
  const earliest = await db.getFirstAsync<{ d: string | null }>(
    `SELECT MIN(date(createdAt)) AS d FROM tickets${
      storeId !== undefined ? " WHERE storeId = " + Number(storeId) : ""
    }`,
  );

  let fromDate: Date;
  if (earliest?.d) {
    fromDate = new Date(earliest.d + "T00:00:00");
  } else {
    // No sales data — fall back to 30 days
    fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 30);
  }

  const analysisDays = Math.max(
    1,
    Math.round((now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const from = isoDate(fromDate);
  const to = isoDate(now);

  // Mid-point for trend analysis (split period in two halves)
  const midDate = new Date(fromDate);
  midDate.setDate(midDate.getDate() + Math.floor(analysisDays / 2));
  const mid = isoDate(midDate);

  // ── Working days ────────────────────────────────────────────────────────
  const sTicketFilter = storeId !== undefined ? " AND storeId = ?" : "";
  const sTicketParams = storeId !== undefined ? [storeId] : [];
  const workingDaysResult = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(DISTINCT date(createdAt)) AS cnt
     FROM tickets
     WHERE date(createdAt) >= ? AND date(createdAt) <= ?${sTicketFilter}`,
    [from, to, ...sTicketParams],
  );
  const workingDays = Math.max(1, workingDaysResult?.cnt ?? 1);

  // Working days per half for trend calculation
  const firstHalfDaysResult = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(DISTINCT date(createdAt)) AS cnt
     FROM tickets
     WHERE date(createdAt) >= ? AND date(createdAt) < ?${sTicketFilter}`,
    [from, mid, ...sTicketParams],
  );
  const secondHalfDaysResult = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(DISTINCT date(createdAt)) AS cnt
     FROM tickets
     WHERE date(createdAt) >= ? AND date(createdAt) <= ?${sTicketFilter}`,
    [mid, to, ...sTicketParams],
  );
  const firstHalfDays = Math.max(1, firstHalfDaysResult?.cnt ?? 1);
  const secondHalfDays = Math.max(1, secondHalfDaysResult?.cnt ?? 1);

  // ── Products ────────────────────────────────────────────────────────────
  const products = await db.getAllAsync<Product>(
    `SELECT * FROM products${
      storeId !== undefined ? " WHERE storeId = ?" : ""
    } ORDER BY name ASC`,
    storeId !== undefined ? [storeId] : [],
  );

  // ── Sales: full period ──────────────────────────────────────────────────
  const salesData = await db.getAllAsync<{
    productId: number;
    totalQty: number;
    totalRevenue: number;
  }>(
    `SELECT productId, SUM(quantity) AS totalQty, SUM(subtotal) AS totalRevenue
     FROM ticket_items ti
     JOIN tickets t ON t.id = ti.ticketId
     WHERE date(t.createdAt) >= ? AND date(t.createdAt) <= ?${
       storeId !== undefined ? " AND t.storeId = ?" : ""
     }
     GROUP BY productId`,
    storeId !== undefined ? [from, to, storeId] : [from, to],
  );
  const salesMap = new Map(salesData.map((r) => [r.productId, r]));
  const totalRevenue = salesData.reduce((s, r) => s + r.totalRevenue, 0);

  // ── Sales: first half (older) ───────────────────────────────────────────
  const salesFirstHalf = await db.getAllAsync<{
    productId: number;
    totalQty: number;
  }>(
    `SELECT productId, SUM(quantity) AS totalQty
     FROM ticket_items ti
     JOIN tickets t ON t.id = ti.ticketId
     WHERE date(t.createdAt) >= ? AND date(t.createdAt) < ?${
       storeId !== undefined ? " AND t.storeId = ?" : ""
     }
     GROUP BY productId`,
    storeId !== undefined ? [from, mid, storeId] : [from, mid],
  );
  const firstHalfMap = new Map(
    salesFirstHalf.map((r) => [r.productId, r.totalQty]),
  );

  // ── Sales: second half (recent) ────────────────────────────────────────
  const salesSecondHalf = await db.getAllAsync<{
    productId: number;
    totalQty: number;
  }>(
    `SELECT productId, SUM(quantity) AS totalQty
     FROM ticket_items ti
     JOIN tickets t ON t.id = ti.ticketId
     WHERE date(t.createdAt) >= ? AND date(t.createdAt) <= ?${
       storeId !== undefined ? " AND t.storeId = ?" : ""
     }
     GROUP BY productId`,
    storeId !== undefined ? [mid, to, storeId] : [mid, to],
  );
  const secondHalfMap = new Map(
    salesSecondHalf.map((r) => [r.productId, r.totalQty]),
  );

  // ── Purchase cost ───────────────────────────────────────────────────────
  const costData = await db.getAllAsync<{
    productId: number;
    avgCost: number;
  }>(
    `SELECT productId, SUM(subtotal) / SUM(quantity) AS avgCost
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchaseId
     WHERE date(p.createdAt) >= ? AND date(p.createdAt) <= ?${
       storeId !== undefined ? " AND p.storeId = ?" : ""
     }
     GROUP BY productId`,
    storeId !== undefined ? [from, to, storeId] : [from, to],
  );
  const costMap = new Map(costData.map((r) => [r.productId, r.avgCost]));

  // ── Per-product analysis ────────────────────────────────────────────────
  const suggestions: PurchaseSuggestion[] = products.map((p) => {
    const product = { ...p, visible: !!p.visible };

    // Sales data
    const sales = salesMap.get(p.id);
    const totalSold = sales?.totalQty ?? 0;
    const revenue = sales?.totalRevenue ?? 0;
    const dailySalesRate = totalSold / workingDays;
    const currentStock = p.stockBaseQty;
    const revenueShare = totalRevenue > 0 ? revenue / totalRevenue : 0;

    // ── Trend analysis ──────────────────────────────────────────────────
    const qtyFirstHalf = firstHalfMap.get(p.id) ?? 0;
    const qtySecondHalf = secondHalfMap.get(p.id) ?? 0;
    const rateFirstHalf = qtyFirstHalf / firstHalfDays;
    const rateSecondHalf = qtySecondHalf / secondHalfDays;

    let trendFactor = 1;
    if (rateFirstHalf > 0) {
      trendFactor = rateSecondHalf / rateFirstHalf;
    } else if (rateSecondHalf > 0) {
      trendFactor = 2; // new demand appeared
    }
    // Clamp to avoid extreme values
    trendFactor = Math.max(0.3, Math.min(3, trendFactor));

    let salesTrend: SalesTrend;
    if (trendFactor > 1.15) salesTrend = "rising";
    else if (trendFactor < 0.85) salesTrend = "falling";
    else salesTrend = "stable";

    // Adjusted daily rate: weight 60% recent, 40% historical
    const adjustedDailyRate =
      totalSold > 0 ? rateSecondHalf * 0.6 + dailySalesRate * 0.4 : 0;

    // ── Cost & margin ───────────────────────────────────────────────────
    const avgUnitCost = costMap.get(p.id) ?? p.costPrice ?? 0;
    const salePrice = p.salePrice ?? 0;
    const profitPerUnit = salePrice - avgUnitCost;
    const marginPct = salePrice > 0 ? profitPerUnit / salePrice : 0;
    const roi = avgUnitCost > 0 ? profitPerUnit / avgUnitCost : 0;

    // ── Stock turnover ──────────────────────────────────────────────────
    // Annualized: (units sold per day × 365) / current stock
    const stockTurnover =
      currentStock > 0 ? (dailySalesRate * 365) / currentStock : 0;

    // ── Coverage & suggestion ───────────────────────────────────────────
    // Use adjusted rate for projections (accounts for trends)
    const effectiveRate =
      adjustedDailyRate > 0 ? adjustedDailyRate : dailySalesRate;
    const daysOfStock =
      effectiveRate > 0 ? currentStock / effectiveRate : Infinity;
    const targetStock = effectiveRate * targetDays;
    const deficit = targetStock - currentStock;
    const suggestedQty = Math.max(0, Math.ceil(deficit));
    const estimatedCost = suggestedQty * avgUnitCost;

    // ── Urgency ─────────────────────────────────────────────────────────
    let urgency: Urgency;
    if (daysOfStock <= 3) urgency = "critical";
    else if (daysOfStock <= 7) urgency = "low";
    else if (daysOfStock > targetDays * 2 && totalSold > 0)
      urgency = "overstock";
    else if (totalSold === 0 && currentStock > 0) urgency = "overstock";
    else urgency = "ok";

    // ── Priority score (0–100) ──────────────────────────────────────────
    // Components:
    //  - urgencyPts: 40pts max (critical=40, low=25, ok=5, overstock=0)
    //  - trendPts: 20pts max (rising=20, stable=10, falling=0)
    //  - roiPts: 20pts max (scaled by ROI)
    //  - revPts: 20pts max (scaled by revenue share)
    const urgencyPts =
      urgency === "critical"
        ? 40
        : urgency === "low"
        ? 25
        : urgency === "ok"
        ? 5
        : 0;
    const trendPts =
      salesTrend === "rising" ? 20 : salesTrend === "stable" ? 10 : 0;
    const roiPts = Math.min(20, Math.max(0, roi * 40)); // 50% ROI = 20pts
    const revPts = Math.min(20, revenueShare * 200); // 10% share = 20pts
    const priorityScore = Math.round(urgencyPts + trendPts + roiPts + revPts);

    // ── Recommendation ──────────────────────────────────────────────────
    let recommendation: string;
    if (totalSold === 0 && currentStock > 0) {
      recommendation = "Sin ventas. Considerar descuento o descontinuar.";
    } else if (totalSold === 0 && currentStock === 0) {
      recommendation = "Sin movimiento. Evaluar si mantener en catálogo.";
    } else if (urgency === "critical" && salesTrend === "rising") {
      recommendation = "¡Urgente! Demanda en aumento y stock casi agotado.";
    } else if (urgency === "critical") {
      recommendation = "Stock crítico. Comprar lo antes posible.";
    } else if (urgency === "low" && salesTrend === "rising") {
      recommendation = "Stock bajo con demanda creciente. Priorizar compra.";
    } else if (urgency === "low") {
      recommendation = "Stock bajo. Programar reabastecimiento pronto.";
    } else if (urgency === "overstock" && salesTrend === "falling") {
      recommendation = "Exceso de stock y demanda bajando. No comprar más.";
    } else if (urgency === "overstock") {
      recommendation = "Stock suficiente por ahora. No necesita compra.";
    } else if (salesTrend === "rising" && roi > 0.3) {
      recommendation =
        "Buena rentabilidad y demanda al alza. Buen momento para comprar más.";
    } else if (salesTrend === "falling" && marginPct < 0.15) {
      recommendation = "Ventas y margen bajos. Comprar solo lo mínimo.";
    } else {
      recommendation = "Nivel de stock adecuado.";
    }

    return {
      product,
      dailySalesRate,
      currentStock,
      daysOfStock,
      suggestedQty,
      estimatedCost,
      avgUnitCost,
      urgency,
      salesTrend,
      trendFactor,
      adjustedDailyRate,
      marginPct,
      profitPerUnit,
      roi,
      revenueShare,
      stockTurnover,
      priorityScore,
      recommendation,
    };
  });

  const needRestock = suggestions.filter((s) => s.suggestedQty > 0);
  const totalEstimatedCost = suggestions.reduce(
    (s, r) => s + r.estimatedCost,
    0,
  );

  return {
    suggestions,
    targetDays,
    analysedDays: workingDays,
    totalEstimatedCost,
    criticalCount: suggestions.filter((s) => s.urgency === "critical").length,
    risingCount: suggestions.filter((s) => s.salesTrend === "rising").length,
    avgRoi:
      needRestock.length > 0
        ? needRestock.reduce((s, r) => s + r.roi, 0) / needRestock.length
        : 0,
  };
}
