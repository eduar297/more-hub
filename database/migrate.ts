import type { SQLiteDatabase } from "expo-sqlite";
import { seedUnits } from "./seed";

/**
 * Safety net: create all tables with IF NOT EXISTS.
 * Handles cases where user_version is set but tables are missing
 * (e.g. partial migration, corrupted DB during development).
 */
async function ensureTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS unit_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      categoryId INTEGER NOT NULL,
      toBaseFactor REAL NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES unit_categories(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      pricePerBaseUnit REAL NOT NULL,
      baseUnitId INTEGER NOT NULL,
      stockBaseQty REAL NOT NULL DEFAULT 0,
      saleMode TEXT CHECK (saleMode IN ('UNIT','VARIABLE')) NOT NULL,
      photoUri TEXT,
      FOREIGN KEY (baseUnitId) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
      total REAL NOT NULL,
      itemCount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (ticketId) REFERENCES tickets(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contactName TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      address TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER,
      supplierName TEXT NOT NULL,
      notes TEXT,
      total REAL NOT NULL,
      transportCost REAL NOT NULL DEFAULT 0,
      itemCount INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (supplierId) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitCost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (purchaseId) REFERENCES purchases(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK (category IN ('TRANSPORT','ELECTRICITY','RENT','REPAIRS','SUPPLIES','OTHER')),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 5;

  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );

  let currentVersion = result?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    await ensureTables(db);
    return;
  }

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

  if (currentVersion === 1) {
    await db.execAsync(`ALTER TABLE products ADD COLUMN photoUri TEXT`);
    currentVersion = 2;
  }

  if (currentVersion === 2) {
    await db.execAsync(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
        total REAL NOT NULL,
        itemCount INTEGER NOT NULL
      );

      CREATE TABLE ticket_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticketId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        quantity REAL NOT NULL,
        unitPrice REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (ticketId) REFERENCES tickets(id),
        FOREIGN KEY (productId) REFERENCES products(id)
      );
    `);
    currentVersion = 3;
  }

  if (currentVersion === 3) {
    await db.execAsync(`
      CREATE TABLE suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contactName TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplierId INTEGER,
        supplierName TEXT NOT NULL,
        notes TEXT,
        total REAL NOT NULL,
        itemCount INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (supplierId) REFERENCES suppliers(id)
      );

      CREATE TABLE purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchaseId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        quantity REAL NOT NULL,
        unitCost REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (purchaseId) REFERENCES purchases(id),
        FOREIGN KEY (productId) REFERENCES products(id)
      );
    `);
    currentVersion = 4;
  }

  if (currentVersion === 4) {
    await db.execAsync(`
      ALTER TABLE suppliers ADD COLUMN address TEXT;

      ALTER TABLE purchases ADD COLUMN transportCost REAL NOT NULL DEFAULT 0;

      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL CHECK (category IN ('TRANSPORT','ELECTRICITY','RENT','REPAIRS','SUPPLIES','OTHER')),
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
    currentVersion = 5;
  }

  await seedUnits(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
