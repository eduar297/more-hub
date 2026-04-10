import type { SupabaseClient } from "@supabase/supabase-js";
import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { ensureDataClient } from "./client";
import type { CloudSyncProgress } from "./cloud-sync";
import { compressForCloud } from "./photo-compress";

// ── Types ────────────────────────────────────────────────────────────────────

type ProgressCallback = (p: CloudSyncProgress) => void;

interface PhotoRow {
  id: number;
  photoUri: string | null;
  photoHash: string | null;
  cloudPhotoPath: string | null;
}

interface LogoRow {
  id: number;
  logoUri: string | null;
  logoHash: string | null;
  cloudLogoPath: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHOTOS_DIR = new Directory(Paths.document, "product-photos");

/** Compute MD5 hash of a local file. Returns null if missing. */
function getFileMd5(uri: string): string | null {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return file.md5;
  } catch {
    return null;
  }
}

/** Read a local file as base64 for upload. */
async function readFileBase64(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return await file.base64();
  } catch {
    return null;
  }
}

/**
 * Upload a file to Supabase Storage from a local URI.
 * Reads the file as base64, converts to ArrayBuffer, and uploads.
 */
async function uploadFileToStorage(
  client: SupabaseClient,
  storagePath: string,
  localUri: string,
): Promise<boolean> {
  const b64 = await readFileBase64(localUri);
  if (!b64) return false;

  // Convert base64 to Uint8Array for upload
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await client.storage
    .from("photos")
    .upload(storagePath, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    console.warn(
      `[PhotoSync] Upload failed for ${storagePath}:`,
      error.message,
    );
    return false;
  }
  return true;
}

/**
 * Download a file from Supabase Storage and save locally.
 * Uses the public URL + fetch + FileReader (React Native / Hermes compatible).
 * Returns the new local URI, or null on failure.
 */
async function downloadFileFromStorage(
  client: SupabaseClient,
  storagePath: string,
  filename: string,
): Promise<string | null> {
  try {
    const {
      data: { publicUrl },
    } = client.storage.from("photos").getPublicUrl(storagePath);

    if (!publicUrl) {
      console.warn(`[PhotoSync] No public URL for ${storagePath}`);
      return null;
    }

    // fetch → blob → FileReader (works on all RN engines including Hermes)
    const response = await fetch(publicUrl);
    if (!response.ok) {
      console.warn(
        `[PhotoSync] Download HTTP ${response.status} for ${storagePath}`,
      );
      return null;
    }

    const blob = await response.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // strip "data:<mime>;base64," prefix
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

    if (!PHOTOS_DIR.exists) PHOTOS_DIR.create();

    const dest = new File(PHOTOS_DIR, filename);
    dest.create();
    dest.write(b64, { encoding: "base64" });
    return dest.uri;
  } catch (err) {
    console.warn(
      `[PhotoSync] Download failed for ${storagePath}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ── Upload photos to cloud ───────────────────────────────────────────────────

export async function uploadPhotosToCloud(
  db: SQLiteDatabase,
  businessId: string,
  deviceId: string,
  onProgress?: ProgressCallback,
): Promise<{ uploaded: number; skipped: number; failed: number }> {
  const client = await ensureDataClient(businessId, deviceId);
  if (!client) {
    console.warn("[PhotoSync] No data client available");
    return { uploaded: 0, skipped: 0, failed: 0 };
  }

  // Gather all entities with photos
  const products = await db.getAllAsync<PhotoRow>(
    "SELECT id, photoUri, photoHash, cloudPhotoPath FROM products WHERE photoUri IS NOT NULL",
  );
  const users = await db.getAllAsync<PhotoRow>(
    "SELECT id, photoUri, photoHash, cloudPhotoPath FROM users WHERE photoUri IS NOT NULL",
  );
  const stores = await db.getAllAsync<LogoRow>(
    "SELECT id, logoUri, logoHash, cloudLogoPath FROM stores WHERE logoUri IS NOT NULL",
  );

  // Normalize into a single list for processing
  interface UploadItem {
    table: string;
    id: number;
    localUri: string;
    currentHash: string | null;
    cloudPath: string | null;
    storagePath: string;
    compressType: "product" | "user" | "store";
    hashCol: string;
    cloudCol: string;
  }

  const items: UploadItem[] = [
    ...products.map((p) => ({
      table: "products",
      id: p.id,
      localUri: p.photoUri!,
      currentHash: p.photoHash,
      cloudPath: p.cloudPhotoPath,
      storagePath: `${businessId}/products/${p.id}.jpg`,
      compressType: "product" as const,
      hashCol: "photoHash",
      cloudCol: "cloudPhotoPath",
    })),
    ...users.map((u) => ({
      table: "users",
      id: u.id,
      localUri: u.photoUri!,
      currentHash: u.photoHash,
      cloudPath: u.cloudPhotoPath,
      storagePath: `${businessId}/users/${u.id}.jpg`,
      compressType: "user" as const,
      hashCol: "photoHash",
      cloudCol: "cloudPhotoPath",
    })),
    ...stores.map((s) => ({
      table: "stores",
      id: s.id,
      localUri: s.logoUri!,
      currentHash: s.logoHash,
      cloudPath: s.cloudLogoPath,
      storagePath: `${businessId}/stores/${s.id}.jpg`,
      compressType: "store" as const,
      hashCol: "logoHash",
      cloudCol: "cloudLogoPath",
    })),
  ];

  if (items.length === 0) {
    return { uploaded: 0, skipped: 0, failed: 0 };
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    onProgress?.({
      phase: "uploading",
      current: i + 1,
      total: items.length,
      message: `Subiendo foto ${i + 1}/${items.length}...`,
    });

    // Compute current MD5 of local file
    const localMd5 = getFileMd5(item.localUri);
    if (!localMd5) {
      // File doesn't exist locally — skip
      failed++;
      continue;
    }

    // If hash matches and cloud path exists → no change, skip upload
    if (localMd5 === item.currentHash && item.cloudPath) {
      skipped++;
      continue;
    }

    // Compress for cloud
    let compressedUri: string;
    try {
      compressedUri = await compressForCloud(item.localUri, item.compressType);
    } catch (err) {
      console.warn(
        `[PhotoSync] Compress failed for ${item.table}/${item.id}:`,
        err,
      );
      failed++;
      continue;
    }

    // Upload compressed file
    const ok = await uploadFileToStorage(
      client,
      item.storagePath,
      compressedUri,
    );
    if (!ok) {
      failed++;
      continue;
    }

    // Update SQLite with new hash and cloud path
    await db.runAsync(
      `UPDATE ${item.table} SET ${item.hashCol} = ?, ${item.cloudCol} = ? WHERE id = ?`,
      localMd5,
      item.storagePath,
      item.id,
    );

    uploaded++;
    console.log(
      `[PhotoSync] Uploaded ${item.table}/${item.id} → ${item.storagePath}`,
    );
  }

  console.log(
    `[PhotoSync] Upload complete: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`,
  );
  return { uploaded, skipped, failed };
}

// ── Download photos from cloud ───────────────────────────────────────────────

export async function downloadPhotosFromCloud(
  db: SQLiteDatabase,
  businessId: string,
  deviceId: string,
  onProgress?: ProgressCallback,
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const client = await ensureDataClient(businessId, deviceId);
  if (!client) {
    console.warn("[PhotoSync] No data client available");
    return { downloaded: 0, skipped: 0, failed: 0 };
  }

  // Gather all entities with cloud photo paths
  const products = await db.getAllAsync<PhotoRow>(
    "SELECT id, photoUri, photoHash, cloudPhotoPath FROM products WHERE cloudPhotoPath IS NOT NULL",
  );
  const users = await db.getAllAsync<PhotoRow>(
    "SELECT id, photoUri, photoHash, cloudPhotoPath FROM users WHERE cloudPhotoPath IS NOT NULL",
  );
  const stores = await db.getAllAsync<LogoRow>(
    "SELECT id, logoUri, logoHash, cloudLogoPath FROM stores WHERE cloudLogoPath IS NOT NULL",
  );

  interface DownloadItem {
    table: string;
    id: number;
    localUri: string | null;
    currentHash: string | null;
    cloudPath: string;
    uriCol: string;
  }

  const items: DownloadItem[] = [
    ...products.map((p) => ({
      table: "products",
      id: p.id,
      localUri: p.photoUri,
      currentHash: p.photoHash,
      cloudPath: p.cloudPhotoPath!,
      uriCol: "photoUri",
    })),
    ...users.map((u) => ({
      table: "users",
      id: u.id,
      localUri: u.photoUri,
      currentHash: u.photoHash,
      cloudPath: u.cloudPhotoPath!,
      uriCol: "photoUri",
    })),
    ...stores.map((s) => ({
      table: "stores",
      id: s.id,
      localUri: s.logoUri,
      currentHash: s.logoHash,
      cloudPath: s.cloudLogoPath!,
      uriCol: "logoUri",
    })),
  ];

  if (items.length === 0) {
    return { downloaded: 0, skipped: 0, failed: 0 };
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    onProgress?.({
      phase: "downloading",
      current: i + 1,
      total: items.length,
      message: `Descargando foto ${i + 1}/${items.length}...`,
    });

    // If local file exists and hash matches → already up to date
    if (item.localUri && item.currentHash) {
      const localMd5 = getFileMd5(item.localUri);
      if (localMd5 === item.currentHash) {
        skipped++;
        continue;
      }
    }

    // Download from storage
    const filename = `cloud_${item.table}_${item.id}_${Date.now()}.jpg`;
    const newUri = await downloadFileFromStorage(
      client,
      item.cloudPath,
      filename,
    );

    if (!newUri) {
      failed++;
      continue;
    }

    // Update SQLite with new local URI
    await db.runAsync(
      `UPDATE ${item.table} SET ${item.uriCol} = ? WHERE id = ?`,
      newUri,
      item.id,
    );

    downloaded++;
    console.log(`[PhotoSync] Downloaded ${item.table}/${item.id} → ${newUri}`);
  }

  console.log(
    `[PhotoSync] Download complete: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`,
  );
  return { downloaded, skipped, failed };
}

// ── Cleanup orphaned cloud photos ────────────────────────────────────────────

/**
 * Remove cloud photos that no longer have a corresponding local entity.
 * Call after upload to reclaim storage space.
 */
export async function cleanupOrphanedCloudPhotos(
  db: SQLiteDatabase,
  businessId: string,
  deviceId: string,
): Promise<number> {
  const client = await ensureDataClient(businessId, deviceId);
  if (!client) return 0;

  let removed = 0;

  for (const folder of ["products", "users", "stores"] as const) {
    const { data: files, error } = await client.storage
      .from("photos")
      .list(`${businessId}/${folder}`);

    if (error || !files) continue;

    // Get current IDs from local DB
    const table = folder === "stores" ? "stores" : folder;
    const rows = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM ${table}`,
    );
    const activeIds = new Set(rows.map((r) => r.id));

    for (const file of files) {
      // filename format: {id}.jpg
      const idStr = file.name.replace(".jpg", "");
      const id = parseInt(idStr, 10);
      if (isNaN(id) || activeIds.has(id)) continue;

      const { error: delError } = await client.storage
        .from("photos")
        .remove([`${businessId}/${folder}/${file.name}`]);

      if (!delError) {
        removed++;
        console.log(
          `[PhotoSync] Removed orphaned: ${businessId}/${folder}/${file.name}`,
        );
      }
    }
  }

  return removed;
}
