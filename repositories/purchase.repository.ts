import type {
    CreatePurchaseInput,
    Purchase,
    PurchaseItem,
} from "@/models/purchase";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class PurchaseRepository extends BaseRepository<
  Purchase,
  CreatePurchaseInput,
  Partial<Omit<Purchase, "id">>
> {
  constructor(db: SQLiteDatabase, storeId?: number) {
    super(db, "purchases", storeId);
  }

  /** All purchases, newest first. */
  findAll(): Promise<Purchase[]> {
    return super.findAll("createdAt DESC");
  }

  /** Record a purchase, add stock to each product — all in one transaction. */
  async create(input: CreatePurchaseInput): Promise<Purchase> {
    const itemsTotal = input.items.reduce(
      (sum, i) => sum + i.quantity * i.unitCost,
      0,
    );
    const transportCost = input.transportCost ?? 0;
    const total = itemsTotal + transportCost;
    let purchaseId = 0;
    const storeId = this.storeId ?? 1;

    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const result = await tx.runAsync(
        `INSERT INTO purchases (supplierId, supplierName, notes, total, transportCost, itemCount, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        input.supplierId ?? null,
        input.supplierName,
        input.notes ?? null,
        total,
        transportCost,
        input.items.length,
        storeId,
      );
      purchaseId = result.lastInsertRowId;

      for (const item of input.items) {
        const subtotal = item.quantity * item.unitCost;
        // Prorate transport cost across items by subtotal share, then per-unit.
        const transportShare =
          itemsTotal > 0 ? (transportCost * subtotal) / itemsTotal : 0;
        const allInUnitCost =
          item.quantity > 0
            ? item.unitCost + transportShare / item.quantity
            : item.unitCost;

        await tx.runAsync(
          `INSERT INTO purchase_items (purchaseId, productId, productName, quantity, unitCost, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          purchaseId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitCost,
          subtotal,
        );

        // FIFO batch with all-in unit cost.
        await tx.runAsync(
          `INSERT INTO purchase_batches
            (purchaseId, productId, quantity, quantityRemaining, unitCost, storeId)
           VALUES (?, ?, ?, ?, ?, ?)`,
          purchaseId,
          item.productId,
          item.quantity,
          item.quantity,
          allInUnitCost,
          storeId,
        );

        // Add incoming stock to the product
        await tx.runAsync(
          `UPDATE products SET stockBaseQty = stockBaseQty + ? WHERE id = ?`,
          item.quantity,
          item.productId,
        );

        // Update product cost price with latest purchase cost (including transport)
        await tx.runAsync(
          `UPDATE products SET costPrice = ? WHERE id = ?`,
          allInUnitCost,
          item.productId,
        );
      }
    });

    const purchase = await this.findById(purchaseId);
    if (!purchase) throw new Error("Compra creada pero no encontrada");
    return purchase;
  }

  findItemsByPurchaseId(purchaseId: number): Promise<PurchaseItem[]> {
    return this.db.getAllAsync<PurchaseItem>(
      `SELECT * FROM purchase_items WHERE purchaseId = ? ORDER BY id`,
      [purchaseId],
    );
  }

  /** Total spend and purchase count for a month. Pass YYYY-MM or omit for current. */
  async monthlySummary(month?: string): Promise<{
    totalSpent: number;
    totalTransport: number;
    purchaseCount: number;
  }> {
    const m = month ?? currentMonth();
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [m];
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSpent: number;
      totalTransport: number;
      purchaseCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSpent,
              COALESCE(SUM(transportCost), 0) as totalTransport,
              COUNT(*) as purchaseCount
       FROM purchases
       WHERE strftime('%Y-%m', createdAt) = ?${sFilter}`,
      params,
    );
    return row ?? { totalSpent: 0, totalTransport: 0, purchaseCount: 0 };
  }

  /** Summary for a specific day. */
  async daySummary(date: string): Promise<{
    totalSpent: number;
    totalTransport: number;
    purchaseCount: number;
  }> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [date];
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSpent: number;
      totalTransport: number;
      purchaseCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSpent,
              COALESCE(SUM(transportCost), 0) as totalTransport,
              COUNT(*) as purchaseCount
       FROM purchases
       WHERE strftime('%Y-%m-%d', createdAt) = ?${sFilter}`,
      params,
    );
    return row ?? { totalSpent: 0, totalTransport: 0, purchaseCount: 0 };
  }

  /** Summary for a date range. */
  async rangeSummary(
    from: string,
    to: string,
  ): Promise<{
    totalSpent: number;
    totalTransport: number;
    purchaseCount: number;
  }> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [from, to];
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSpent: number;
      totalTransport: number;
      purchaseCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSpent,
              COALESCE(SUM(transportCost), 0) as totalTransport,
              COUNT(*) as purchaseCount
       FROM purchases
       WHERE date(createdAt) BETWEEN ? AND ?${sFilter}`,
      params,
    );
    return row ?? { totalSpent: 0, totalTransport: 0, purchaseCount: 0 };
  }

  /** Monthly purchase totals for a year (for trend charts). */
  async monthlyTotalsForYear(
    year?: string,
  ): Promise<{ month: number; total: number; transport: number }[]> {
    const y = year ?? String(new Date().getFullYear());
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [y];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT CAST(strftime('%m', createdAt) AS INTEGER) as month,
              COALESCE(SUM(total), 0) as total,
              COALESCE(SUM(transportCost), 0) as transport
       FROM purchases
       WHERE strftime('%Y', createdAt) = ?${sFilter}
       GROUP BY month
       ORDER BY month`,
      params,
    );
  }

  /** Purchases for a specific day. */
  findByDay(date: string): Promise<Purchase[]> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [date];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE date(createdAt) = ?${sFilter} ORDER BY createdAt DESC`,
      params,
    );
  }

  /** Purchases for a specific month (YYYY-MM). */
  findByMonth(month: string): Promise<Purchase[]> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [month];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE strftime('%Y-%m', createdAt) = ?${sFilter} ORDER BY createdAt DESC`,
      params,
    );
  }

  /** Purchases for a specific year. */
  findByYear(year: string): Promise<Purchase[]> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [year];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE strftime('%Y', createdAt) = ?${sFilter} ORDER BY createdAt DESC`,
      params,
    );
  }

  /** Purchases in a date range [from, to] inclusive (YYYY-MM-DD). */
  findByDateRange(from: string, to: string): Promise<Purchase[]> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: any[] = [from, to];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Purchase>(
      `SELECT * FROM purchases WHERE date(createdAt) >= ? AND date(createdAt) <= ?${sFilter} ORDER BY createdAt DESC`,
      params,
    );
  }
}
