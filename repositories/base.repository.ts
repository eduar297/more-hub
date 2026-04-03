import type { SQLiteDatabase } from "expo-sqlite";

/** Only allow simple alphanumeric column names to prevent SQL injection. */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL identifier: "${name}"`);
  }
}

export abstract class BaseRepository<
  T extends { id: number | string },
  CreateInput,
  UpdateInput extends Partial<Omit<T, "id">>,
> {
  constructor(
    protected readonly db: SQLiteDatabase,
    protected readonly table: string,
    protected readonly storeId?: number,
  ) {
    assertSafeIdentifier(table);
  }

  findById(id: number | string): Promise<T | null> {
    return this.db.getFirstAsync<T>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [id],
    );
  }

  findAll(orderBy = "id ASC"): Promise<T[]> {
    // Validate each token in orderBy to prevent injection
    for (const token of orderBy.split(/[\s,]+/)) {
      if (token && !["ASC", "DESC"].includes(token.toUpperCase())) {
        assertSafeIdentifier(token);
      }
    }
    if (this.storeId !== undefined) {
      return this.db.getAllAsync<T>(
        `SELECT * FROM ${this.table} WHERE storeId = ? ORDER BY ${orderBy}`,
        [this.storeId],
      );
    }
    return this.db.getAllAsync<T>(
      `SELECT * FROM ${this.table} ORDER BY ${orderBy}`,
    );
  }

  abstract create(input: CreateInput): Promise<T>;

  async update(id: number | string, input: UpdateInput): Promise<T> {
    const fields = (Object.keys(input) as (keyof UpdateInput)[]).filter(
      (f) => input[f] !== undefined,
    );
    // Validate column names to prevent SQL injection
    for (const f of fields) {
      assertSafeIdentifier(String(f));
    }
    const setClause = fields.map((f) => `${String(f)} = ?`).join(", ");
    const values = fields.map((f) => input[f] as string | number);
    await this.db.runAsync(
      `UPDATE ${this.table} SET ${setClause} WHERE id = ?`,
      ...values,
      id,
    );
    const updated = await this.findById(id);
    if (!updated)
      throw new Error(`${this.table}: registro no encontrado tras actualizar`);
    return updated;
  }

  async delete(id: number | string): Promise<void> {
    await this.db.runAsync(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
  }
}
