import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

export async function seedUnits(db: SQLiteDatabase) {
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM unit_categories",
  );

  if ((count?.count ?? 0) > 0) return;

  // Insert categories individually to capture their actual IDs
  const { lastInsertRowId: pesoId } = await db.runAsync(
    "INSERT INTO unit_categories (name) VALUES (?)",
    "Peso",
  );
  const { lastInsertRowId: volumenId } = await db.runAsync(
    "INSERT INTO unit_categories (name) VALUES (?)",
    "Volumen",
  );
  const { lastInsertRowId: longitudId } = await db.runAsync(
    "INSERT INTO unit_categories (name) VALUES (?)",
    "Longitud",
  );
  const { lastInsertRowId: unidadId } = await db.runAsync(
    "INSERT INTO unit_categories (name) VALUES (?)",
    "Unidad",
  );

  // Use the real category IDs for each unit
  const units: [string, string, number, number][] = [
    ["kilogramo", "kg", pesoId, 1],
    ["gramo", "g", pesoId, 0.001],
    ["litro", "L", volumenId, 1],
    ["mililitro", "ml", volumenId, 0.001],
    ["metro", "m", longitudId, 1],
    ["centimetro", "cm", longitudId, 0.01],
    ["unidad", "u", unidadId, 1],
    ["paquete", "paq", unidadId, 1],
    ["saco", "sac", unidadId, 1],
    ["rollo", "roll", unidadId, 1],
  ];

  for (const [name, symbol, categoryId, toBaseFactor] of units) {
    await db.runAsync(
      "INSERT INTO units (name, symbol, categoryId, toBaseFactor) VALUES (?, ?, ?, ?)",
      name,
      symbol,
      categoryId,
      toBaseFactor,
    );
  }
}

export async function seedDefaultStore(db: SQLiteDatabase) {
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM stores",
  );
  if ((count?.count ?? 0) > 0) return;

  await db.runAsync("INSERT INTO stores (name) VALUES (?)", "Mi Tienda");
}

export async function seedDefaultAdmin(db: SQLiteDatabase) {
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'",
  );
  if ((count?.count ?? 0) > 0) return;

  const pinHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    "1234",
  );
  await db.runAsync(
    `INSERT INTO users (name, role, pinHash, storeId) VALUES (?, 'ADMIN', ?, NULL)`,
    "Administrador",
    pinHash,
  );
}
