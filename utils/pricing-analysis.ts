import type { Product } from "@/models/product";
import type { SQLiteDatabase } from "expo-sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type ProductClass = "star" | "cow" | "question" | "dog";

export interface ProductAnalysis {
  product: Product;
  /** Weighted-average cost from purchase_items (falls back to costPrice). */
  avgPurchaseCost: number;
  /** Total units sold in the analysis period. */
  totalUnitsSold: number;
  /** Total revenue in the analysis period. */
  totalRevenue: number;
  /** Average units sold per month. */
  avgMonthlySales: number;
  /** This product's share of total revenue (0–1). */
  revenueShare: number;
  /** Allocated monthly expenses per unit sold. */
  expensePerUnit: number;
  /** Current margin % based on salePrice vs avgPurchaseCost. */
  currentMargin: number;
  /** Suggested sale price given target margin + expense allocation. */
  suggestedPrice: number;
  /** BCG classification. */
  classification: ProductClass;
}

export interface PricingReport {
  products: ProductAnalysis[];
  /** The target margin used (0–1). */
  targetMargin: number;
  /** Total revenue across all products in the period. */
  totalRevenue: number;
  /** Total units sold across all products in the period. */
  totalUnitsSold: number;
  /** Total monthly expenses (averaged). */
  avgMonthlyExpenses: number;
  /** Number of months analysed. */
  monthsAnalysed: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute number of months between two ISO date strings (YYYY-MM-DD).
 * Returns at least 1.
 */
function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Run a deep pricing analysis for all products.
 *
 * Analyses all available data to compute:
 *  - Weighted-average purchase cost per product
 *  - Monthly sales velocity per product
 *  - Revenue contribution
 *  - Expense allocation (proportional to revenue share)
 *  - Suggested price = (cost + expensePerUnit) / (1 - margin)
 *  - BCG matrix classification (star / cow / question / dog)
 *
 * The analysis period is auto-detected from the earliest ticket or purchase.
 */
export async function runPricingAnalysis(
  db: SQLiteDatabase,
  targetMargin: number,
  storeId?: number,
): Promise<PricingReport> {
  // ── Auto-detect date range from earliest data ───────────────────────────
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const earliest = await db.getFirstAsync<{ d: string | null }>(
    `SELECT MIN(d) AS d FROM (
       SELECT MIN(date(createdAt)) AS d FROM tickets${storeId !== undefined ? " WHERE storeId = " + Number(storeId) : ""}
       UNION ALL
       SELECT MIN(date(createdAt)) AS d FROM purchases${storeId !== undefined ? " WHERE storeId = " + Number(storeId) : ""}
     )`,
  );

  let from: string;
  if (earliest?.d) {
    from = earliest.d;
  } else {
    // No data — fall back to last 6 months
    const fallback = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    from = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const analysedMonths = monthsBetween(from, to);

  // ── All products ────────────────────────────────────────────────────────
  const sFilter = storeId !== undefined ? " WHERE storeId = ?" : "";
  const sParams = storeId !== undefined ? [storeId] : [];
  const products = await db.getAllAsync<Product>(
    `SELECT * FROM products${sFilter} ORDER BY name ASC`,
    sParams,
  );

  // ── Sales per product (with FIFO COGS from snapshot costPrice) ─────────
  // costPrice on ticket_items is set at sale time via FIFO consumption,
  // so this gives the *real* cost of what was sold rather than a global
  // weighted average over the period.
  const salesData = await db.getAllAsync<{
    productId: number;
    totalQty: number;
    totalRevenue: number;
    totalCost: number;
    avgCost: number;
  }>(
    `SELECT ti.productId,
            SUM(ti.quantity) AS totalQty,
            SUM(ti.subtotal) AS totalRevenue,
            COALESCE(SUM(ti.quantity * COALESCE(ti.costPrice, 0)), 0) AS totalCost,
            COALESCE(SUM(ti.quantity * COALESCE(ti.costPrice, 0)), 0) /
              NULLIF(SUM(ti.quantity), 0) AS avgCost
     FROM ticket_items ti
     JOIN tickets t ON t.id = ti.ticketId
     WHERE date(t.createdAt) >= ? AND date(t.createdAt) <= ?${storeId !== undefined ? " AND t.storeId = ?" : ""}
     GROUP BY ti.productId`,
    storeId !== undefined ? [from, to, storeId] : [from, to],
  );
  const salesMap = new Map(salesData.map((r) => [r.productId, r]));

  // For products with no sales in the period, fall back to current FIFO
  // inventory cost (avg of what's in stock now, weighted by quantityRemaining).
  const inventoryCosts = await db.getAllAsync<{
    productId: number;
    avgCost: number;
    totalQty: number;
  }>(
    `SELECT productId,
            SUM(quantityRemaining * unitCost) /
              NULLIF(SUM(quantityRemaining), 0) AS avgCost,
            SUM(quantityRemaining) AS totalQty
     FROM purchase_batches
     WHERE quantityRemaining > 0${storeId !== undefined ? " AND storeId = ?" : ""}
     GROUP BY productId`,
    storeId !== undefined ? [storeId] : [],
  );
  const costMap = new Map(inventoryCosts.map((r) => [r.productId, r]));

  // ── Total expenses in the period ──────────────────────────────────────
  const expResult = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE date >= ? AND date <= ?${storeId !== undefined ? " AND storeId = ?" : ""}`,
    storeId !== undefined ? [from, to, storeId] : [from, to],
  );
  const totalExpenses = expResult?.total ?? 0;
  const avgMonthlyExpenses =
    analysedMonths > 0 ? totalExpenses / analysedMonths : 0;

  // ── Aggregates ─────────────────────────────────────────────────────────
  const totalRevenue = salesData.reduce((s, r) => s + r.totalRevenue, 0);
  const totalUnitsSold = salesData.reduce((s, r) => s + r.totalQty, 0);

  // Median monthly sales (for BCG classification thresholds)
  const monthlyVolumes = products
    .map((p) => (salesMap.get(p.id)?.totalQty ?? 0) / analysedMonths)
    .sort((a, b) => a - b);
  const medianVolume =
    monthlyVolumes.length > 0
      ? monthlyVolumes[Math.floor(monthlyVolumes.length / 2)]
      : 0;

  // Median current margin (uses FIFO-realised cost when available).
  const realisedCost = (productId: number, fallback: number) => {
    const sales = salesMap.get(productId);
    if (sales && sales.totalQty > 0 && sales.avgCost > 0) return sales.avgCost;
    return costMap.get(productId)?.avgCost ?? fallback;
  };
  const margins = products
    .map((p) => {
      const cost = realisedCost(p.id, p.costPrice ?? p.pricePerBaseUnit);
      return p.salePrice > 0 ? (p.salePrice - cost) / p.salePrice : 0;
    })
    .sort((a, b) => a - b);
  const medianMargin =
    margins.length > 0 ? margins[Math.floor(margins.length / 2)] : 0;

  // ── Per-product analysis ──────────────────────────────────────────────
  const analyses: ProductAnalysis[] = products.map((p) => {
    const avgPurchaseCost = realisedCost(
      p.id,
      p.costPrice ?? p.pricePerBaseUnit,
    );

    const sales = salesMap.get(p.id);
    const unitsSold = sales?.totalQty ?? 0;
    const revenue = sales?.totalRevenue ?? 0;
    const avgMonthlySales = unitsSold / analysedMonths;

    // Revenue share for expense allocation
    const revenueShare = totalRevenue > 0 ? revenue / totalRevenue : 0;

    // Allocate monthly expenses proportionally to revenue share
    const monthlyExpenseAlloc = avgMonthlyExpenses * revenueShare;
    const expensePerUnit =
      avgMonthlySales > 0 ? monthlyExpenseAlloc / avgMonthlySales : 0;

    // Suggested price: (cost + allocated expense) / (1 - margin)
    const effectiveCost = avgPurchaseCost + expensePerUnit;
    const suggestedPrice =
      targetMargin < 1 ? effectiveCost / (1 - targetMargin) : effectiveCost * 2;

    // Current margin
    const currentMargin =
      p.salePrice > 0 ? (p.salePrice - avgPurchaseCost) / p.salePrice : 0;

    // BCG classification
    const highVolume = avgMonthlySales >= medianVolume;
    const highMargin = currentMargin >= medianMargin;
    let classification: ProductClass;
    if (highVolume && highMargin) classification = "star";
    else if (highVolume && !highMargin) classification = "cow";
    else if (!highVolume && highMargin) classification = "question";
    else classification = "dog";

    return {
      product: { ...p, visible: !!p.visible },
      avgPurchaseCost,
      totalUnitsSold: unitsSold,
      totalRevenue: revenue,
      avgMonthlySales,
      revenueShare,
      expensePerUnit,
      currentMargin,
      suggestedPrice: Math.round(suggestedPrice * 100) / 100,
      classification,
    };
  });

  return {
    products: analyses,
    targetMargin,
    totalRevenue,
    totalUnitsSold,
    avgMonthlyExpenses,
    monthsAnalysed: analysedMonths,
  };
}
