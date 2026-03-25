import type { CreateTicketInput, Ticket, TicketItem } from "@/models/ticket";
import { BaseRepository } from "@/repositories/base.repository";
import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class TicketRepository extends BaseRepository<
  Ticket,
  CreateTicketInput,
  Partial<Omit<Ticket, "id">>
> {
  constructor(db: SQLiteDatabase) {
    super(db, "tickets");
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
        `INSERT INTO tickets (paymentMethod, total, itemCount, workerId, workerName) VALUES (?, ?, ?, ?, ?)`,
        input.paymentMethod,
        total,
        input.items.length,
        input.workerId ?? null,
        input.workerName ?? null,
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

  /** Get all tickets, newest first. */
  override findAll(): Promise<Ticket[]> {
    return super.findAll("createdAt DESC");
  }

  /** Get tickets created today, newest first. */
  findToday(): Promise<Ticket[]> {
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE date(t.createdAt) = date('now','localtime')
       ORDER BY t.createdAt DESC`,
    );
  }

  /** Get items for a specific ticket (with product info). */
  findItemsByTicketId(ticketId: number): Promise<TicketItem[]> {
    return this.db.getAllAsync<TicketItem>(
      `SELECT ti.*, p.barcode, p.photoUri, p.pricePerBaseUnit AS originalPrice
       FROM ticket_items ti
       LEFT JOIN products p ON p.id = ti.productId
       WHERE ti.ticketId = ? ORDER BY ti.id`,
      [ticketId],
    );
  }

  /** Get today's sales summary. */
  async todaySummary(): Promise<{ totalSales: number; ticketCount: number }> {
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets WHERE date(createdAt) = date('now','localtime')`,
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
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}`,
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
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync<{ day: number; total: number }>(
      `SELECT CAST(strftime('%d', createdAt) AS INTEGER) as day,
              COALESCE(SUM(total), 0) as total
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}
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
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    params.push(limit);
    return this.db.getAllAsync(
      `SELECT ti.productId, ti.productName,
              SUM(ti.quantity) as totalQty,
              SUM(ti.subtotal) as totalRevenue
       FROM ticket_items ti
       JOIN tickets t ON ti.ticketId = t.id
       WHERE strftime('%Y-%m', t.createdAt) = ?${wFilter}
       GROUP BY ti.productId, ti.productName
       ORDER BY totalRevenue DESC
       LIMIT ?`,
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
    const params: SQLiteBindValue[] = [from, to];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE date(t.createdAt) >= ? AND date(t.createdAt) <= ?${wFilter}
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
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync(
      `SELECT ((CAST(strftime('%d', createdAt) AS INTEGER) - 1) / 7 + 1) as week,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}
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
    const params: SQLiteBindValue[] = [y];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync(
      `SELECT CAST(strftime('%m', createdAt) AS INTEGER) as month,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE strftime('%Y', createdAt) = ?${wFilter}
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
    const params: SQLiteBindValue[] = [m];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync(
      `SELECT paymentMethod as method,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?${wFilter}
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
    const params: SQLiteBindValue[] = [date];
    if (workerId) params.push(workerId);
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
      avgTicket: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales,
              COUNT(*) as ticketCount,
              COALESCE(AVG(total), 0) as avgTicket
       FROM tickets
       WHERE date(createdAt) = ?${wFilter}`,
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
    const params: SQLiteBindValue[] = [date];
    if (workerId) params.push(workerId);
    return this.db.getAllAsync(
      `SELECT CAST(strftime('%H', createdAt) AS INTEGER) as hour,
              COALESCE(SUM(total), 0) as total,
              COUNT(*) as tickets
       FROM tickets
       WHERE date(createdAt) = ?${wFilter}
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
    return this.db.getAllAsync<Ticket>(
      `SELECT t.*, u.photoUri AS workerPhotoUri
       FROM tickets t
       LEFT JOIN users u ON u.id = t.workerId
       WHERE t.workerId = ? AND date(t.createdAt) >= ? AND date(t.createdAt) <= ?
       ORDER BY t.createdAt DESC`,
      [workerId, from, to],
    );
  }

  /** Worker summary for a date range. */
  async workerRangeSummary(
    workerId: number,
    from: string,
    to: string,
  ): Promise<{ totalSales: number; ticketCount: number }> {
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE workerId = ? AND date(createdAt) >= ? AND date(createdAt) <= ?`,
      [workerId, from, to],
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }
}
