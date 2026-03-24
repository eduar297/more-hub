import type {
    CreateExpenseInput,
    Expense,
    ExpenseCategory,
} from "@/models/expense";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class ExpenseRepository extends BaseRepository<
  Expense,
  CreateExpenseInput,
  Partial<Omit<Expense, "id">>
> {
  constructor(db: SQLiteDatabase) {
    super(db, "expenses");
  }

  override findAll(): Promise<Expense[]> {
    return super.findAll("date DESC, createdAt DESC");
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const result = await this.db.runAsync(
      `INSERT INTO expenses (category, description, amount, date) VALUES (?, ?, ?, ?)`,
      input.category,
      input.description,
      input.amount,
      input.date,
    );
    const created = await this.findById(result.lastInsertRowId);
    if (!created) throw new Error("Gasto creado pero no encontrado");
    return created;
  }

  /** Monthly total grouped by category. Pass YYYY-MM or omit for current. */
  async monthlySummaryByCategory(
    month?: string,
  ): Promise<{ category: ExpenseCategory; total: number }[]> {
    const m = month ?? currentMonth();
    return this.db.getAllAsync<{ category: ExpenseCategory; total: number }>(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE strftime('%Y-%m', date) = ?
       GROUP BY category
       ORDER BY total DESC`,
      [m],
    );
  }

  /** Total expenses for a month. Pass YYYY-MM or omit for current. */
  async monthlyTotal(month?: string): Promise<number> {
    const m = month ?? currentMonth();
    const row = await this.db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE strftime('%Y-%m', date) = ?`,
      [m],
    );
    return row?.total ?? 0;
  }
}
