import type { CreateTicketInput, Ticket, TicketItem } from "@/models/ticket";
import type { SQLiteDatabase } from "expo-sqlite";

export class TicketRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  /** Create a ticket with its items and deduct stock, all in one transaction. */
  async create(input: CreateTicketInput): Promise<Ticket> {
    const total = input.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );

    let ticketId = 0;

    await this.db.withExclusiveTransactionAsync(async (tx) => {
      // 1. Insert ticket
      const ticketResult = await tx.runAsync(
        `INSERT INTO tickets (paymentMethod, total, itemCount) VALUES (?, ?, ?)`,
        input.paymentMethod,
        total,
        input.items.length,
      );

      ticketId = ticketResult.lastInsertRowId;

      // 2. Insert each item and deduct stock
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

        // Deduct stock
        await tx.runAsync(
          `UPDATE products SET stockBaseQty = stockBaseQty - ? WHERE id = ?`,
          item.quantity,
          item.productId,
        );
      }
    });

    const ticket = await this.db.getFirstAsync<Ticket>(
      `SELECT * FROM tickets WHERE id = ?`,
      [ticketId],
    );
    if (!ticket) throw new Error("Ticket creado pero no encontrado");
    return ticket;
  }

  /** Get all tickets, newest first. */
  findAll(): Promise<Ticket[]> {
    return this.db.getAllAsync<Ticket>(
      `SELECT * FROM tickets ORDER BY createdAt DESC`,
    );
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
}
