import type { SQLiteDatabase } from "expo-sqlite";
import { seedUnits } from "./seed";

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 1;

  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );

  let currentVersion = result?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE unit_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        categoryId INTEGER NOT NULL,
        toBaseFactor REAL NOT NULL,
        FOREIGN KEY (categoryId) REFERENCES unit_categories(id)
      );

      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        pricePerBaseUnit REAL NOT NULL,
        baseUnitId INTEGER NOT NULL,
        stockBaseQty REAL NOT NULL DEFAULT 0,
        saleMode TEXT CHECK (saleMode IN ('UNIT','VARIABLE')) NOT NULL,
        FOREIGN KEY (baseUnitId) REFERENCES units(id)
      );
    `);

    currentVersion = 1;
  }

  await seedUnits(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
