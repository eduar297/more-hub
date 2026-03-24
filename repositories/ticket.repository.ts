import type { CreateTicketInput, Ticket, TicketItem } from "@/models/ticket";
import { BaseRepository } from "@/repositories/base.repository";
import type { SQLiteDatabase } from "expo-sqlite";

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
        `INSERT INTO tickets (paymentMethod, total, itemCount) VALUES (?, ?, ?)`,
        input.paymentMethod,
        total,
        input.items.length,
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
      `SELECT * FROM tickets WHERE date(createdAt) = date('now','localtime') ORDER BY createdAt DESC`,
    );
  }

  /** Get items for a specific ticket. */
  findItemsByTicketId(ticketId: number): Promise<TicketItem[]> {
    return this.db.getAllAsync<TicketItem>(
      `SELECT * FROM ticket_items WHERE ticketId = ? ORDER BY id`,
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
  ): Promise<{ totalSales: number; ticketCount: number }> {
    const m = month ?? currentMonth();
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?`,
      [m],
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }

  /** Daily sales totals for a given month (for charts). */
  async dailySales(month?: string): Promise<{ day: number; total: number }[]> {
    const m = month ?? currentMonth();
    return this.db.getAllAsync<{ day: number; total: number }>(
      `SELECT CAST(strftime('%d', createdAt) AS INTEGER) as day,
              COALESCE(SUM(total), 0) as total
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = ?
       GROUP BY day
       ORDER BY day`,
      [m],
    );
  }

  /** Top selling products by revenue for a given month. */
  async topProducts(
    month?: string,
    limit = 5,
  ): Promise<
    {
      productId: number;
      productName: string;
      totalQty: number;
      totalRevenue: number;
    }[]
  > {
    const m = month ?? currentMonth();
    return this.db.getAllAsync(
      `SELECT ti.productId, ti.productName,
              SUM(ti.quantity) as totalQty,
              SUM(ti.subtotal) as totalRevenue
       FROM ticket_items ti
       JOIN tickets t ON ti.ticketId = t.id
       WHERE strftime('%Y-%m', t.createdAt) = ?
       GROUP BY ti.productId, ti.productName
       ORDER BY totalRevenue DESC
       LIMIT ?`,
      [m, limit],
    );
  }
}
