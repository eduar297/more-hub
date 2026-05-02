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
      latitude REAL,
      longitude REAL,
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

    CREATE TABLE IF NOT EXISTS product_price_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id),
      minQty REAL NOT NULL,
      maxQty REAL,
      price REAL NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK (role IN ('ADMIN','WORKER')) NOT NULL,
      pinHash TEXT NOT NULL,
      photoUri TEXT,
      photoHash TEXT,
      cloudPhotoPath TEXT,
      storeId INTEGER REFERENCES stores(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
      voidReason TEXT,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      syncedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId TEXT NOT NULL,
      productId INTEGER NOT NULL,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      costPrice REAL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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
  const WORKER_DB_VERSION = 10;
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = result?.user_version ?? 0;

  console.log({ WORKER_DB_VERSION });
  console.log({ currentVersion });

  /** Safely add a column only if it doesn't already exist. */
  const addColumnIfMissing = async (
    table: string,
    column: string,
    def: string,
  ) => {
    const cols = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}')`,
    );
    if (!cols.some((c) => c.name === column)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
    }
  };

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
          costPrice REAL,
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
    await addColumnIfMissing("sync_metadata", "last_catalog_hash", "TEXT");
    await addColumnIfMissing("sync_metadata", "last_profile_hash", "TEXT");
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    // Skip store hours columns (no longer needed)
    currentVersion = 3;
  }

  if (currentVersion < 4) {
    // Rename barcode column to code
    const cols = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('products')",
    );
    if (cols.some((c) => c.name === "barcode")) {
      await db.execAsync(`
        ALTER TABLE products RENAME COLUMN barcode TO code;
      `);
    }
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    // Add createdAt / updatedAt to tables that may be missing them.
    // Tables created fresh already include these columns, so we must
    // check before adding to avoid "duplicate column name" errors.
    await addColumnIfMissing(
      "products",
      "createdAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );
    await addColumnIfMissing(
      "ticket_items",
      "createdAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );

    await addColumnIfMissing(
      "stores",
      "updatedAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );
    await addColumnIfMissing(
      "products",
      "updatedAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );
    await addColumnIfMissing(
      "users",
      "updatedAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );
    await addColumnIfMissing(
      "tickets",
      "updatedAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );
    await addColumnIfMissing(
      "ticket_items",
      "updatedAt",
      "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    );

    // Backfill existing rows with real timestamps
    await db.execAsync(`
      UPDATE products SET createdAt = datetime('now','localtime'), updatedAt = datetime('now','localtime') WHERE createdAt = '1970-01-01 00:00:00';
      UPDATE ticket_items SET createdAt = datetime('now','localtime'), updatedAt = datetime('now','localtime') WHERE createdAt = '1970-01-01 00:00:00';
      UPDATE stores SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE users SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
      UPDATE tickets SET updatedAt = datetime('now','localtime') WHERE updatedAt = '1970-01-01 00:00:00';
    `);

    currentVersion = 5;
  }

  if (currentVersion < 6) {
    // Add syncedAt column so tickets survive after sync
    await addColumnIfMissing("tickets", "syncedAt", "TEXT");
    currentVersion = 6;
  }

  if (currentVersion < 7) {
    await addColumnIfMissing("products", "photoHash", "TEXT");
    await addColumnIfMissing("products", "cloudPhotoPath", "TEXT");
    await addColumnIfMissing("users", "photoHash", "TEXT");
    await addColumnIfMissing("users", "cloudPhotoPath", "TEXT");
    await addColumnIfMissing("stores", "logoHash", "TEXT");
    await addColumnIfMissing("stores", "cloudLogoPath", "TEXT");
    currentVersion = 7;
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_price_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL REFERENCES products(id),
        minQty REAL NOT NULL,
        maxQty REAL,
        price REAL NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
    currentVersion = 8;
  }

  if (currentVersion < 9) {
    // Add missing costPrice column to ticket_items (needed for COGS calculations)
    await addColumnIfMissing("ticket_items", "costPrice", "REAL");
    currentVersion = 9;
  }

  if (currentVersion < 10) {
    console.log(
      "🔄 Resetting worker database due to schema inconsistencies...",
    );

    // Drop all tables and recreate from scratch to ensure consistency
    await db.execAsync(`
      -- Drop all tables if they exist
      DROP TABLE IF EXISTS ticket_items;
      DROP TABLE IF EXISTS tickets;
      DROP TABLE IF EXISTS products; 
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS stores;
      DROP TABLE IF EXISTS units;
      DROP TABLE IF EXISTS unit_categories;
      DROP TABLE IF EXISTS product_price_tiers;
      DROP TABLE IF EXISTS app_settings;
      DROP TABLE IF EXISTS sync_metadata;

      -- Recreate all tables with correct schema
      CREATE TABLE stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        latitude REAL,
        longitude REAL,
        phone TEXT,
        logoUri TEXT,
        logoHash TEXT,
        cloudLogoPath TEXT,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

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

      CREATE TABLE product_price_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL REFERENCES products(id),
        minQty REAL NOT NULL,
        maxQty REAL,
        price REAL NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT CHECK (role IN ('ADMIN','WORKER')) NOT NULL,
        pinHash TEXT NOT NULL,
        photoUri TEXT,
        photoHash TEXT,
        cloudPhotoPath TEXT,
        storeId INTEGER REFERENCES stores(id),
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE tickets (
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
        voidReason TEXT,
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        syncedAt TEXT
      );

      CREATE TABLE ticket_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticketId TEXT NOT NULL,
        productId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        quantity REAL NOT NULL,
        unitPrice REAL NOT NULL,
        subtotal REAL NOT NULL,
        costPrice REAL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (ticketId) REFERENCES tickets(id),
        FOREIGN KEY (productId) REFERENCES products(id)
      );

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE sync_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_at TEXT,
        admin_device_id TEXT,
        last_catalog_hash TEXT,
        last_profile_hash TEXT
      );

      INSERT INTO sync_metadata (id) VALUES (1);
    `);

    console.log("✅ Worker database reset completed");
    currentVersion = 10;
  }

  // Ensure updatedAt triggers exist (idempotent)
  const triggerTables = [
    "stores",
    "products",
    "users",
    "tickets",
    "ticket_items",
    "product_price_tiers",
  ];
  for (const t of triggerTables) {
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

  await db.execAsync(`PRAGMA user_version = ${WORKER_DB_VERSION}`);
}
