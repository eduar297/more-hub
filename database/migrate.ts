import type { SQLiteDatabase } from "expo-sqlite";
import { seedDefaultAdmin, seedDefaultStore, seedUnits } from "./seed";

/**
 * Safety net: create all tables with IF NOT EXISTS.
 * Handles cases where user_version is set but tables are missing
 * (e.g. partial migration, corrupted DB during development).
 */
async function ensureTables(db: SQLiteDatabase) {
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

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
      total REAL NOT NULL,
      itemCount INTEGER NOT NULL,
      workerId INTEGER,
      workerName TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
      voidedAt TEXT,
      voidedBy INTEGER REFERENCES users(id),
      voidReason TEXT,
      FOREIGN KEY (workerId) REFERENCES users(id)
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

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contactName TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      address TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
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
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
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
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK (role IN ('ADMIN', 'WORKER')) NOT NULL,
      pinHash TEXT NOT NULL,
      photoUri TEXT,
      storeId INTEGER REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paired_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceId TEXT NOT NULL UNIQUE,
      deviceName TEXT,
      lastConnected TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS notification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      dedupeKey TEXT,
      seen INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync_at TEXT,
      admin_device_id TEXT
    );

    INSERT OR IGNORE INTO sync_metadata (id) VALUES (1);
  `);
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 20;

  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );

  let currentVersion = result?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    await ensureTables(db);
    await seedUnits(db);
    await seedDefaultStore(db);
    await seedDefaultAdmin(db);
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

  if (currentVersion === 5) {
    await db.execAsync(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT CHECK (role IN ('ADMIN', 'WORKER')) NOT NULL,
        pinHash TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
    currentVersion = 6;
  }

  if (currentVersion === 6) {
    await db.execAsync(
      `ALTER TABLE tickets ADD COLUMN workerId INTEGER REFERENCES users(id)`,
    );
    currentVersion = 7;
  }

  if (currentVersion === 7) {
    await db.execAsync(`ALTER TABLE tickets ADD COLUMN workerName TEXT`);
    currentVersion = 8;
  }

  if (currentVersion === 8) {
    await db.execAsync(`ALTER TABLE users ADD COLUMN photoUri TEXT`);
    currentVersion = 9;
  }

  if (currentVersion === 9) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN costPrice REAL;
      ALTER TABLE products ADD COLUMN salePrice REAL;
      ALTER TABLE products ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
    `);
    // Migrate existing data: costPrice = pricePerBaseUnit, salePrice = pricePerBaseUnit
    await db.execAsync(`
      UPDATE products SET costPrice = pricePerBaseUnit, salePrice = pricePerBaseUnit WHERE costPrice IS NULL;
    `);
    currentVersion = 10;
  }

  if (currentVersion === 10) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        logoUri TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);

    // Insert default store for existing data
    const storeCount = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM stores",
    );
    if ((storeCount?.count ?? 0) === 0) {
      await db.runAsync("INSERT INTO stores (name) VALUES (?)", "Mi Tienda");
    }

    // Add storeId to all scoped tables
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
      ALTER TABLE tickets ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
      ALTER TABLE suppliers ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
      ALTER TABLE purchases ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
      ALTER TABLE expenses ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
      ALTER TABLE users ADD COLUMN storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id);
    `);

    currentVersion = 11;
  }

  if (currentVersion === 11) {
    // Make storeId nullable for users (admin is global, no store)
    await db.execAsync(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT CHECK (role IN ('ADMIN', 'WORKER')) NOT NULL,
        pinHash TEXT NOT NULL,
        photoUri TEXT,
        storeId INTEGER REFERENCES stores(id),
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO users_new (id, name, role, pinHash, photoUri, storeId, createdAt)
        SELECT id, name, role, pinHash, photoUri, storeId, createdAt FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      UPDATE users SET storeId = NULL WHERE role = 'ADMIN';
    `);
    currentVersion = 12;
  }

  if (currentVersion === 12) {
    await db.execAsync(`
      ALTER TABLE stores ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6';
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    currentVersion = 13;
  }

  if (currentVersion === 13) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS paired_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId TEXT NOT NULL UNIQUE,
        deviceName TEXT,
        lastConnected TEXT,
        storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id)
      );
    `);
    currentVersion = 14;
  }

  if (currentVersion === 14) {
    await db.execAsync(`
      ALTER TABLE tickets ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED'));
      ALTER TABLE tickets ADD COLUMN voidedAt TEXT;
      ALTER TABLE tickets ADD COLUMN voidedBy INTEGER REFERENCES users(id);
      ALTER TABLE tickets ADD COLUMN voidReason TEXT;
    `);
    currentVersion = 15;
  }

  if (currentVersion === 15) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_at TEXT,
        admin_device_id TEXT
      );

      INSERT OR IGNORE INTO sync_metadata (id) VALUES (1);
    `);
    currentVersion = 16;
  }

  if (currentVersion === 16) {
    // Migrate tickets from INTEGER id to TEXT (UUID)
    await db.execAsync(`
      CREATE TABLE tickets_new (
        id TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        paymentMethod TEXT CHECK (paymentMethod IN ('CASH','CARD')) NOT NULL,
        total REAL NOT NULL,
        itemCount INTEGER NOT NULL,
        workerId INTEGER,
        workerName TEXT,
        storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
        voidedAt TEXT,
        voidedBy INTEGER REFERENCES users(id),
        voidReason TEXT,
        FOREIGN KEY (workerId) REFERENCES users(id)
      );

      INSERT INTO tickets_new (id, createdAt, paymentMethod, total, itemCount, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason)
        SELECT CAST(id AS TEXT), createdAt, paymentMethod, total, itemCount, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason FROM tickets;

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
    currentVersion = 17;
  }

  if (currentVersion === 17) {
    await db.execAsync(`
      ALTER TABLE stores ADD COLUMN openingTime TEXT;
      ALTER TABLE stores ADD COLUMN closingTime TEXT;
    `);
    currentVersion = 18;
  }

  if (currentVersion === 18) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        dedupeKey TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
    currentVersion = 19;
  }

  if (currentVersion === 19) {
    await db.execAsync(`
      ALTER TABLE notification_history ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
    `);
    currentVersion = 20;
  }

  await seedUnits(db);
  await seedDefaultStore(db);
  await seedDefaultAdmin(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  return;
}
