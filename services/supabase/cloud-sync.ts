import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

import { ensureDataClient, hasDataConnection } from "./client";
import {
  cleanupOrphanedCloudPhotos,
  downloadPhotosFromCloud,
  uploadPhotosToCloud,
} from "./photo-sync";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CloudSyncProgress {
  phase: "checking" | "uploading" | "downloading" | "done" | "error";
  table?: string;
  current: number;
  total: number;
  message: string;
}

export interface CloudSyncResult {
  success: boolean;
  tablesUploaded?: number;
  rowsUploaded?: number;
  tablesDownloaded?: number;
  rowsDownloaded?: number;
  photosUploaded?: number;
  photosSkipped?: number;
  photosDownloaded?: number;
  error?: string;
}

type ProgressCallback = (p: CloudSyncProgress) => void;

// ── Column mappings (SQLite camelCase → Postgres snake_case) ─────────────────

interface TableMapping {
  sqliteTable: string;
  pgTable: string;
  columns: Record<string, string>; // sqlite → pg
  idType: "number" | "string";
}

const TABLE_MAPPINGS: TableMapping[] = [
  {
    sqliteTable: "stores",
    pgTable: "stores",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
      address: "address",
      phone: "phone",
      logoUri: "logo_uri",
      logoHash: "logo_hash",
      cloudLogoPath: "cloud_logo_path",
      color: "color",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "unit_categories",
    pgTable: "unit_categories",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
    },
  },
  {
    sqliteTable: "units",
    pgTable: "units",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
      symbol: "symbol",
      categoryId: "category_id",
      toBaseFactor: "to_base_factor",
    },
  },
  {
    sqliteTable: "products",
    pgTable: "products",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
      code: "code",
      pricePerBaseUnit: "price_per_base_unit",
      costPrice: "cost_price",
      salePrice: "sale_price",
      visible: "visible",
      baseUnitId: "base_unit_id",
      stockBaseQty: "stock_base_qty",
      saleMode: "sale_mode",
      photoUri: "photo_uri",
      photoHash: "photo_hash",
      cloudPhotoPath: "cloud_photo_path",
      details: "details",
      storeId: "store_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "users",
    pgTable: "users",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
      role: "role",
      pinHash: "pin_hash",
      photoUri: "photo_uri",
      photoHash: "photo_hash",
      cloudPhotoPath: "cloud_photo_path",
      storeId: "store_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "suppliers",
    pgTable: "suppliers",
    idType: "number",
    columns: {
      id: "id",
      name: "name",
      contactName: "contact_name",
      phone: "phone",
      email: "email",
      address: "address",
      notes: "notes",
      storeId: "store_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "tickets",
    pgTable: "tickets",
    idType: "string",
    columns: {
      id: "id",
      createdAt: "created_at",
      paymentMethod: "payment_method",
      total: "total",
      itemCount: "item_count",
      workerId: "worker_id",
      workerName: "worker_name",
      storeId: "store_id",
      status: "status",
      voidedAt: "voided_at",
      voidedBy: "voided_by",
      voidReason: "void_reason",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "ticket_items",
    pgTable: "ticket_items",
    idType: "number",
    columns: {
      id: "id",
      ticketId: "ticket_id",
      productId: "product_id",
      productName: "product_name",
      quantity: "quantity",
      unitPrice: "unit_price",
      subtotal: "subtotal",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "purchases",
    pgTable: "purchases",
    idType: "number",
    columns: {
      id: "id",
      supplierId: "supplier_id",
      supplierName: "supplier_name",
      notes: "notes",
      total: "total",
      transportCost: "transport_cost",
      itemCount: "item_count",
      storeId: "store_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "purchase_items",
    pgTable: "purchase_items",
    idType: "number",
    columns: {
      id: "id",
      purchaseId: "purchase_id",
      productId: "product_id",
      productName: "product_name",
      quantity: "quantity",
      unitCost: "unit_cost",
      subtotal: "subtotal",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  {
    sqliteTable: "expenses",
    pgTable: "expenses",
    idType: "number",
    columns: {
      id: "id",
      category: "category",
      description: "description",
      amount: "amount",
      date: "date",
      storeId: "store_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

function sqliteRowToPostgres(
  row: Record<string, unknown>,
  colMap: Record<string, string>,
  businessId: string,
): Record<string, unknown> {
  const pg: Record<string, unknown> = { business_id: businessId };
  for (const [sqlite, postgres] of Object.entries(colMap)) {
    if (sqlite in row) {
      pg[postgres] = row[sqlite];
    }
  }
  return pg;
}

function postgresRowToSqlite(
  row: Record<string, unknown>,
  colMap: Record<string, string>,
): Record<string, unknown> {
  const sqlite: Record<string, unknown> = {};
  const reverse: Record<string, string> = {};
  for (const [s, p] of Object.entries(colMap)) {
    reverse[p] = s;
  }
  for (const [pgCol, value] of Object.entries(row)) {
    if (pgCol === "business_id") continue;
    const sqliteCol = reverse[pgCol];
    if (sqliteCol) {
      sqlite[sqliteCol] = value;
    }
  }
  return sqlite;
}

// ── Cloud Sync Check ─────────────────────────────────────────────────────────

export async function isCloudSyncAvailable(): Promise<boolean> {
  return hasDataConnection();
}

// ── Upload (SQLite → Cloud) ──────────────────────────────────────────────────

export async function uploadToCloud(
  db: SQLiteDatabase,
  businessId: string,
  deviceId: string,
  onProgress?: ProgressCallback,
): Promise<CloudSyncResult> {
  onProgress?.({
    phase: "checking",
    current: 0,
    total: 0,
    message: "Conectando con la nube...",
  });

  const client = await ensureDataClient(businessId, deviceId);
  if (!client) {
    return {
      success: false,
      error:
        "No se pudieron obtener las credenciales de la nube. Verifica tu conexión a internet.",
    };
  }

  const totalTables = TABLE_MAPPINGS.length;
  let totalRows = 0;

  try {
    // Phase 0: Upload photos to Storage (updates photoHash/cloudPhotoPath in SQLite)
    onProgress?.({
      phase: "uploading",
      current: 0,
      total: 0,
      message: "Subiendo fotos a la nube...",
    });

    const photoResult = await uploadPhotosToCloud(
      db,
      businessId,
      deviceId,
      onProgress,
    );

    // Phase 1: Delete ALL cloud tables in reverse order (respect FKs)
    onProgress?.({
      phase: "uploading",
      current: 0,
      total: totalTables,
      message: "Limpiando datos anteriores en la nube...",
    });

    const reversedMappings = [...TABLE_MAPPINGS].reverse();
    for (const mapping of reversedMappings) {
      const { error: delError } = await client
        .from(mapping.pgTable)
        .delete()
        .eq("business_id", businessId);

      if (delError) {
        console.warn(
          `[CloudSync] Delete failed for ${mapping.pgTable}:`,
          delError.message,
        );
        return {
          success: false,
          error: `Error limpiando ${mapping.pgTable}: ${delError.message}`,
        };
      }
    }

    // Phase 2: Upload local data in forward order (respect FKs)
    for (let i = 0; i < TABLE_MAPPINGS.length; i++) {
      const mapping = TABLE_MAPPINGS[i];

      onProgress?.({
        phase: "uploading",
        table: mapping.sqliteTable,
        current: i + 1,
        total: totalTables,
        message: `Subiendo ${mapping.sqliteTable}...`,
      });

      // Read all rows from SQLite
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${mapping.sqliteTable}`,
      );

      if (rows.length === 0) continue;

      // Upload in batches
      for (let b = 0; b < rows.length; b += BATCH_SIZE) {
        const batch = rows.slice(b, b + BATCH_SIZE);
        const pgRows = batch.map((row) =>
          sqliteRowToPostgres(row, mapping.columns, businessId),
        );

        const { error: insertError } = await client
          .from(mapping.pgTable)
          .insert(pgRows);

        if (insertError) {
          console.warn(
            `[CloudSync] Insert failed for ${mapping.pgTable}:`,
            insertError.message,
          );
          return {
            success: false,
            error: `Error subiendo ${mapping.pgTable}: ${insertError.message}`,
          };
        }
      }

      totalRows += rows.length;
      console.log(
        `[CloudSync] Uploaded ${rows.length} rows to ${mapping.pgTable}`,
      );
    }

    // Phase 3: Cleanup orphaned photos in Storage
    await cleanupOrphanedCloudPhotos(db, businessId, deviceId);

    onProgress?.({
      phase: "done",
      current: totalTables,
      total: totalTables,
      message: "Respaldo completado",
    });

    return {
      success: true,
      tablesUploaded: totalTables,
      rowsUploaded: totalRows,
      photosUploaded: photoResult.uploaded,
      photosSkipped: photoResult.skipped,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[CloudSync] Upload error:", msg);
    return { success: false, error: msg };
  }
}

// ── Download (Cloud → SQLite) ────────────────────────────────────────────────

export async function downloadFromCloud(
  db: SQLiteDatabase,
  businessId: string,
  deviceId: string,
  onProgress?: ProgressCallback,
): Promise<CloudSyncResult> {
  onProgress?.({
    phase: "checking",
    current: 0,
    total: 0,
    message: "Conectando con la nube...",
  });

  const client = await ensureDataClient(businessId, deviceId);
  if (!client) {
    return {
      success: false,
      error:
        "No se pudieron obtener las credenciales de la nube. Verifica tu conexión a internet.",
    };
  }

  const totalTables = TABLE_MAPPINGS.length;
  let totalRows = 0;

  try {
    // Process in reverse order so dependent tables (items) are cleared first
    const reversedMappings = [...TABLE_MAPPINGS].reverse();

    // Phase 1: Clear local tables (reverse order to respect FKs)
    for (const mapping of reversedMappings) {
      await db.runAsync(`DELETE FROM ${mapping.sqliteTable}`);
    }

    // Phase 2: Download and insert (forward order to respect FKs)
    for (let i = 0; i < TABLE_MAPPINGS.length; i++) {
      const mapping = TABLE_MAPPINGS[i];

      onProgress?.({
        phase: "downloading",
        table: mapping.sqliteTable,
        current: i + 1,
        total: totalTables,
        message: `Descargando ${mapping.sqliteTable}...`,
      });

      // Fetch all rows for this business
      const allRows: Record<string, unknown>[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await client
          .from(mapping.pgTable)
          .select("*")
          .eq("business_id", businessId)
          .range(from, from + pageSize - 1);

        if (error) {
          return {
            success: false,
            error: `Error descargando ${mapping.pgTable}: ${error.message}`,
          };
        }

        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (allRows.length === 0) continue;

      // Convert to SQLite format and insert
      const sqliteCols = Object.keys(mapping.columns);
      const placeholders = sqliteCols.map(() => "?").join(", ");
      const insertSql = `INSERT OR REPLACE INTO ${
        mapping.sqliteTable
      } (${sqliteCols.join(", ")}) VALUES (${placeholders})`;

      for (const pgRow of allRows) {
        const sqliteRow = postgresRowToSqlite(
          pgRow as Record<string, unknown>,
          mapping.columns,
        );
        const values = sqliteCols.map(
          (col) => (sqliteRow[col] ?? null) as SQLiteBindValue,
        );
        await db.runAsync(insertSql, values);
      }

      totalRows += allRows.length;
      console.log(
        `[CloudSync] Downloaded ${allRows.length} rows from ${mapping.pgTable}`,
      );
    }

    // Phase 3: Download photos from Storage (uses cloudPhotoPath from downloaded rows)
    onProgress?.({
      phase: "downloading",
      current: 0,
      total: 0,
      message: "Descargando fotos de la nube...",
    });

    const photoResult = await downloadPhotosFromCloud(
      db,
      businessId,
      deviceId,
      onProgress,
    );

    onProgress?.({
      phase: "done",
      current: totalTables,
      total: totalTables,
      message: "Restauración completada",
    });

    return {
      success: true,
      tablesDownloaded: totalTables,
      rowsDownloaded: totalRows,
      photosDownloaded: photoResult.downloaded,
      photosSkipped: photoResult.skipped,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[CloudSync] Download error:", msg);
    return { success: false, error: msg };
  }
}
