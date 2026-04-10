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
      code: p.code,
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

/**
 * Phase 2b: Filter a full catalog payload to only include rows changed since lastSyncAt.
 * Also includes full ID lists so the worker can detect deletions.
 * Returns a delta payload that is much smaller than the full catalog.
 */
export function filterCatalogDelta(
  fullPayload: SyncCatalogData,
  lastSyncAt: string,
): SyncCatalogData {
  const allProductIds = (fullPayload.products as any[]).map(
    (p: any) => p.id as number,
  );
  const allStoreIds = (fullPayload.stores as any[]).map(
    (s: any) => s.id as number,
  );
  const allWorkerIds = (fullPayload.workers as any[]).map(
    (w: any) => w.id as number,
  );

  const deltaProducts = (fullPayload.products as any[]).filter(
    (p: any) => !p.updatedAt || p.updatedAt > lastSyncAt,
  );
  const deltaStores = (fullPayload.stores as any[]).filter(
    (s: any) => !s.updatedAt || s.updatedAt > lastSyncAt,
  );
  const deltaWorkers = (fullPayload.workers as any[]).filter(
    (w: any) => !w.updatedAt || w.updatedAt > lastSyncAt,
  );

  console.log(
    `[SyncService] Delta filter (since ${lastSyncAt}): products ${deltaProducts.length}/${allProductIds.length}, stores ${deltaStores.length}/${allStoreIds.length}, workers ${deltaWorkers.length}/${allWorkerIds.length}`,
  );

  return {
    products: deltaProducts,
    stores: deltaStores,
    workers: deltaWorkers,
    units: fullPayload.units, // always send full (small + rarely changes)
    unitCategories: fullPayload.unitCategories,
    isDelta: true,
    allProductIds,
    allStoreIds,
    allWorkerIds,
  };
}

/** Detailed summary of what was received from a Worker */
export interface TicketImportSummary {
  /** Number of new tickets imported */
  imported: number;
  /** Number of tickets that were duplicates (already existed) */
  duplicates: number;
  /** Total tickets received in the payload */
  totalReceived: number;
  /** Sum of totals of imported tickets */
  totalAmount: number;
  /** Number of items across all imported tickets */
  totalItems: number;
  /** Workers whose PIN was updated */
  pinUpdates: string[];
  /** Workers whose photo was updated */
  photoUpdates: string[];
}

/** Admin applies tickets received from Worker (dedup by UUID) */
export async function applyReceivedTickets(
  db: SQLiteDatabase,
  data: SyncTicketsData,
): Promise<TicketImportSummary> {
  const summary: TicketImportSummary = {
    imported: 0,
    duplicates: 0,
    totalReceived: (data.tickets as any[]).length,
    totalAmount: 0,
    totalItems: 0,
    pinUpdates: [],
    photoUpdates: [],
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const ticket of data.tickets as any[]) {
      // Dedup by UUID — skip if ticket with this id already exists
      const exists = await tx.getFirstAsync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM tickets WHERE id = ?",
        [ticket.id],
      );
      if (exists && exists.cnt > 0) {
        summary.duplicates++;
        continue;
      }

      await tx.runAsync(
        `INSERT INTO tickets (id, total, itemCount, paymentMethod, createdAt, workerId, workerName, storeId, status, voidedAt, voidedBy, voidReason, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ticket.updatedAt ?? ticket.createdAt,
        ],
      );

      summary.totalAmount += ticket.total ?? 0;
      summary.totalItems += ticket.itemCount ?? 0;

      // Insert ticket items for this ticket
      const items = (data.ticketItems as any[]).filter(
        (ti) => ti.ticketId === ticket.id,
      );
      for (const item of items) {
        await tx.runAsync(
          `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticket.id,
            item.productId,
            item.productName,
            item.quantity,
            item.unitPrice,
            item.subtotal,
            item.createdAt ?? ticket.createdAt,
            item.updatedAt ?? ticket.createdAt,
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
      summary.imported++;
    }

    // Apply worker profile updates (PIN, photo)
    if (data.workerUpdates) {
      for (const upd of data.workerUpdates) {
        // Resolve worker name for the summary
        const worker = await tx.getFirstAsync<{ name: string }>(
          "SELECT name FROM users WHERE id = ?",
          [upd.id],
        );
        const workerName = worker?.name ?? `Worker #${upd.id}`;

        if (upd.pinHash) {
          await tx.runAsync(
            "UPDATE users SET pinHash = ? WHERE id = ? AND role = 'WORKER'",
            [upd.pinHash, upd.id],
          );
          summary.pinUpdates.push(workerName);
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
          summary.photoUpdates.push(workerName);
          console.log(
            `[SyncService] Updated photo for worker ${upd.id}: ${
              newUri ? "set" : "cleared"
            }`,
          );
        }
      }
    }
  });

  return summary;
}

// ── Worker side: apply catalog from Admin ───────────────────────────────────

/** Summary of what changed after applying a catalog */
export interface CatalogChangeSummary {
  newProducts: number;
  updatedProducts: number;
  deletedProducts: number;
  priceChanges: { name: string; oldPrice: number; newPrice: number }[];
  newStores: number;
  deletedStores: number;
  newWorkers: number;
  updatedWorkers: number;
  deletedWorkers: number;
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
    deletedProducts: 0,
    priceChanges: [],
    newStores: 0,
    deletedStores: 0,
    newWorkers: 0,
    updatedWorkers: 0,
    deletedWorkers: 0,
    totalProducts:
      data.allProductIds?.length ?? (data.products as any[]).length,
    totalStores: data.allStoreIds?.length ?? (data.stores as any[]).length,
    totalWorkers: data.allWorkerIds?.length ?? (data.workers as any[]).length,
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
        "INSERT OR REPLACE INTO stores (id, name, address, phone, logoUri, logoHash, cloudLogoPath, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          store.id,
          store.name,
          store.address,
          store.phone,
          store.logoUri,
          store.logoHash ?? null,
          store.cloudLogoPath ?? null,
          store.color,
          store.createdAt,
          store.updatedAt ?? store.createdAt,
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
          "INSERT INTO users (id, name, role, pinHash, photoUri, photoHash, cloudPhotoPath, storeId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            worker.id,
            worker.name,
            worker.role,
            worker.pinHash,
            remappedPhoto,
            worker.photoHash ?? null,
            worker.cloudPhotoPath ?? null,
            worker.storeId,
            worker.createdAt,
            worker.updatedAt ?? worker.createdAt,
          ],
        );
      } else {
        summary.updatedWorkers++;
        // Keep worker's local PIN (they may have changed it)
        // Keep worker's local photo if they changed it (admin photo wins if worker hasn't set one)
        const keepPin = existing.pinHash;
        const keepPhoto = existing.photoUri ?? remappedPhoto;
        await tx.runAsync(
          "UPDATE users SET name = ?, role = ?, pinHash = ?, photoUri = ?, photoHash = ?, cloudPhotoPath = ?, storeId = ?, createdAt = ?, updatedAt = ? WHERE id = ?",
          [
            worker.name,
            worker.role,
            keepPin,
            keepPhoto,
            worker.photoHash ?? null,
            worker.cloudPhotoPath ?? null,
            worker.storeId,
            worker.createdAt,
            worker.updatedAt ?? worker.createdAt,
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
         (id, name, code, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode, photoUri, photoHash, cloudPhotoPath, storeId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.name,
          product.code,
          product.pricePerBaseUnit,
          product.costPrice,
          product.salePrice,
          product.visible,
          product.baseUnitId,
          product.stockBaseQty,
          product.saleMode,
          localPhotoUri,
          product.photoHash ?? null,
          product.cloudPhotoPath ?? null,
          product.storeId,
          product.createdAt ?? null,
          product.updatedAt ?? product.createdAt ?? null,
        ],
      );
    }

    // 6. Delete items that admin removed — admin is source of truth
    // In delta mode, use allXxxIds (full ID lists); in full mode, use received data IDs

    // Delete products not in admin's catalog
    const adminProductIds: number[] =
      data.allProductIds ?? (data.products as any[]).map((p: any) => p.id);
    if (adminProductIds.length > 0) {
      const phProducts = adminProductIds.map(() => "?").join(",");
      const delProducts = await tx.runAsync(
        `DELETE FROM products WHERE id NOT IN (${phProducts})`,
        adminProductIds,
      );
      summary.deletedProducts = delProducts.changes;
    } else {
      const delProducts = await tx.runAsync("DELETE FROM products");
      summary.deletedProducts = delProducts.changes;
    }

    // Delete workers not in admin's catalog
    const adminWorkerIds: number[] =
      data.allWorkerIds ?? (data.workers as any[]).map((w: any) => w.id);
    if (adminWorkerIds.length > 0) {
      const phWorkers = adminWorkerIds.map(() => "?").join(",");
      const delWorkers = await tx.runAsync(
        `DELETE FROM users WHERE role = 'WORKER' AND id NOT IN (${phWorkers})`,
        adminWorkerIds,
      );
      summary.deletedWorkers = delWorkers.changes;
    } else {
      const delWorkers = await tx.runAsync(
        "DELETE FROM users WHERE role = 'WORKER'",
      );
      summary.deletedWorkers = delWorkers.changes;
    }

    // Delete stores not in admin's catalog
    const adminStoreIds: number[] =
      data.allStoreIds ?? (data.stores as any[]).map((s: any) => s.id);
    if (adminStoreIds.length > 0) {
      const phStores = adminStoreIds.map(() => "?").join(",");
      const delStores = await tx.runAsync(
        `DELETE FROM stores WHERE id NOT IN (${phStores})`,
        adminStoreIds,
      );
      summary.deletedStores = delStores.changes;
    } else {
      const delStores = await tx.runAsync("DELETE FROM stores");
      summary.deletedStores = delStores.changes;
    }

    // Delete unit categories not in admin's catalog
    const adminCatIds = (data.unitCategories as any[]).map((c: any) => c.id);
    if (adminCatIds.length > 0) {
      const phCats = adminCatIds.map(() => "?").join(",");
      await tx.runAsync(
        `DELETE FROM unit_categories WHERE id NOT IN (${phCats})`,
        adminCatIds,
      );
    } else {
      await tx.runAsync("DELETE FROM unit_categories");
    }

    // Delete units not in admin's catalog
    const adminUnitIds = (data.units as any[]).map((u: any) => u.id);
    if (adminUnitIds.length > 0) {
      const phUnits = adminUnitIds.map(() => "?").join(",");
      await tx.runAsync(
        `DELETE FROM units WHERE id NOT IN (${phUnits})`,
        adminUnitIds,
      );
    } else {
      await tx.runAsync("DELETE FROM units");
    }
  });

  // Update sync metadata
  await db.runAsync(
    "UPDATE sync_metadata SET last_sync_at = datetime('now','localtime') WHERE id = 1",
  );

  return summary;
}

/** Worker prepares tickets to send to Admin (unsynced only) */
export async function prepareTicketsPayload(
  db: SQLiteDatabase,
  _since?: string | null,
): Promise<SyncTicketsData> {
  // Only send tickets that haven't been synced yet
  const tickets = await db.getAllAsync(
    "SELECT * FROM tickets WHERE syncedAt IS NULL ORDER BY id",
  );
  let ticketItems: unknown[];
  const ticketIds = (tickets as any[]).map((t: any) => t.id);
  if (ticketIds.length > 0) {
    const placeholders = ticketIds.map(() => "?").join(",");
    ticketItems = await db.getAllAsync(
      `SELECT * FROM ticket_items WHERE ticketId IN (${placeholders}) ORDER BY id`,
      ticketIds,
    );
  } else {
    ticketItems = [];
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
): Promise<{
  needsCatalog: boolean;
  neededPhotos: string[];
  lastSyncAt: string | null;
}> {
  // Check if catalog data changed
  const meta = await db.getFirstAsync<{
    last_catalog_hash: string | null;
    last_sync_at: string | null;
  }>("SELECT last_catalog_hash, last_sync_at FROM sync_metadata WHERE id = 1");
  const needsCatalog = meta?.last_catalog_hash !== catalogHash;
  const lastSyncAt = meta?.last_sync_at ?? null;

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
    }, lastSyncAt=${lastSyncAt ?? "none"}`,
  );

  return { needsCatalog, neededPhotos, lastSyncAt };
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

/** Worker: mark all unsynced tickets as synced (after admin confirmed receipt) */
export async function markTicketsSynced(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(
    "UPDATE tickets SET syncedAt = datetime('now','localtime') WHERE syncedAt IS NULL",
  );
  return result.changes;
}
