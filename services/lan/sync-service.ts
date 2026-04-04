import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import type { SyncCatalogData, SyncTicketsData } from "./protocol";

// ── Photo helpers ───────────────────────────────────────────────────────────

const PHOTOS_DIR = new Directory(Paths.document, "product-photos");

/** Read a local photo file as base64. Returns null if missing. */
async function readPhotoBase64(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return await file.base64();
  } catch {
    return null;
  }
}

/** Get MD5 of a local photo file. Returns null if missing. */
function getPhotoMd5(uri: string): string | null {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return file.md5;
  } catch {
    return null;
  }
}

/**
 * Build a photo manifest: { origUri → md5 } for all non-null photoUris.
 */
function buildPhotoManifest(
  items: { photoUri?: string | null }[],
): Record<string, string> {
  const manifest: Record<string, string> = {};
  for (const item of items) {
    const uri = item.photoUri;
    if (!uri || manifest[uri]) continue;
    const md5 = getPhotoMd5(uri);
    if (md5) manifest[uri] = md5;
  }
  return manifest;
}

/**
 * Collect base64 data only for the requested photoUris.
 */
async function collectPhotosSelective(
  neededUris: string[],
): Promise<Record<string, string>> {
  const photos: Record<string, string> = {};
  for (const uri of neededUris) {
    if (photos[uri]) continue;
    const b64 = await readPhotoBase64(uri);
    if (b64) photos[uri] = b64;
  }
  return photos;
}

/**
 * Save base64 photos to disk and return a map: originalUri → newLocalUri.
 * Skips photos that already exist locally.
 */
function savePhotos(photos: Record<string, string>): Record<string, string> {
  if (!PHOTOS_DIR.exists) PHOTOS_DIR.create();
  const uriMap: Record<string, string> = {};
  for (const [origUri, b64] of Object.entries(photos)) {
    // If the file already exists locally at origUri, keep it
    try {
      const existing = new File(origUri);
      if (existing.exists) {
        uriMap[origUri] = origUri;
        continue;
      }
    } catch {
      // ignore — probably a different device's path
    }
    // Save to a new local file
    const filename = `photo_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}.jpg`;
    const dest = new File(PHOTOS_DIR, filename);
    dest.create();
    dest.write(b64, { encoding: "base64" });
    uriMap[origUri] = dest.uri;
  }
  return uriMap;
}

// ── Hashing helpers ─────────────────────────────────────────────────────────

/** Compute a fast hash of catalog data (without photos). */
export async function computeCatalogHash(data: {
  stores: unknown[];
  workers: unknown[];
  products: unknown[];
  units: unknown[];
  unitCategories: unknown[];
}): Promise<string> {
  // Strip volatile fields: photos handled separately via manifest
  const stripped = {
    stores: data.stores,
    workers: (data.workers as any[]).map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      storeId: w.storeId,
    })),
    products: (data.products as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      pricePerBaseUnit: p.pricePerBaseUnit,
      costPrice: p.costPrice,
      salePrice: p.salePrice,
      visible: p.visible,
      baseUnitId: p.baseUnitId,
      stockBaseQty: p.stockBaseQty,
      saleMode: p.saleMode,
      storeId: p.storeId,
    })),
    units: data.units,
    unitCategories: data.unitCategories,
  };
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    JSON.stringify(stripped),
  );
}

/**
 * Compute a hash of worker profile data (PIN + photo md5).
 * Used to detect if worker profile changed since last sync.
 */
async function computeProfileHash(
  workers: { id: number; pinHash: string; photoUri: string | null }[],
): Promise<string> {
  const data = workers.map((w) => ({
    id: w.id,
    pinHash: w.pinHash,
    photoMd5: w.photoUri ? getPhotoMd5(w.photoUri) : null,
  }));
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    JSON.stringify(data),
  );
}

// ── Admin side: prepare data to send to Worker ──────────────────────────────

export interface CatalogPreparation {
  payload: SyncCatalogData;
  catalogHash: string;
  photoManifest: Record<string, string>;
}

/**
 * Phase 1: Prepare catalog metadata (hash + photo manifest) — lightweight.
 * Called before sync_prepare so admin can send hash to worker.
 */
export async function prepareCatalogMeta(
  db: SQLiteDatabase,
): Promise<CatalogPreparation> {
  const [stores, workers, products, units, unitCategories] = await Promise.all([
    db.getAllAsync("SELECT * FROM stores ORDER BY id"),
    db.getAllAsync(
      "SELECT id, name, role, pinHash, photoUri, storeId, createdAt FROM users WHERE role = 'WORKER' ORDER BY id",
    ),
    db.getAllAsync("SELECT * FROM products ORDER BY id"),
    db.getAllAsync("SELECT * FROM units ORDER BY id"),
    db.getAllAsync("SELECT * FROM unit_categories ORDER BY id"),
  ]);

  const payload: SyncCatalogData = {
    stores,
    workers,
    products,
    units,
    unitCategories,
  };

  const catalogHash = await computeCatalogHash(payload);
  const photoManifest = buildPhotoManifest([
    ...(products as any[]),
    ...(workers as any[]),
  ]);

  return { payload, catalogHash, photoManifest };
}

/**
 * Phase 2: Attach only the requested photos to the catalog payload.
 * Called after worker responds with neededPhotos.
 */
export async function attachPhotos(
  payload: SyncCatalogData,
  neededPhotos: string[],
): Promise<SyncCatalogData> {
  if (neededPhotos.length === 0) return { ...payload, photos: {} };
  const photos = await collectPhotosSelective(neededPhotos);
  return { ...payload, photos };
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

        // Decrease admin stock to reflect the worker's sale
        if (ticket.status !== "VOIDED") {
          await tx.runAsync(
            `UPDATE products SET stockBaseQty = stockBaseQty - ? WHERE id = ?`,
            [item.quantity, item.productId],
          );
        }
      }
      imported++;
    }

    // Apply worker profile updates (PIN, photo)
    if (data.workerUpdates) {
      for (const upd of data.workerUpdates) {
        if (upd.pinHash) {
          await tx.runAsync(
            "UPDATE users SET pinHash = ? WHERE id = ? AND role = 'WORKER'",
            [upd.pinHash, upd.id],
          );
          console.log(`[SyncService] Updated pinHash for worker ${upd.id}`);
        }
        if (upd.photoBase64 !== undefined) {
          // Photo was sent as base64 inside workerUpdates — save it
          let newUri: string | null = null;
          if (upd.photoBase64) {
            if (!PHOTOS_DIR.exists) PHOTOS_DIR.create();
            const filename = `worker_${upd.id}_${Date.now()}.jpg`;
            const dest = new File(PHOTOS_DIR, filename);
            dest.create();
            dest.write(upd.photoBase64, { encoding: "base64" });
            newUri = dest.uri;
          }
          await tx.runAsync(
            "UPDATE users SET photoUri = ? WHERE id = ? AND role = 'WORKER'",
            [newUri, upd.id],
          );
          console.log(
            `[SyncService] Updated photo for worker ${upd.id}: ${
              newUri ? "set" : "cleared"
            }`,
          );
        }
      }
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
  };

  // Save received photos to disk and get localUri map
  const photoMap = data.photos ? savePhotos(data.photos) : {};

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

    // 4. Upsert workers — preserve local PIN and photo if worker modified them
    for (const worker of data.workers as any[]) {
      const existing = await tx.getFirstAsync<{
        id: number;
        pinHash: string;
        photoUri: string | null;
      }>("SELECT id, pinHash, photoUri FROM users WHERE id = ?", [worker.id]);

      // Remap photo from admin or keep worker's local photo
      const remappedPhoto = worker.photoUri
        ? photoMap[worker.photoUri] ?? worker.photoUri
        : null;

      if (!existing) {
        summary.newWorkers++;
        await tx.runAsync(
          "INSERT INTO users (id, name, role, pinHash, photoUri, storeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            worker.id,
            worker.name,
            worker.role,
            worker.pinHash,
            remappedPhoto,
            worker.storeId,
            worker.createdAt,
          ],
        );
      } else {
        summary.updatedWorkers++;
        // Keep worker's local PIN (they may have changed it)
        // Keep worker's local photo if they changed it (admin photo wins if worker hasn't set one)
        const keepPin = existing.pinHash;
        const keepPhoto = existing.photoUri ?? remappedPhoto;
        await tx.runAsync(
          "UPDATE users SET name = ?, role = ?, pinHash = ?, photoUri = ?, storeId = ?, createdAt = ? WHERE id = ?",
          [
            worker.name,
            worker.role,
            keepPin,
            keepPhoto,
            worker.storeId,
            worker.createdAt,
            worker.id,
          ],
        );
      }
    }

    // 5. Upsert products (track price changes & new products)
    for (const product of data.products as any[]) {
      // Remap product photo URI
      const localPhotoUri = product.photoUri
        ? photoMap[product.photoUri] ?? product.photoUri
        : null;

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
          localPhotoUri,
          product.storeId,
        ],
      );
    }
  });

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

  // Only include worker profile updates if they changed since last sync
  const workers = await db.getAllAsync<{
    id: number;
    pinHash: string;
    photoUri: string | null;
  }>(
    "SELECT id, pinHash, photoUri FROM users WHERE role = 'WORKER' ORDER BY id",
  );

  const currentProfileHash = await computeProfileHash(workers);
  const meta = await db.getFirstAsync<{ last_profile_hash: string | null }>(
    "SELECT last_profile_hash FROM sync_metadata WHERE id = 1",
  );
  const lastProfileHash = meta?.last_profile_hash ?? null;

  let workerUpdates: SyncTicketsData["workerUpdates"] | undefined;

  if (currentProfileHash !== lastProfileHash) {
    console.log(
      `[SyncService] Profile changed (${lastProfileHash?.slice(
        0,
        8,
      )} → ${currentProfileHash.slice(0, 8)}), including workerUpdates`,
    );
    workerUpdates = [];
    for (const w of workers) {
      const update: NonNullable<SyncTicketsData["workerUpdates"]>[number] = {
        id: w.id,
        pinHash: w.pinHash,
      };
      if (w.photoUri) {
        const b64 = await readPhotoBase64(w.photoUri);
        if (b64) {
          update.photoBase64 = b64;
        }
      } else {
        update.photoBase64 = null;
      }
      workerUpdates.push(update);
    }
    // Save hash so we don't re-send next time
    await db.runAsync(
      "UPDATE sync_metadata SET last_profile_hash = ? WHERE id = 1",
      [currentProfileHash],
    );
  } else {
    console.log(
      `[SyncService] Profile unchanged (${currentProfileHash.slice(
        0,
        8,
      )}), skipping workerUpdates`,
    );
  }

  return { tickets, ticketItems, workerUpdates };
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

/**
 * Worker: compare incoming catalog hash + photo manifest against local state.
 * Returns what the worker actually needs.
 */
export async function checkCatalogNeeds(
  db: SQLiteDatabase,
  catalogHash: string,
  photoManifest: Record<string, string>,
): Promise<{ needsCatalog: boolean; neededPhotos: string[] }> {
  // Check if catalog data changed
  const meta = await db.getFirstAsync<{ last_catalog_hash: string | null }>(
    "SELECT last_catalog_hash FROM sync_metadata WHERE id = 1",
  );
  const needsCatalog = meta?.last_catalog_hash !== catalogHash;

  // Check which photos we're missing (by md5 — we might have the file under a different name)
  const neededPhotos: string[] = [];

  // Build a set of md5s we already have locally
  const localMd5s = new Set<string>();
  if (PHOTOS_DIR.exists) {
    for (const entry of PHOTOS_DIR.list()) {
      if (entry instanceof File) {
        const md5 = entry.md5;
        if (md5) localMd5s.add(md5);
      }
    }
  }

  for (const [origUri, md5] of Object.entries(photoManifest)) {
    if (!localMd5s.has(md5)) {
      neededPhotos.push(origUri);
    }
  }

  console.log(
    `[SyncService] checkCatalogNeeds: needsCatalog=${needsCatalog} (local=${
      meta?.last_catalog_hash?.slice(0, 8) ?? "none"
    } remote=${catalogHash.slice(0, 8)}), neededPhotos=${neededPhotos.length}/${
      Object.keys(photoManifest).length
    }`,
  );

  return { needsCatalog, neededPhotos };
}

/** Worker: save the catalog hash after successful apply */
export async function saveCatalogHash(
  db: SQLiteDatabase,
  catalogHash: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE sync_metadata SET last_catalog_hash = ? WHERE id = 1",
    [catalogHash],
  );
}

/** Worker: delete all tickets and their items (after admin confirmed receipt) */
export async function deleteAllWorkerTickets(
  db: SQLiteDatabase,
): Promise<number> {
  const countRow = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM tickets",
  );
  const count = countRow?.cnt ?? 0;

  if (count > 0) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("DELETE FROM ticket_items");
      await tx.runAsync("DELETE FROM tickets");
    });
  }

  return count;
}
