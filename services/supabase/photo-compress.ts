import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

// ── Compression profiles per entity type ─────────────────────────────────────

interface CompressProfile {
  maxWidth: number;
  quality: number;
}

const PROFILES: Record<string, CompressProfile> = {
  product: { maxWidth: 400, quality: 0.35 },
  user: { maxWidth: 200, quality: 0.35 },
  store: { maxWidth: 300, quality: 0.4 },
};

/**
 * Compress a local image for cloud upload.
 *
 * - Resizes to `maxWidth` keeping aspect ratio
 * - Compresses to JPEG with the given quality
 * - Returns the URI of the temporary compressed file
 *
 * The original file is NOT modified.
 */
export async function compressForCloud(
  localUri: string,
  type: "product" | "user" | "store",
): Promise<string> {
  const profile = PROFILES[type];

  const result = await manipulateAsync(
    localUri,
    [{ resize: { width: profile.maxWidth } }],
    { compress: profile.quality, format: SaveFormat.JPEG },
  );

  return result.uri;
}
