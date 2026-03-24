import type {
    CreateExpenseInput,
    Expense,
    ExpenseCategory,
} from "@/models/expense";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

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

  /** Monthly total grouped by category. */
  async monthlySummaryByCategory(): Promise<
    { category: ExpenseCategory; total: number }[]
  > {
    return this.db.getAllAsync<{ category: ExpenseCategory; total: number }>(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
       GROUP BY category
       ORDER BY total DESC`,
    );
  }

  /** Total expenses for the current month. */
  async monthlyTotal(): Promise<number> {
    const row = await this.db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')`,
    );
    return row?.total ?? 0;
  }
}
