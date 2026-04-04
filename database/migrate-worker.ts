import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Worker-specific DB migration.
 * Creates only the tables needed to sell: stores, units, products, users,
 * tickets, and sync metadata. No suppliers, purchases, expenses, or paired_devices.
 */
export async function migrateWorkerDb(db: SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      logoUri TEXT,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

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
      costPrice REAL,
      salePrice REAL,
      visible INTEGER NOT NULL DEFAULT 1,
      baseUnitId INTEGER NOT NULL,
      stockBaseQty REAL NOT NULL DEFAULT 0,
      saleMode TEXT CHECK (saleMode IN ('UNIT','VARIABLE')) NOT NULL,
      photoUri TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
      FOREIGN KEY (baseUnitId) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK (role IN ('ADMIN','WORKER')) NOT NULL,
      pinHash TEXT NOT NULL,
      photoUri TEXT,
      storeId INTEGER REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      total REAL NOT NULL,
      itemCount INTEGER NOT NULL,
      paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      workerId INTEGER REFERENCES users(id),
      workerName TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
      voidedAt TEXT,
      voidedBy TEXT,
      voidReason TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId TEXT NOT NULL,
      productId INTEGER NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (ticketId) REFERENCES tickets(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync_at TEXT,
      admin_device_id TEXT
    );

    INSERT OR IGNORE INTO sync_metadata (id) VALUES (1);
  `);

  // ── Versioned migrations ────────────────────────────────────────────────
  const WORKER_DB_VERSION = 3;
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = result?.user_version ?? 0;

  if (currentVersion < 1) {
    // Migrate tickets from INTEGER id to TEXT (UUID)
    const colInfo = await db.getAllAsync<{ type: string }>(
      "SELECT type FROM pragma_table_info('tickets') WHERE name = 'id'",
    );
    const idType = colInfo[0]?.type?.toUpperCase() ?? "";

    if (idType === "INTEGER") {
      await db.execAsync(`
        CREATE TABLE tickets_new (
          id TEXT PRIMARY KEY,
          total REAL NOT NULL,
          itemCount INTEGER NOT NULL,
          paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          workerId INTEGER REFERENCES users(id),
          workerName TEXT,
          storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
          voidedAt TEXT,
          voidedBy TEXT,
          voidReason TEXT
        );

        INSERT INTO tickets_new (id, total, itemCount, paymentMethod, createdAt, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason)
          SELECT CAST(id AS TEXT), total, itemCount, paymentMethod, createdAt, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason FROM tickets;

        CREATE TABLE ticket_items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticketId TEXT NOT NULL,
          productId INTEGER NOT NULL,
          productName TEXT NOT NULL,
          quantity REAL NOT NULL,
          unitPrice REAL NOT NULL,
          subtotal REAL NOT NULL,
          FOREIGN KEY (ticketId) REFERENCES tickets_new(id),
          FOREIGN KEY (productId) REFERENCES products(id)
        );

        INSERT INTO ticket_items_new (id, ticketId, productId, productName, quantity, unitPrice, subtotal)
          SELECT id, CAST(ticketId AS TEXT), productId, productName, quantity, unitPrice, subtotal FROM ticket_items;

        DROP TABLE ticket_items;
        DROP TABLE tickets;

        ALTER TABLE tickets_new RENAME TO tickets;
        ALTER TABLE ticket_items_new RENAME TO ticket_items;
      `);
    }

    currentVersion = 1;
  }

  if (currentVersion < 2) {
    // Add columns for delta sync: catalog hash + profile hash + photo manifest
    await db.execAsync(`
      ALTER TABLE sync_metadata ADD COLUMN last_catalog_hash TEXT;
      ALTER TABLE sync_metadata ADD COLUMN last_profile_hash TEXT;
    `);
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    // Add store hours columns
    await db.execAsync(`
      ALTER TABLE stores ADD COLUMN openingTime TEXT;
      ALTER TABLE stores ADD COLUMN closingTime TEXT;
    `);
    currentVersion = 3;
  }

  await db.execAsync(`PRAGMA user_version = ${WORKER_DB_VERSION}`);
}
