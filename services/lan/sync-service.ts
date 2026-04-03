import type { SQLiteDatabase } from "expo-sqlite";
import type { SyncCatalogData, SyncTicketsData } from "./protocol";

// ── Admin side: prepare data to send to Worker ──────────────────────────────

export async function prepareCatalogPayload(
  db: SQLiteDatabase,
): Promise<SyncCatalogData> {
  const [
    stores,
    workers,
    products,
    units,
    unitCategories,
    tickets,
    ticketItems,
  ] = await Promise.all([
    db.getAllAsync("SELECT * FROM stores ORDER BY id"),
    db.getAllAsync(
      "SELECT id, name, role, pinHash, photoUri, storeId, createdAt FROM users WHERE role = 'WORKER' ORDER BY id",
    ),
    db.getAllAsync("SELECT * FROM products ORDER BY id"),
    db.getAllAsync("SELECT * FROM units ORDER BY id"),
    db.getAllAsync("SELECT * FROM unit_categories ORDER BY id"),
    db.getAllAsync("SELECT * FROM tickets ORDER BY id"),
    db.getAllAsync("SELECT * FROM ticket_items ORDER BY id"),
  ]);

  return {
    stores,
    workers,
    products,
    units,
    unitCategories,
    tickets,
    ticketItems,
  };
}

/** Admin applies tickets received from Worker (dedup by UUID) */
export async function applyReceivedTickets(
  db: SQLiteDatabase,
  data: SyncTicketsData,
): Promise<number> {
  let imported = 0;

  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const ticket of data.tickets as any[]) {
      // Dedup by UUID — skip if ticket with this id already exists
      const exists = await tx.getFirstAsync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM tickets WHERE id = ?",
        [ticket.id],
      );
      if (exists && exists.cnt > 0) continue;

      await tx.runAsync(
        `INSERT INTO tickets (id, total, itemCount, paymentMethod, createdAt, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket.id,
          ticket.total,
          ticket.itemCount,
          ticket.paymentMethod,
          ticket.createdAt,
          ticket.workerId,
          ticket.workerName,
          ticket.storeId,
          ticket.status ?? "ACTIVE",
          ticket.voidedAt ?? null,
          ticket.voidedBy ?? null,
          ticket.voidReason ?? null,
        ],
      );

      // Insert ticket items for this ticket
      const items = (data.ticketItems as any[]).filter(
        (ti) => ti.ticketId === ticket.id,
      );
      for (const item of items) {
        await tx.runAsync(
          `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            ticket.id,
            item.productId,
            item.productName,
            item.quantity,
            item.unitPrice,
            item.subtotal,
          ],
        );
      }
      imported++;
    }
  });

  return imported;
}

// ── Worker side: apply catalog from Admin ───────────────────────────────────

/** Summary of what changed after applying a catalog */
export interface CatalogChangeSummary {
  newProducts: number;
  updatedProducts: number;
  priceChanges: { name: string; oldPrice: number; newPrice: number }[];
  newStores: number;
  newWorkers: number;
  updatedWorkers: number;
  totalProducts: number;
  totalStores: number;
  totalWorkers: number;
  ticketsImported: number;
}

export async function applyReceivedCatalog(
  db: SQLiteDatabase,
  data: SyncCatalogData,
): Promise<CatalogChangeSummary> {
  const summary: CatalogChangeSummary = {
    newProducts: 0,
    updatedProducts: 0,
    priceChanges: [],
    newStores: 0,
    newWorkers: 0,
    updatedWorkers: 0,
    totalProducts: (data.products as any[]).length,
    totalStores: (data.stores as any[]).length,
    totalWorkers: (data.workers as any[]).length,
    ticketsImported: 0,
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    // 1. Upsert unit categories
    for (const cat of data.unitCategories as any[]) {
      await tx.runAsync(
        "INSERT OR REPLACE INTO unit_categories (id, name) VALUES (?, ?)",
        [cat.id, cat.name],
      );
    }

    // 2. Upsert units
    for (const unit of data.units as any[]) {
      await tx.runAsync(
        "INSERT OR REPLACE INTO units (id, name, symbol, categoryId, toBaseFactor) VALUES (?, ?, ?, ?, ?)",
        [unit.id, unit.name, unit.symbol, unit.categoryId, unit.toBaseFactor],
      );
    }

    // 3. Upsert stores
    for (const store of data.stores as any[]) {
      const existing = await tx.getFirstAsync<{ id: number }>(
        "SELECT id FROM stores WHERE id = ?",
        [store.id],
      );
      if (!existing) summary.newStores++;
      await tx.runAsync(
        "INSERT OR REPLACE INTO stores (id, name, address, phone, logoUri, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          store.id,
          store.name,
          store.address,
          store.phone,
          store.logoUri,
          store.color,
          store.createdAt,
        ],
      );
    }

    // 4. Upsert workers
    for (const worker of data.workers as any[]) {
      const existing = await tx.getFirstAsync<{ id: number }>(
        "SELECT id FROM users WHERE id = ?",
        [worker.id],
      );
      if (!existing) summary.newWorkers++;
      else summary.updatedWorkers++;
      await tx.runAsync(
        "INSERT OR REPLACE INTO users (id, name, role, pinHash, photoUri, storeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          worker.id,
          worker.name,
          worker.role,
          worker.pinHash,
          worker.photoUri,
          worker.storeId,
          worker.createdAt,
        ],
      );
    }

    // 5. Upsert products (track price changes & new products)
    for (const product of data.products as any[]) {
      const existing = await tx.getFirstAsync<{
        id: number;
        salePrice: number | null;
        pricePerBaseUnit: number;
      }>("SELECT id, salePrice, pricePerBaseUnit FROM products WHERE id = ?", [
        product.id,
      ]);
      if (!existing) {
        summary.newProducts++;
      } else {
        summary.updatedProducts++;
        const oldPrice = existing.salePrice ?? existing.pricePerBaseUnit;
        const newPrice = product.salePrice ?? product.pricePerBaseUnit;
        if (oldPrice !== newPrice) {
          summary.priceChanges.push({
            name: product.name,
            oldPrice,
            newPrice,
          });
        }
      }
      await tx.runAsync(
        `INSERT OR REPLACE INTO products
         (id, name, barcode, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode, photoUri, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.name,
          product.barcode,
          product.pricePerBaseUnit,
          product.costPrice,
          product.salePrice,
          product.visible,
          product.baseUnitId,
          product.stockBaseQty,
          product.saleMode,
          product.photoUri,
          product.storeId,
        ],
      );
    }
  });

  // 6. Import tickets from admin (dedup by UUID)
  if (data.tickets && (data.tickets as any[]).length > 0) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const ticket of data.tickets as any[]) {
        const exists = await tx.getFirstAsync<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM tickets WHERE id = ?",
          [ticket.id],
        );
        if (exists && exists.cnt > 0) continue;

        await tx.runAsync(
          `INSERT INTO tickets (id, total, itemCount, paymentMethod, createdAt, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticket.id,
            ticket.total,
            ticket.itemCount,
            ticket.paymentMethod,
            ticket.createdAt,
            ticket.workerId,
            ticket.workerName,
            ticket.storeId,
            ticket.status ?? "ACTIVE",
            ticket.voidedAt ?? null,
            ticket.voidedBy ?? null,
            ticket.voidReason ?? null,
          ],
        );

        const items = (data.ticketItems as any[]).filter(
          (ti) => String(ti.ticketId) === String(ticket.id),
        );
        for (const item of items) {
          await tx.runAsync(
            `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              ticket.id,
              item.productId,
              item.productName,
              item.quantity,
              item.unitPrice,
              item.subtotal,
            ],
          );
        }
        summary.ticketsImported++;
      }
    });
  }

  // Update sync metadata
  await db.runAsync(
    "UPDATE sync_metadata SET last_sync_at = datetime('now','localtime') WHERE id = 1",
  );

  return summary;
}

/** Worker prepares tickets to send to Admin (since last sync) */
export async function prepareTicketsPayload(
  db: SQLiteDatabase,
  since: string | null,
): Promise<SyncTicketsData> {
  let tickets: unknown[];
  let ticketItems: unknown[];

  if (since) {
    tickets = await db.getAllAsync(
      "SELECT * FROM tickets WHERE createdAt > ? ORDER BY id",
      [since],
    );
    const ticketIds = (tickets as any[]).map((t) => t.id);
    if (ticketIds.length > 0) {
      const placeholders = ticketIds.map(() => "?").join(",");
      ticketItems = await db.getAllAsync(
        `SELECT * FROM ticket_items WHERE ticketId IN (${placeholders}) ORDER BY id`,
        ticketIds,
      );
    } else {
      ticketItems = [];
    }
  } else {
    tickets = await db.getAllAsync("SELECT * FROM tickets ORDER BY id");
    ticketItems = await db.getAllAsync(
      "SELECT * FROM ticket_items ORDER BY id",
    );
  }

  return { tickets, ticketItems };
}

/** Get the last sync timestamp from Worker DB */
export async function getLastSyncAt(
  db: SQLiteDatabase,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_sync_at: string | null }>(
    "SELECT last_sync_at FROM sync_metadata WHERE id = 1",
  );
  return row?.last_sync_at ?? null;
}
