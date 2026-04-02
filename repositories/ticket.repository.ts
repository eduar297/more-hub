import type { CreateTicketInput, Ticket, TicketItem } from "@/models/ticket";
import { BaseRepository } from "@/repositories/base.repository";
import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

/** Active-only filter appended to most queries. */
const ACTIVE = " AND status = 'ACTIVE'";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class TicketRepository extends BaseRepository<
  Ticket,
  CreateTicketInput,
  Partial<Omit<Ticket, "id">>
> {
  constructor(db: SQLiteDatabase, storeId?: number) {
    super(db, "tickets", storeId);
  }

  /** Create a ticket with its items and deduct stock, all in one transaction. */
  async create(input: CreateTicketInput): Promise<Ticket> {
    const total = input.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );

    let ticketId = 0;

    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const ticketResult = await tx.runAsync(
        `INSERT INTO tickets (paymentMethod, total, itemCount, workerId, workerName, storeId) VALUES (?, ?, ?, ?, ?, ?)`,
        input.paymentMethod,
        total,
        input.items.length,
        input.workerId ?? null,
        input.workerName ?? null,
        this.storeId ?? 1,
      );

      ticketId = ticketResult.lastInsertRowId;

      for (const item of input.items) {
        const subtotal = item.quantity * item.unitPrice;

        await tx.runAsync(
          `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ticketId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          subtotal,
        );

        await tx.runAsync(
          `UPDATE products SET stockBaseQty = stockBaseQty - ? WHERE id = ?`,
          item.quantity,
          item.productId,
        );
      }
    });

    const ticket = await this.findById(ticketId);
    if (!ticket) throw new Error("Ticket creado pero no encontrado");
    return ticket;
  }

  /**
   * Void (annul) a ticket: mark as VOIDED and restore stock for each item.
   * Runs inside an exclusive transaction to guarantee atomicity.
   */
  async voidTicket(
    ticketId: number,
    userId: number,
    reason: string,
  ): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      // Verify ticket is active
      const ticket = await tx.getFirstAsync<{ status: string }>(
        `SELECT status FROM tickets WHERE id = ?`,
        [ticketId],
      );
      if (!ticket) throw new Error("Ticket no encontrado");
      if (ticket.status === "VOIDED") throw new Error("Ticket ya anulado");

      // Mark as voided
      await tx.runAsync(
        `UPDATE tickets SET status = 'VOIDED', voidedAt = datetime('now','localtime'), voidedBy = ?, voidReason = ? WHERE id = ?`,
        userId,
        reason,
        ticketId,
      );

      // Restore stock for each item
      const items = await tx.getAllAsync<{
        productId: number;
        quantity: number;
      }>(`SELECT productId, quantity FROM ticket_items WHERE ticketId = ?`, [
        ticketId,
      ]);
      for (const item of items) {
        await tx.runAsync(
          `UPDATE products SET stockBaseQty = stockBaseQty + ? WHERE id = ?`,
          item.quantity,
          item.productId,
        );
      }
    });
  }

  /** Get all tickets, newest first. */
  override findAll(): Promise<Ticket[]> {
    return super.findAll("createdAt DESC");
  }

  /** Get tickets created today, newest first. */
  findToday(): Promise<Ticket[]> {
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE date(t.createdAt) = date('now','localtime')${ACTIVE}${sFilter}
       ORDER BY t.createdAt DESC`,
      params,
    );
  }

  /** Get items for a specific ticket (with product info). */
  findItemsByTicketId(ticketId: number): Promise<TicketItem[]> {
    return this.db.getAllAsync<TicketItem>(
      `SELECT ti.*, p.barcode, p.photoUri, p.salePrice AS originalPrice
       FROM ticket_items ti
       LEFT JOIN products p ON p.id = ti.productId
       WHERE ti.ticketId = ? ORDER BY ti.id`,
      [ticketId],
    );
  }

  /** Get today's sales summary. */
  async todaySummary(): Promise<{ totalSales: number; ticketCount: number }> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [];
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets WHERE date(createdAt) = date('now','localtime')${ACTIVE}${sFilter}`,
      params,
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }

  /** Get monthly sales summary. Pass YYYY-MM or omit for current month. */
  async monthlySummary(
    month?: string,
    workerId?: number | null,
  ): Promise<{ totalSales: number; ticketCount: number }> {
    const m = month ?? currentMonth();
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}${sFilter}${ACTIVE}`,
      params,
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }

  /** Daily sales totals for a given month (for charts). */
  async dailySales(
    month?: string,
    workerId?: number | null,
  ): Promise<{ day: number; total: number }[]> {
    const m = month ?? currentMonth();
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<{ day: number; total: number }>(
      `SELECT CAST(strftime('%d', createdAt) AS INTEGER) as day,
              COALESCE(SUM(total), 0) as total
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY day
       ORDER BY day`,
      params,
    );
  }

  /** Top selling products by revenue for a given month. */
  async topProducts(
    month?: string,
    limit = 5,
    workerId?: number | null,
  ): Promise<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  > {
    const m = month ?? currentMonth();
    const wFilter = workerId ? " AND t.workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    params.push(limit);
    return this.db.getAllAsync(
      `SELECT ti.productId, ti.productName,
              SUM(ti.quantity) as totalQty,
              SUM(ti.subtotal) as totalRevenue
       FROM ticket_items ti
       JOIN tickets t ON ti.ticketId = t.id
       WHERE strftime('%Y-%m', t.createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY ti.productId, ti.productName
       ORDER BY totalRevenue DESC
       LIMIT ?`,
      params,
    );
  }

  /** Top selling products by revenue for a date range [from, to] inclusive. */
  async topProductsByRange(
    from: string,
    to: string,
    limit = 5,
    workerId?: number | null,
  ): Promise<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  > {
    const wFilter = workerId ? " AND t.workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [from, to];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    params.push(limit);
    return this.db.getAllAsync(
      `SELECT ti.productId, ti.productName,
              SUM(ti.quantity) as totalQty,
              SUM(ti.subtotal) as totalRevenue
       FROM ticket_items ti
       JOIN tickets t ON ti.ticketId = t.id
       WHERE date(t.createdAt) BETWEEN ? AND ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY ti.productId, ti.productName
       ORDER BY totalRevenue DESC
       LIMIT ?`,
      params,
    );
  }

  /** Payment method breakdown for a date range [from, to] inclusive. */
  async paymentMethodBreakdownByRange(
    from: string,
    to: string,
    workerId?: number | null,
  ): Promise<{ method: string; total: number; count: number }[]> {
    const wFilter = workerId ? " AND t.workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [from, to];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT t.paymentMethod as method,
              COALESCE(SUM(t.total), 0) as total,
              COUNT(*) as count
       FROM tickets t
       WHERE date(t.createdAt) BETWEEN ? AND ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY t.paymentMethod`,
      params,
    );
  }

  /** Tickets in a date range [from, to] inclusive (YYYY-MM-DD). */
  findByDateRange(
    from: string,
    to: string,
    workerId?: number | null,
  ): Promise<Ticket[]> {
    const wFilter = workerId ? " AND t.workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [from, to];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE date(t.createdAt) >= ? AND date(t.createdAt) <= ?${wFilter}${sFilter}${ACTIVE}
       ORDER BY t.createdAt DESC`,
      params,
    );
  }

  /** Weekly sales totals for a given month (week number 1-5). */
  async weeklySales(
    month?: string,
    workerId?: number | null,
  ): Promise<{ week: number; total: number; tickets: number }[]> {
    const m = month ?? currentMonth();
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT ((CAST(strftime('%d', createdAt) AS INTEGER) - 1) / 7 + 1) as week,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY week
       ORDER BY week`,
      params,
    );
  }

  /** Monthly sales totals for a given year (for year charts). */
  async monthlySalesForYear(
    year?: string,
    workerId?: number | null,
  ): Promise<{ month: number; total: number; tickets: number }[]> {
    const y = year ?? String(new Date().getFullYear());
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [y];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT CAST(strftime('%m', createdAt) AS INTEGER) as month,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE strftime('%Y', createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY month
       ORDER BY month`,
      params,
    );
  }

  /** Payment method breakdown for a month. */
  async paymentMethodBreakdown(
    month?: string,
    workerId?: number | null,
  ): Promise<{ method: string; total: number; count: number }[]> {
    const m = month ?? currentMonth();
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT paymentMethod as method,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY paymentMethod`,
      params,
    );
  }

  /** Summary for a single day. */
  async daySummary(
    date: string,
    workerId?: number | null,
  ): Promise<{ totalSales: number; ticketCount: number; avgTicket: number }> {
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [date];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
      avgTicket: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales,
              COUNT(*) as ticketCount,
              COALESCE(AVG(total), 0) as avgTicket
       FROM tickets
       WHERE date(createdAt) = ?${wFilter}${sFilter}${ACTIVE}`,
      params,
    );
    return row ?? { totalSales: 0, ticketCount: 0, avgTicket: 0 };
  }

  /** Hourly sales for a given day (for day-detail charts). */
  async hourlySales(
    date: string,
    workerId?: number | null,
  ): Promise<{ hour: number; total: number; tickets: number }[]> {
    const wFilter = workerId ? " AND workerId = ?" : "";
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [date];
    if (workerId) params.push(workerId);
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT CAST(strftime('%H', createdAt) AS INTEGER) as hour,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE date(createdAt) = ?${wFilter}${sFilter}${ACTIVE}
       GROUP BY hour
       ORDER BY hour`,
      params,
    );
  }

  // ── Worker-scoped queries ─────────────────────────────────────────────────

  /** Tickets for a specific worker in a date range [from, to] inclusive. */
  findByWorkerAndDateRange(
    workerId: number,
    from: string,
    to: string,
  ): Promise<Ticket[]> {
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [workerId, from, to];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE t.workerId = ? AND date(t.createdAt) >= ? AND date(t.createdAt) <= ?${sFilter}${ACTIVE}
       ORDER BY t.createdAt DESC`,
      params,
    );
  }

  /** Worker summary for a date range. */
  async workerRangeSummary(
    workerId: number,
    from: string,
    to: string,
  ): Promise<{ totalSales: number; ticketCount: number }> {
    const sFilter = this.storeId !== undefined ? " AND storeId = ?" : "";
    const params: SQLiteBindValue[] = [workerId, from, to];
    if (this.storeId !== undefined) params.push(this.storeId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE workerId = ? AND date(createdAt) >= ? AND date(createdAt) <= ?${sFilter}${ACTIVE}`,
      params,
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }

  /** Leaderboard: workers ranked by total sales in a date range. */
  async workerLeaderboard(
    from: string,
    to: string,
  ): Promise<
    {
      workerId: number;
      workerName: string;
      workerPhotoUri: string | null;
      totalSales: number;
      ticketCount: number;
      avgTicket: number;
    }[]
  > {
    const sFilter = this.storeId !== undefined ? " AND t.storeId = ?" : "";
    const params: SQLiteBindValue[] = [from, to];
    if (this.storeId !== undefined) params.push(this.storeId);
    return this.db.getAllAsync(
      `SELECT t.workerId, t.workerName, u.photoUri AS workerPhotoUri,
              COALESCE(SUM(t.total), 0) AS totalSales,
              COUNT(*) AS ticketCount,
              COALESCE(AVG(t.total), 0) AS avgTicket
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE t.workerId IS NOT NULL
         AND date(t.createdAt) >= ? AND date(t.createdAt) <= ?${sFilter}${ACTIVE}
       GROUP BY t.workerId, t.workerName
       ORDER BY totalSales DESC`,
      params,
    );
  }
}
