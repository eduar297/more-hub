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
      logoHash TEXT,
      cloudLogoPath TEXT,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
      code TEXT UNIQUE,
      pricePerBaseUnit REAL NOT NULL,
      costPrice REAL,
      salePrice REAL,
      visible INTEGER NOT NULL DEFAULT 1,
      baseUnitId INTEGER NOT NULL,
      stockBaseQty REAL NOT NULL DEFAULT 0,
      saleMode TEXT CHECK (saleMode IN ('UNIT','VARIABLE')) NOT NULL,
      photoUri TEXT,
      photoHash TEXT,
      cloudPhotoPath TEXT,
      details TEXT,
      storeId INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK (role IN ('ADMIN', 'WORKER')) NOT NULL,
      pinHash TEXT NOT NULL,
      photoUri TEXT,
      photoHash TEXT,
      cloudPhotoPath TEXT,
      storeId INTEGER REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS sync_hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 8765,
      name TEXT,
      deviceId TEXT,
      brand TEXT,
      model TEXT,
      osVersion TEXT,
      appVersion TEXT,
      lastUsedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(host, port)
    );
  `);
  await ensureTriggers(db);
}

/** Create updatedAt triggers for all syncable tables (idempotent). */
async function ensureTriggers(db: SQLiteDatabase) {
  const tables = [
    "stores",
    "products",
    "tickets",
    "ticket_items",
    "expenses",
    "suppliers",
    "users",
  ];
  for (const t of tables) {
    await db.execAsync(`
      CREATE TRIGGER IF NOT EXISTS trg_${t}_updated_at
      AFTER UPDATE ON ${t}
      FOR EACH ROW
      WHEN NEW.updatedAt = OLD.updatedAt
      BEGIN
        UPDATE ${t} SET updatedAt = datetime('now','localtime') WHERE id = NEW.id;
      END;
    `);
  }
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 30;

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
    // paired_devices removed in v26 — keep migration as no-op for version chain
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
    // sync_metadata removed from admin DB in v27 — keep as no-op
    currentVersion = 16;
  }

  if (currentVersion === 16) {
    // Migrate tickets from INTEGER TEXT (UUID)
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

  if (currentVersion === 20) {
    await db.execAsync(`
      ALTER TABLE products RENAME COLUMN barcode TO code;
    `);
    currentVersion = 21;
  }

  if (currentVersion === 21) {
    // Add createdAt to tables that were missing it
    // NOTE: ALTER TABLE ADD COLUMN requires a constant default in SQLite
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN createdAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE ticket_items ADD COLUMN createdAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE purchase_items ADD COLUMN createdAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
    `);

    // Add updatedAt to all 9 syncable tables
    await db.execAsync(`
      ALTER TABLE stores ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE products ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE tickets ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE ticket_items ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE purchases ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE purchase_items ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE expenses ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE suppliers ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
      ALTER TABLE users ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
    `);

    // Backfill existing rows with real timestamps
    await db.execAsync(`
      UPDATE products SET createdAt = datetime('now','localtime'), updatedAt = datetime('now','localtime') WHERE createdAt = '1970-01-01 00:00:00';
      UPDATE ticket_items SET createdAt = datetime('now','localtime'), updatedAt = datetime('now','localtime') WHERE createdAt = '1970-01-01 00:00:00';
      UPDATE purchase_items SET createdAt = datetime('now','localtime'), updatedAt = datetime('now','localtime') WHERE createdAt = '1970-01-01 00:00:00';
      UPDATE stores SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE tickets SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE purchases SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE expenses SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE suppliers SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE users SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
    `);

    currentVersion = 22;
  }

  if (currentVersion === 22) {
    await db.execAsync(`
      DROP TABLE IF EXISTS sync_hosts;
      CREATE TABLE sync_hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 8765,
        name TEXT,
        deviceShortId TEXT,
        lastUsedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(host, port)
      );
    `);
    currentVersion = 23;
  }

  if (currentVersion === 23) {
    await db.execAsync(`
      DROP TABLE IF EXISTS sync_hosts;
      CREATE TABLE sync_hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 8765,
        name TEXT,
        deviceShortId TEXT,
        lastUsedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(host, port)
      );
    `);
    currentVersion = 24;
  }

  if (currentVersion === 24) {
    await db.execAsync(`
      DROP TABLE IF EXISTS sync_hosts;
      CREATE TABLE sync_hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 8765,
        name TEXT,
        deviceId TEXT,
        lastUsedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(host, port)
      );
    `);
    currentVersion = 25;
  }

  if (currentVersion === 25) {
    await db.execAsync(`DROP TABLE IF EXISTS paired_devices;`);
    currentVersion = 26;
  }

  if (currentVersion === 26) {
    await db.execAsync(`DROP TABLE IF EXISTS sync_metadata;`);
    currentVersion = 27;
  }

  if (currentVersion === 27) {
    await db.execAsync(`
      ALTER TABLE sync_hosts ADD COLUMN brand TEXT;
      ALTER TABLE sync_hosts ADD COLUMN model TEXT;
      ALTER TABLE sync_hosts ADD COLUMN osVersion TEXT;
      ALTER TABLE sync_hosts ADD COLUMN appVersion TEXT;
    `);
    currentVersion = 28;
  }

  if (currentVersion === 28) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN photoHash TEXT;
      ALTER TABLE products ADD COLUMN cloudPhotoPath TEXT;
      ALTER TABLE users ADD COLUMN photoHash TEXT;
      ALTER TABLE users ADD COLUMN cloudPhotoPath TEXT;
      ALTER TABLE stores ADD COLUMN logoHash TEXT;
      ALTER TABLE stores ADD COLUMN cloudLogoPath TEXT;
    `);
    currentVersion = 29;
  }

  if (currentVersion === 29) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN details TEXT;
    `);
    currentVersion = 30;
  }

  await ensureTriggers(db);
  await seedUnits(db);
  await seedDefaultStore(db);
  await seedDefaultAdmin(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  return;
}
