import type { Product } from "@/models/product";
import type { SQLiteDatabase } from "expo-sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type StagnantStatus = "no_sales" | "heavy_drop" | "slowing";
export type DiscountViability = "possible" | "tight" | "none";

export interface StagnantProduct {
  product: Product;
  /** Days since last sale (null = never sold). */
  daysSinceLastSale: number | null;
  /** Units sold in recent half vs older half. */
  recentUnits: number;
  olderUnits: number;
  /** % drop in sales velocity (0 = no drop, 1 = 100% drop). */
  velocityDrop: number;
  /** Current stock × avg purchase cost = capital locked. */
  capitalLocked: number;
  /** Avg purchase cost per unit. */
  avgCost: number;
  /** Days of stock left at current (slow) pace. */
  daysOfStock: number;
  status: StagnantStatus;
}

export interface DiscountOpportunity {
  product: Product;
  /** Current sale price. */
  currentPrice: number;
  /** Avg purchase cost. */
  avgCost: number;
  /** Current margin % (0–1). */
  currentMargin: number;
  /** Suggested discounted price (keeps margin ≥ minMargin). */
  suggestedPrice: number;
  /** Discount % applied. */
  discountPct: number;
  /** Remaining margin after discount. */
  remainingMargin: number;
  viability: DiscountViability;
  /** Monthly revenue potential if velocity recovers to historical baseline. */
  potentialMonthlyRevenue: number;
  /** Velocity in recent period (units/month). */
  recentMonthlyVelocity: number;
  /** Velocity in older period (units/month). */
  olderMonthlyVelocity: number;
}

export interface ComboSuggestion {
  /** The "anchor" product — usually a stagnant/slow product. */
  anchorProduct: Product;
  /** The "partner" product — frequently bought with the anchor. */
  partnerProduct: Product;
  /** Number of tickets containing both products. */
  coOccurrences: number;
  /** % of anchor tickets that also contain the partner. */
  affinityPct: number;
  /** Sum of individual sale prices. */
  individualTotal: number;
  /** Suggested combo price. */
  comboPrice: number;
  /** Discount % off individual total. */
  comboPct: number;
  /** Combined avg cost. */
  combinedCost: number;
  /** Combo margin %. */
  comboMargin: number;
}

export type ComboAffinity = "high" | "medium" | "low";

export interface SalesReport {
  stagnant: StagnantProduct[];
  discounts: DiscountOpportunity[];
  combos: ComboSuggestion[];
  /** Total capital locked in stagnant products. */
  totalCapitalLocked: number;
  /** Count of products with no sales at all. */
  noSalesCount: number;
  /** Total potential monthly revenue if discounts activate demand. */
  totalPotentialRevenue: number;
  /** Number of months analysed. */
  monthsAnalysed: number;
  /** Number of combo opportunities found. */
  combosCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round(Math.abs(db - da) / 86_400_000);
}

/** Minimum acceptable margin to still suggest a discount. */
const MIN_MARGIN = 0.12;
/** Max discount % we'll suggest. */
const MAX_DISCOUNT = 0.35;
/** Min co-occurrences to consider a combo. */
const MIN_CO_OCCUR = 2;
/** Velocity drop threshold to flag as stagnant (0.4 = 40% drop). */
const STAGNANT_DROP_THRESHOLD = 0.4;
/** Days with no sales to flag as "no_sales" status. */
const NO_SALES_DAYS_THRESHOLD = 30;

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Full sales analysis engine.
 *
 * Produces three outputs:
 *  1. **Stagnant products** — has stock but isn't selling (or fell sharply).
 *  2. **Discount opportunities** — stagnant products where margin allows a
 *     price cut to reactivate demand without going below MIN_MARGIN.
 *  3. **Combo suggestions** — pairs (anchor=stagnant, partner=popular) that
 *     appear together in tickets; suggests a bundle price.
 */
export async function runSalesAnalysis(
  db: SQLiteDatabase,
  storeId?: number,
): Promise<SalesReport> {
  const now = new Date();
  const todayStr = isoDate(now);

  // ── Auto-detect analysis start from earliest ticket ────────────────────
  const earliest = await db.getFirstAsync<{ d: string | null }>(
    `SELECT MIN(date(createdAt)) AS d FROM tickets${storeId !== undefined ? " WHERE storeId = " + Number(storeId) : ""}`,
  );
  const fallbackFrom = isoDate(new Date(now.getTime() - 180 * 86_400_000));
  const fromStr = earliest?.d ?? fallbackFrom;

  const totalDays = Math.max(1, daysBetween(fromStr, todayStr));
  const totalMonths = Math.max(1, totalDays / 30);
  const halfPt = new Date(
    new Date(fromStr).getTime() + (totalDays / 2) * 86_400_000,
  );
  const halfStr = isoDate(halfPt);

  // ── Load all products with stock ────────────────────────────────────────
  const allProducts = await db.getAllAsync<Product>(
    `SELECT * FROM products WHERE visible = 1${storeId !== undefined ? " AND storeId = ?" : ""}`,
    storeId !== undefined ? [storeId] : [],
  );

  // ── FIFO inventory cost per product ─────────────────────────────────────
  // Real cost of current stock = sum of (quantityRemaining * unitCost) across
  // unconsumed batches. avgCost falls back to a stock-weighted unit cost so
  // the rest of the analysis (margin/discount logic) keeps working.
  const costRows = await db.getAllAsync<{
    productId: number;
    avgCost: number;
    inventoryValue: number;
  }>(
    `SELECT productId,
            SUM(quantityRemaining * unitCost) /
              NULLIF(SUM(quantityRemaining), 0) AS avgCost,
            SUM(quantityRemaining * unitCost) AS inventoryValue
     FROM purchase_batches
     WHERE quantityRemaining > 0${storeId !== undefined ? " AND storeId = ?" : ""}
     GROUP BY productId`,
    storeId !== undefined ? [storeId] : [],
  );
  const costMap = new Map(costRows.map((r) => [r.productId, r.avgCost]));
  const inventoryValueMap = new Map(
    costRows.map((r) => [r.productId, r.inventoryValue]),
  );

  // ── Sales per product: total, recent half, older half ──────────────────
  const salesRows = await db.getAllAsync<{
    productId: number;
    totalUnits: number;
    recentUnits: number;
    olderUnits: number;
    lastSaleDate: string | null;
    totalRevenue: number;
  }>(
    `SELECT
       ti.productId,
       COALESCE(SUM(ti.quantity), 0)                                         AS totalUnits,
       COALESCE(SUM(CASE WHEN date(t.createdAt) >= ? THEN ti.quantity END), 0) AS recentUnits,
       COALESCE(SUM(CASE WHEN date(t.createdAt) <  ? THEN ti.quantity END), 0) AS olderUnits,
       MAX(date(t.createdAt))                                                  AS lastSaleDate,
       COALESCE(SUM(ti.subtotal), 0)                                           AS totalRevenue
     FROM ticket_items ti
     JOIN tickets t ON t.id = ti.ticketId
     WHERE date(t.createdAt) >= ?${storeId !== undefined ? " AND t.storeId = ?" : ""}
     GROUP BY ti.productId`,
    storeId !== undefined
      ? [halfStr, halfStr, fromStr, storeId]
      : [halfStr, halfStr, fromStr],
  );
  const salesMap = new Map(salesRows.map((r) => [r.productId, r]));

  // ── Build stagnant + discount lists ────────────────────────────────────
  const stagnant: StagnantProduct[] = [];
  const discounts: DiscountOpportunity[] = [];

  for (const p of allProducts) {
    if (p.stockBaseQty <= 0) continue; // no stock, skip

    const s = salesMap.get(p.id);
    const avgCost = costMap.get(p.id) ?? p.costPrice ?? 0;

    const totalUnits = s?.totalUnits ?? 0;
    const recentUnits = s?.recentUnits ?? 0;
    const olderUnits = s?.olderUnits ?? 0;
    const lastSaleDate = s?.lastSaleDate ?? null;

    // Only flag if there's genuinely slow/no movement
    const halfDays = totalDays / 2;
    const recentRate = recentUnits / Math.max(1, halfDays); // units/day in recent half
    const olderRate = olderUnits / Math.max(1, halfDays); // units/day in older half

    const hasNeverSold = totalUnits === 0;
    const daysSinceLast = lastSaleDate
      ? daysBetween(lastSaleDate, todayStr)
      : null;
    const velocityDrop =
      olderRate > 0 ? Math.max(0, (olderRate - recentRate) / olderRate) : 0;

    const isStagnant =
      hasNeverSold ||
      (daysSinceLast !== null && daysSinceLast >= NO_SALES_DAYS_THRESHOLD) ||
      velocityDrop >= STAGNANT_DROP_THRESHOLD;

    if (!isStagnant) continue;

    let status: StagnantStatus;
    if (
      hasNeverSold ||
      (daysSinceLast !== null &&
        daysSinceLast >= NO_SALES_DAYS_THRESHOLD &&
        recentUnits === 0)
    ) {
      status = "no_sales";
    } else if (velocityDrop >= 0.7) {
      status = "heavy_drop";
    } else {
      status = "slowing";
    }

    // FIFO-accurate when batches exist; falls back to qty * avgCost for legacy data.
    const capitalLocked =
      inventoryValueMap.get(p.id) ?? p.stockBaseQty * avgCost;
    const daysOfStock =
      recentRate > 0 ? Math.round(p.stockBaseQty / recentRate) : Infinity;

    const stagnantRow: StagnantProduct = {
      product: p,
      daysSinceLastSale: daysSinceLast,
      recentUnits,
      olderUnits,
      velocityDrop,
      capitalLocked,
      avgCost,
      daysOfStock: isFinite(daysOfStock) ? daysOfStock : 9999,
      status,
    };
    stagnant.push(stagnantRow);

    // ── Discount opportunity ───────────────────────────────────────────
    if (avgCost > 0 && p.salePrice > 0) {
      const currentMargin = (p.salePrice - avgCost) / p.salePrice;
      if (currentMargin > MIN_MARGIN) {
        // Maximum discount that still keeps margin >= MIN_MARGIN
        // suggestedPrice = avgCost / (1 - MIN_MARGIN)
        const minPrice = avgCost / (1 - MIN_MARGIN);
        const maxDiscountedPrice = p.salePrice * (1 - MAX_DISCOUNT);
        const suggestedPrice = Math.max(minPrice, maxDiscountedPrice);
        const discountPct = (p.salePrice - suggestedPrice) / p.salePrice;
        const remainingMargin = (suggestedPrice - avgCost) / suggestedPrice;

        let viability: DiscountViability;
        if (discountPct >= 0.1 && remainingMargin >= 0.2) {
          viability = "possible";
        } else if (discountPct >= 0.05) {
          viability = "tight";
        } else {
          viability = "none";
        }

        // Baseline velocity = older rate (before decline), use as recovery target
        const olderMonthlyVelocity = olderRate * 30;
        const recentMonthlyVelocity = recentRate * 30;
        const potentialMonthlyRevenue = olderMonthlyVelocity * suggestedPrice;

        discounts.push({
          product: p,
          currentPrice: p.salePrice,
          avgCost,
          currentMargin,
          suggestedPrice,
          discountPct,
          remainingMargin,
          viability,
          potentialMonthlyRevenue,
          recentMonthlyVelocity,
          olderMonthlyVelocity,
        });
      }
    }
  }

  // Sort stagnant: no_sales first, then heavy_drop, then slowest
  stagnant.sort((a, b) => {
    const rank = { no_sales: 0, heavy_drop: 1, slowing: 2 };
    const dr = rank[a.status] - rank[b.status];
    if (dr !== 0) return dr;
    return b.capitalLocked - a.capitalLocked;
  });

  // Sort discounts: possible first, then by potential revenue desc
  discounts.sort((a, b) => {
    const rank = { possible: 0, tight: 1, none: 2 };
    const dr = rank[a.viability] - rank[b.viability];
    if (dr !== 0) return dr;
    return b.potentialMonthlyRevenue - a.potentialMonthlyRevenue;
  });

  // ── Combo detection ─────────────────────────────────────────────────────
  // Count how many times each (productA, productB) pair appears in same ticket
  const stagnantIds = new Set(stagnant.map((s) => s.product.id));

  const combos: ComboSuggestion[] = [];

  if (stagnantIds.size > 0) {
    const coRows = await db.getAllAsync<{
      p1: number;
      p2: number;
      cnt: number;
    }>(
      `SELECT a.productId AS p1, b.productId AS p2, COUNT(*) AS cnt
       FROM ticket_items a
       JOIN ticket_items b ON b.ticketId = a.ticketId AND b.productId > a.productId
       JOIN tickets t ON t.id = a.ticketId
       WHERE date(t.createdAt) >= ?${storeId !== undefined ? " AND t.storeId = ?" : ""}
       GROUP BY a.productId, b.productId
       HAVING COUNT(*) >= ?
       ORDER BY cnt DESC`,
      storeId !== undefined
        ? [fromStr, storeId, MIN_CO_OCCUR]
        : [fromStr, MIN_CO_OCCUR],
    );

    // Count total tickets per product (to compute affinity %)
    const ticketCountRows = await db.getAllAsync<{
      productId: number;
      cnt: number;
    }>(
      `SELECT ti.productId, COUNT(DISTINCT ti.ticketId) AS cnt
       FROM ticket_items ti
       JOIN tickets t ON t.id = ti.ticketId
       WHERE date(t.createdAt) >= ?${storeId !== undefined ? " AND t.storeId = ?" : ""}
       GROUP BY ti.productId`,
      storeId !== undefined ? [fromStr, storeId] : [fromStr],
    );
    const ticketCountMap = new Map(
      ticketCountRows.map((r) => [r.productId, r.cnt]),
    );

    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    for (const row of coRows) {
      const isP1Stagnant = stagnantIds.has(row.p1);
      const isP2Stagnant = stagnantIds.has(row.p2);

      // At least one must be stagnant; prefer anchor = the stagnant one
      if (!isP1Stagnant && !isP2Stagnant) continue;

      const anchorId = isP1Stagnant ? row.p1 : row.p2;
      const partnerId = isP1Stagnant ? row.p2 : row.p1;

      const anchor = productMap.get(anchorId);
      const partner = productMap.get(partnerId);
      if (!anchor || !partner) continue;

      const anchorTickets = ticketCountMap.get(anchorId) ?? 1;
      const affinityPct = row.cnt / anchorTickets;

      const anchorCost = costMap.get(anchorId) ?? anchor.costPrice ?? 0;
      const partnerCost = costMap.get(partnerId) ?? partner.costPrice ?? 0;
      const combinedCost = anchorCost + partnerCost;
      const individualTotal = anchor.salePrice + partner.salePrice;

      // Suggest combo price = individual - 8-15% depending on affinity
      const discountFactor =
        affinityPct >= 0.3 ? 0.12 : affinityPct >= 0.15 ? 0.09 : 0.06;
      const comboPrice = Math.max(
        combinedCost / (1 - MIN_MARGIN),
        individualTotal * (1 - discountFactor),
      );
      const comboPct = (individualTotal - comboPrice) / individualTotal;
      const comboMargin =
        combinedCost > 0 ? (comboPrice - combinedCost) / comboPrice : 0;

      combos.push({
        anchorProduct: anchor,
        partnerProduct: partner,
        coOccurrences: row.cnt,
        affinityPct,
        individualTotal,
        comboPrice,
        comboPct,
        combinedCost,
        comboMargin,
      });
    }

    // Sort by affinity desc
    combos.sort((a, b) => b.affinityPct - a.affinityPct);
  }

  const totalCapitalLocked = stagnant.reduce((s, r) => s + r.capitalLocked, 0);
  const noSalesCount = stagnant.filter((r) => r.status === "no_sales").length;
  const totalPotentialRevenue = discounts.reduce(
    (s, r) => s + r.potentialMonthlyRevenue,
    0,
  );

  return {
    stagnant,
    discounts,
    combos,
    totalCapitalLocked,
    noSalesCount,
    totalPotentialRevenue,
    monthsAnalysed: Math.round(totalMonths * 10) / 10,
    combosCount: combos.length,
  };
}

export function comboAffinity(pct: number): ComboAffinity {
  if (pct >= 0.25) return "high";
  if (pct >= 0.1) return "medium";
  return "low";
}
