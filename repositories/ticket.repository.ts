import type { CreateTicketInput, Ticket, TicketItem } from "@/models/ticket";
import { BaseRepository } from "@/repositories/base.repository";
import type { SQLiteDatabase } from "expo-sqlite";

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

  /** Get current month's sales summary. */
  async monthlySummary(): Promise<{ totalSales: number; ticketCount: number }> {
    const row = await this.db.getFirstAsync<{
      totalSales: number;
      ticketCount: number;
    }>(
      `SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as ticketCount
       FROM tickets
       WHERE strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')`,
    );
    return row ?? { totalSales: 0, ticketCount: 0 };
  }
}
