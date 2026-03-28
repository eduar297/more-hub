import * as Crypto from "expo-crypto";
import { Directory, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDatetime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
}

/** Seeded pseudo-random to get reproducible results */
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Static data ──────────────────────────────────────────────────────────────

const WORKERS = [
  { name: "Carlos Mendoza", pin: "1111" },
  { name: "María Gutiérrez", pin: "2222" },
  { name: "José Ramírez", pin: "3333" },
  { name: "Ana López", pin: "4444" },
];

const SUPPLIERS_DATA = [
  {
    name: "Distribuidora El Sol",
    contactName: "Roberto Pérez",
    phone: "555-0101",
    email: "ventas@elsol.com",
    address: "Av. Central 120, Col. Centro",
  },
  {
    name: "Abarrotes Mayoreo MX",
    contactName: "Laura Martínez",
    phone: "555-0202",
    email: "pedidos@abarrotes-mx.com",
    address: "Calle Industria 45, Zona Industrial",
  },
  {
    name: "Dulces y Snacks del Norte",
    contactName: "Miguel Ángel Torres",
    phone: "555-0303",
    email: "info@dulcesnorte.com",
    address: "Blvd. Reforma 890",
  },
  {
    name: "Lácteos Frescos SA",
    contactName: "Patricia Sánchez",
    phone: "555-0404",
    email: "pedidos@lacteosfrescos.com",
    address: "Carr. Panamericana Km 12",
  },
  {
    name: "Bebidas y Refrescos Unidos",
    contactName: "Fernando Díaz",
    phone: "555-0505",
    email: "ventas@bebidasunidas.com",
    address: "Parque Industrial Norte, Nave 7",
  },
];

// Products organized by typical "tienda de abarrotes" categories
// baseUnitId references: 7=unidad, 1=kilogramo, 3=litro, 8=paquete
const PRODUCTS_DATA = [
  // ── Bebidas (supplier 4 = Bebidas y Refrescos Unidos) ──
  {
    name: "Coca-Cola 600ml",
    barcode: "7501055300120",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Coca-Cola 2L",
    barcode: "7501055300228",
    price: 35,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Pepsi 600ml",
    barcode: "7501031310227",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Agua Bonafont 1L",
    barcode: "7501013130519",
    price: 14,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Agua Bonafont 1.5L",
    barcode: "7501013130526",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Jugo Del Valle 1L Manzana",
    barcode: "7501055301103",
    price: 28,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Gatorade 600ml",
    barcode: "7501031311101",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Sprite 600ml",
    barcode: "7501055300330",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Fanta Naranja 600ml",
    barcode: "7501055300440",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },
  {
    name: "Red Bull 250ml",
    barcode: "9002490100070",
    price: 38,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
  },

  // ── Snacks y Dulces (supplier 2 = Dulces y Snacks del Norte) ──
  {
    name: "Sabritas Original 45g",
    barcode: "7501011115001",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Doritos Nacho 62g",
    barcode: "7501011115100",
    price: 22,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Cheetos Flamin Hot 52g",
    barcode: "7501011115200",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Ruffles Queso 45g",
    barcode: "7501011115300",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Galletas Marías Gamesa",
    barcode: "7501000611201",
    price: 16,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Galletas Oreo 6pz",
    barcode: "7622210100108",
    price: 18,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Chocolate Carlos V",
    barcode: "7501000912301",
    price: 12,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Chicles Trident 18pz",
    barcode: "7622210300201",
    price: 25,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Mazapán De La Rosa",
    barcode: "7501000403011",
    price: 8,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
  },
  {
    name: "Paleta Payaso",
    barcode: "7501000404018",
    price: 15,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
  },

  // ── Lácteos (supplier 3 = Lácteos Frescos SA) ──
  {
    name: "Leche Lala Entera 1L",
    barcode: "7501055900107",
    price: 28,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 3,
  },
  {
    name: "Leche Lala Light 1L",
    barcode: "7501055900114",
    price: 30,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 3,
  },
  {
    name: "Yogurt Yoplait Fresa 1kg",
    barcode: "7501055900200",
    price: 42,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 3,
  },
  {
    name: "Queso Oaxaca 400g",
    barcode: "7501055900307",
    price: 75,
    unit: 1,
    mode: "VARIABLE" as const,
    supplier: 3,
  },
  {
    name: "Crema Lala 200ml",
    barcode: "7501055900404",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 3,
  },
  {
    name: "Mantequilla Gloria 90g",
    barcode: "7501055900501",
    price: 28,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 3,
  },

  // ── Abarrotes básicos (supplier 0 = Distribuidora El Sol) ──
  {
    name: "Aceite 123 1L",
    barcode: "7501003332103",
    price: 42,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Arroz Verde Valle 1kg",
    barcode: "7501003340108",
    price: 32,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Frijol Negro 1kg",
    barcode: "7501003340201",
    price: 38,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Azúcar Morena 1kg",
    barcode: "7501003340304",
    price: 30,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Sal de Mesa 1kg",
    barcode: "7501003340407",
    price: 12,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Harina de Maíz Maseca 1kg",
    barcode: "7501003340500",
    price: 25,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Pasta Spaghetti La Moderna",
    barcode: "7501003340603",
    price: 14,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Atún Dolores en Agua",
    barcode: "7501003340706",
    price: 24,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Salsa Valentina 370ml",
    barcode: "7501003340809",
    price: 16,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Papel Higiénico Regio 4 rollos",
    barcode: "7501003340902",
    price: 35,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Jabón Zote en Barra",
    barcode: "7501003341009",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
  },
  {
    name: "Detergente Roma 500g",
    barcode: "7501003341102",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
  },

  // ── Mayoreo / granel (supplier 1 = Abarrotes Mayoreo MX) ──
  {
    name: "Huevo Blanco (kg)",
    barcode: "7501003350101",
    price: 55,
    unit: 1,
    mode: "VARIABLE" as const,
    supplier: 1,
  },
  {
    name: "Tortillas de Maíz 1kg",
    barcode: "7501003350204",
    price: 22,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 1,
  },
  {
    name: "Pan Blanco Bimbo Grande",
    barcode: "7501003350307",
    price: 58,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 1,
  },
  {
    name: "Café Nescafé Clásico 120g",
    barcode: "7501003350400",
    price: 85,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 1,
  },
  {
    name: "Cereal Zucaritas 490g",
    barcode: "7501003350503",
    price: 68,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 1,
  },
];

const EXPENSE_DESCS: Record<string, string[]> = {
  RENT: ["Renta del local mes"],
  ELECTRICITY: ["Pago de luz bimestral", "Recibo CFE"],
  TRANSPORT: [
    "Gasolina para entregas",
    "Pasajes de camión",
    "Uber para recoger mercancía",
  ],
  REPAIRS: [
    "Reparación de refrigerador",
    "Cambio de foco",
    "Plomero",
    "Pintura de local",
  ],
  SUPPLIES: [
    "Bolsas de plástico",
    "Rollo de ticket",
    "Cinta adhesiva",
    "Marcadores",
  ],
  OTHER: ["Propina ayudante", "Limpieza", "Agua garrafón oficina"],
};

// ── Product profiles (control simulation behavior) ───────────────────────────

type ProductProfile = {
  /** Base popularity weight: 0 = never sell, 0.5 = low, 1 = normal, 2+ = high */
  pop: number;
  /** How sales evolve over time */
  trend: "stable" | "rise" | "fall" | "crash" | "dead";
  /** Cost as fraction of sale price (0.50 = 50% margin, 0.85 = 15% margin) */
  costPct: number;
  /** Continue restocking beyond initial purchase? */
  restock: boolean;
  /** Index into PRODUCTS_DATA of a product frequently bought together */
  combo?: number;
};

const PROFILES: ProductProfile[] = [
  /* 0  Coca-Cola 600ml    */ {
    pop: 2.5,
    trend: "stable",
    costPct: 0.55,
    restock: true,
    combo: 10,
  },
  /* 1  Coca-Cola 2L       */ {
    pop: 1.5,
    trend: "stable",
    costPct: 0.6,
    restock: true,
  },
  /* 2  Pepsi 600ml        */ {
    pop: 1.2,
    trend: "stable",
    costPct: 0.58,
    restock: true,
  },
  /* 3  Agua Bonafont 1L   */ {
    pop: 1.8,
    trend: "stable",
    costPct: 0.8,
    restock: true,
  },
  /* 4  Agua Bonafont 1.5L */ {
    pop: 1.0,
    trend: "rise",
    costPct: 0.75,
    restock: true,
  },
  /* 5  Jugo Del Valle     */ {
    pop: 0.8,
    trend: "stable",
    costPct: 0.65,
    restock: true,
  },
  /* 6  Gatorade 600ml     */ {
    pop: 0,
    trend: "dead",
    costPct: 0.7,
    restock: false,
  },
  /* 7  Sprite 600ml       */ {
    pop: 0.7,
    trend: "stable",
    costPct: 0.6,
    restock: true,
  },
  /* 8  Fanta Naranja      */ {
    pop: 1.0,
    trend: "fall",
    costPct: 0.6,
    restock: true,
  },
  /* 9  Red Bull 250ml     */ {
    pop: 1.2,
    trend: "crash",
    costPct: 0.5,
    restock: false,
  },
  /* 10 Sabritas Original  */ {
    pop: 2.0,
    trend: "stable",
    costPct: 0.55,
    restock: true,
    combo: 0,
  },
  /* 11 Doritos Nacho      */ {
    pop: 1.0,
    trend: "rise",
    costPct: 0.58,
    restock: true,
  },
  /* 12 Cheetos Flamin Hot */ {
    pop: 1.5,
    trend: "stable",
    costPct: 0.55,
    restock: true,
  },
  /* 13 Ruffles Queso      */ {
    pop: 0.8,
    trend: "stable",
    costPct: 0.6,
    restock: true,
  },
  /* 14 Galletas Marías    */ {
    pop: 0.8,
    trend: "fall",
    costPct: 0.75,
    restock: true,
  },
  /* 15 Galletas Oreo      */ {
    pop: 1.0,
    trend: "stable",
    costPct: 0.65,
    restock: true,
  },
  /* 16 Chocolate Carlos V */ {
    pop: 0.6,
    trend: "stable",
    costPct: 0.5,
    restock: true,
  },
  /* 17 Chicles Trident    */ {
    pop: 0.5,
    trend: "stable",
    costPct: 0.82,
    restock: true,
  },
  /* 18 Mazapán De La Rosa */ {
    pop: 0.7,
    trend: "stable",
    costPct: 0.6,
    restock: true,
  },
  /* 19 Paleta Payaso      */ {
    pop: 0.6,
    trend: "fall",
    costPct: 0.65,
    restock: true,
  },
  /* 20 Leche Lala Entera  */ {
    pop: 2.0,
    trend: "stable",
    costPct: 0.82,
    restock: true,
    combo: 40,
  },
  /* 21 Leche Lala Light   */ {
    pop: 0.8,
    trend: "stable",
    costPct: 0.8,
    restock: true,
  },
  /* 22 Yogurt Yoplait     */ {
    pop: 0.8,
    trend: "crash",
    costPct: 0.55,
    restock: false,
  },
  /* 23 Queso Oaxaca       */ {
    pop: 1.2,
    trend: "stable",
    costPct: 0.5,
    restock: true,
    combo: 39,
  },
  /* 24 Crema Lala         */ {
    pop: 0.9,
    trend: "stable",
    costPct: 0.7,
    restock: true,
  },
  /* 25 Mantequilla Gloria */ {
    pop: 0.7,
    trend: "crash",
    costPct: 0.65,
    restock: false,
  },
  /* 26 Aceite 123         */ {
    pop: 1.0,
    trend: "stable",
    costPct: 0.7,
    restock: true,
  },
  /* 27 Arroz Verde Valle  */ {
    pop: 1.5,
    trend: "stable",
    costPct: 0.75,
    restock: true,
    combo: 28,
  },
  /* 28 Frijol Negro       */ {
    pop: 1.3,
    trend: "stable",
    costPct: 0.72,
    restock: true,
    combo: 27,
  },
  /* 29 Azúcar Morena      */ {
    pop: 1.2,
    trend: "stable",
    costPct: 0.8,
    restock: true,
  },
  /* 30 Sal de Mesa        */ {
    pop: 0.4,
    trend: "stable",
    costPct: 0.85,
    restock: true,
  },
  /* 31 Harina Maseca      */ {
    pop: 1.0,
    trend: "stable",
    costPct: 0.75,
    restock: true,
  },
  /* 32 Pasta Spaghetti    */ {
    pop: 0.5,
    trend: "stable",
    costPct: 0.82,
    restock: true,
  },
  /* 33 Atún Dolores       */ {
    pop: 0.7,
    trend: "rise",
    costPct: 0.65,
    restock: true,
  },
  /* 34 Salsa Valentina    */ {
    pop: 1.0,
    trend: "stable",
    costPct: 0.68,
    restock: true,
  },
  /* 35 Papel Higiénico    */ {
    pop: 1.5,
    trend: "stable",
    costPct: 0.7,
    restock: true,
  },
  /* 36 Jabón Zote         */ {
    pop: 0.6,
    trend: "stable",
    costPct: 0.75,
    restock: true,
  },
  /* 37 Detergente Roma    */ {
    pop: 0.6,
    trend: "stable",
    costPct: 0.72,
    restock: true,
  },
  /* 38 Huevo Blanco       */ {
    pop: 2.5,
    trend: "stable",
    costPct: 0.85,
    restock: true,
  },
  /* 39 Tortillas de Maíz  */ {
    pop: 2.5,
    trend: "stable",
    costPct: 0.85,
    restock: true,
    combo: 23,
  },
  /* 40 Pan Bimbo          */ {
    pop: 1.8,
    trend: "stable",
    costPct: 0.72,
    restock: true,
    combo: 20,
  },
  /* 41 Café Nescafé       */ {
    pop: 0.7,
    trend: "stable",
    costPct: 0.5,
    restock: true,
  },
  /* 42 Cereal Zucaritas   */ {
    pop: 0,
    trend: "dead",
    costPct: 0.65,
    restock: false,
  },
];

/** Returns a multiplier based on trend and position in the timeline (0=start, 1=end) */
function trendFactor(trend: ProductProfile["trend"], t: number): number {
  switch (trend) {
    case "stable":
      return 1.0;
    case "rise":
      return 0.3 + 1.7 * t; // 0.3 → 2.0
    case "fall":
      return 1.5 * (1 - t * 0.85); // 1.5 → 0.225
    case "crash":
      return t < 0.5 ? 1.2 : 0.02; // normal → near-zero
    case "dead":
      return 0;
  }
}

/** Pick a random index using weights (higher weight = more likely) */
function weightedPick(indices: number[], weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return indices[0];
  let r = rand() * total;
  for (let i = 0; i < indices.length; i++) {
    r -= weights[i];
    if (r <= 0) return indices[i];
  }
  return indices[indices.length - 1];
}

// ── Reset function ───────────────────────────────────────────────────────────

/**
 * Wipes ALL data except the admin user and system tables (units/categories).
 * Also deletes product photos from the file system.
 */
export async function resetDatabase(db: SQLiteDatabase) {
  // Delete photos from filesystem
  const photosDir = new Directory(Paths.document, "product-photos");
  if (photosDir.exists) {
    photosDir.delete();
  }

  await db.execAsync(`
    DELETE FROM ticket_items;
    DELETE FROM tickets;
    DELETE FROM purchase_items;
    DELETE FROM purchases;
    DELETE FROM expenses;
    DELETE FROM products;
    DELETE FROM suppliers;
    DELETE FROM users WHERE role != 'ADMIN';
    DELETE FROM stores;
  `);

  // Re-seed default store so the app always has at least one
  const storeCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM stores",
  );
  if ((storeCount?.count ?? 0) === 0) {
    await db.runAsync("INSERT INTO stores (name) VALUES (?)", "Mi Tienda");
  }
}

// ── Seed simulation ──────────────────────────────────────────────────────────

/**
 * Seeds a full year of realistic business data:
 * - 4 workers (2 per day, alternating, Mon-Fri only)
 * - 44 products across 5 categories
 * - 5 suppliers
 * - Bi-weekly purchases to replenish stock
 * - 8-15 tickets per working day
 * - Monthly expenses (rent, electricity, supplies, etc.)
 *
 * All dates are backdated to cover the past 12 months.
 */
export async function seedSimulation(
  db: SQLiteDatabase,
  onProgress?: (msg: string) => void,
) {
  const now = new Date();
  // Start Jan 1 of the previous year → full 12 months of last year + current year to date
  const startDate = new Date(now.getFullYear() - 1, 0, 1);

  onProgress?.("Creando trabajadores...");

  // Get first store id for workers
  const firstStore = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM stores ORDER BY id ASC LIMIT 1",
  );
  const defaultStoreId = firstStore?.id ?? 1;

  // ── 1. Create workers ──────────────────────────────────────────────────────
  const workerIds: number[] = [];
  for (const w of WORKERS) {
    const pinHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      w.pin,
    );
    const result = await db.runAsync(
      `INSERT INTO users (name, role, pinHash, storeId, createdAt) VALUES (?, 'WORKER', ?, ?, ?)`,
      w.name,
      pinHash,
      defaultStoreId,
      fmtDatetime(startDate),
    );
    workerIds.push(result.lastInsertRowId);
  }
  const workerNames = WORKERS.map((w) => w.name);

  onProgress?.("Creando proveedores...");

  // ── 2. Create suppliers ────────────────────────────────────────────────────
  const supplierIds: number[] = [];
  for (const s of SUPPLIERS_DATA) {
    const result = await db.runAsync(
      `INSERT INTO suppliers (name, contactName, phone, email, address, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      s.name,
      s.contactName,
      s.phone,
      s.email,
      s.address,
      fmtDatetime(startDate),
    );
    supplierIds.push(result.lastInsertRowId);
  }

  onProgress?.("Creando productos...");

  // ── 3. Create products (no initial stock — purchases will add stock) ───────
  const productIds: number[] = [];
  const productPrices: number[] = [];
  const productNames: string[] = [];
  const productSupplierIdx: number[] = [];
  for (let pi = 0; pi < PRODUCTS_DATA.length; pi++) {
    const p = PRODUCTS_DATA[pi];
    const profile = PROFILES[pi];
    // salePrice = costPrice * (1.25 to 1.55) — random realistic markup
    const markup = 1.25 + rand() * 0.3;
    const salePx = Math.round(p.price * markup * 100) / 100;
    // costPrice based on profile margin
    const costPx = Math.round(salePx * profile.costPct * 100) / 100;
    const result = await db.runAsync(
      `INSERT INTO products (name, barcode, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode)
       VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
      p.name,
      p.barcode,
      p.price,
      costPx,
      salePx,
      p.unit,
      p.mode,
    );
    productIds.push(result.lastInsertRowId);
    productPrices.push(salePx); // tickets use salePrice
    productNames.push(p.name);
    productSupplierIdx.push(p.supplier);
  }

  // Track running stock so we never sell below 0
  const stock: number[] = productIds.map(() => 0);

  // ── 4. Generate working days ───────────────────────────────────────────────
  const workingDays: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) {
      workingDays.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  onProgress?.(`Simulando ${workingDays.length} días laborales...`);

  // ── 5. Initial stock purchase (day before first working day) ───────────────
  await insertPurchaseBatch(
    db,
    startDate,
    supplierIds,
    productIds,
    productNames,
    productPrices,
    productSupplierIdx,
    stock,
    true,
  );

  // ── 6. Day-by-day simulation ───────────────────────────────────────────────
  let dayCount = 0;
  let purchaseDayCounter = 0;

  for (const day of workingDays) {
    dayCount++;
    purchaseDayCounter++;

    // Assign 2 workers for this day (Team A / Team B alternating weeks)
    const weekNum = Math.floor(dayCount / 5);
    const teamA = [0, 1]; // Carlos, María
    const teamB = [2, 3]; // José, Ana
    const todayTeam = weekNum % 2 === 0 ? teamA : teamB;

    // ── Replenishment purchase every 18 working days (~monthly) ─────────
    if (purchaseDayCounter >= 18) {
      purchaseDayCounter = 0;
      const purchaseHour = 8 + randInt(0, 1);
      const purchaseTime = new Date(day);
      purchaseTime.setHours(purchaseHour, randInt(0, 59), randInt(0, 59));
      await insertPurchaseBatch(
        db,
        purchaseTime,
        supplierIds,
        productIds,
        productNames,
        productPrices,
        productSupplierIdx,
        stock,
        false,
      );
    }

    // ── Generate tickets for this day ────────────────────────────────────
    // Morning rush (9-12): more tickets. Afternoon (12-17): moderate. Evening (17-20): lighter.
    const morningTickets = randInt(4, 7);
    const afternoonTickets = randInt(3, 6);
    const eveningTickets = randInt(2, 4);
    const totalTickets = morningTickets + afternoonTickets + eveningTickets;

    for (let t = 0; t < totalTickets; t++) {
      let hour: number;
      let minute: number;
      if (t < morningTickets) {
        hour = 9 + Math.floor((t / morningTickets) * 3);
        minute = randInt(0, 59);
      } else if (t < morningTickets + afternoonTickets) {
        hour = 12 + Math.floor(((t - morningTickets) / afternoonTickets) * 5);
        minute = randInt(0, 59);
      } else {
        hour =
          17 +
          Math.floor(
            ((t - morningTickets - afternoonTickets) / eveningTickets) * 3,
          );
        minute = randInt(0, 59);
      }

      const ticketTime = new Date(day);
      ticketTime.setHours(hour, minute, randInt(0, 59));

      // Pick worker (alternate between the two on the team)
      const wIdx = todayTeam[t % 2];
      const wId = workerIds[wIdx];
      const wName = workerNames[wIdx];

      // Build cart: 1-6 items per ticket (weighted by popularity + trend)
      const numItems = randInt(1, 6);
      const cartProductIdxs: number[] = [];
      const timePos = dayCount / workingDays.length; // 0 → 1
      const available = productIds.map((_, i) => i).filter((i) => stock[i] > 0);
      const weights = available.map(
        (i) => PROFILES[i].pop * trendFactor(PROFILES[i].trend, timePos),
      );

      if (available.length === 0) continue; // no stock at all, skip

      for (let ci = 0; ci < numItems; ci++) {
        if (available.length === 0) break;
        const pIdx = weightedPick(available, weights);
        if (!cartProductIdxs.includes(pIdx)) {
          cartProductIdxs.push(pIdx);
          // Combo: frequently bought together
          const comboIdx = PROFILES[pIdx].combo;
          if (
            comboIdx !== undefined &&
            stock[comboIdx] > 0 &&
            !cartProductIdxs.includes(comboIdx) &&
            rand() < 0.55
          ) {
            cartProductIdxs.push(comboIdx);
          }
        }
      }

      if (cartProductIdxs.length === 0) continue;

      // Build items with quantities
      const items: { pIdx: number; qty: number; price: number }[] = [];
      let ticketTotal = 0;

      for (const pIdx of cartProductIdxs) {
        const maxQty = Math.min(Math.floor(stock[pIdx]), 5);
        if (maxQty <= 0) continue;
        const qty = randInt(1, Math.max(1, maxQty));
        const price = productPrices[pIdx];
        items.push({ pIdx, qty, price });
        ticketTotal += qty * price;
      }

      if (items.length === 0) continue;

      const paymentMethod = rand() < 0.65 ? "CASH" : "CARD";

      // Insert ticket
      const ticketResult = await db.runAsync(
        `INSERT INTO tickets (createdAt, paymentMethod, total, itemCount, workerId, workerName)
         VALUES (?, ?, ?, ?, ?, ?)`,
        fmtDatetime(ticketTime),
        paymentMethod,
        ticketTotal,
        items.length,
        wId,
        wName,
      );
      const ticketId = ticketResult.lastInsertRowId;

      // Insert ticket items and deduct stock
      for (const it of items) {
        const subtotal = it.qty * it.price;
        await db.runAsync(
          `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ticketId,
          productIds[it.pIdx],
          productNames[it.pIdx],
          it.qty,
          it.price,
          subtotal,
        );
        stock[it.pIdx] -= it.qty;
      }
    }

    // Progress update every 20 days
    if (dayCount % 20 === 0) {
      onProgress?.(`Día ${dayCount}/${workingDays.length}...`);
    }
  }

  onProgress?.("Creando gastos mensuales...");

  // ── 7. Monthly expenses ────────────────────────────────────────────────────
  const monthStart = new Date(startDate);
  while (monthStart <= now) {
    const ym = fmt(monthStart);

    // Rent — fixed monthly
    await db.runAsync(
      `INSERT INTO expenses (category, description, amount, date, createdAt)
       VALUES ('RENT', 'Renta del local mes', ?, ?, ?)`,
      randInt(8000, 12000),
      `${ym.slice(0, 7)}-01`,
      `${ym.slice(0, 7)}-01 09:00:00`,
    );

    // Electricity — bimonthly (odd months)
    if ((monthStart.getMonth() + 1) % 2 === 1) {
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, createdAt)
         VALUES ('ELECTRICITY', 'Pago de luz bimestral', ?, ?, ?)`,
        randInt(1500, 3500),
        `${ym.slice(0, 7)}-15`,
        `${ym.slice(0, 7)}-15 10:00:00`,
      );
    }

    // Transport — 2-4 per month
    const transportCount = randInt(2, 4);
    for (let i = 0; i < transportCount; i++) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, createdAt)
         VALUES ('TRANSPORT', ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.TRANSPORT),
        randInt(150, 800),
        dateStr,
        `${dateStr} 12:00:00`,
      );
    }

    // Supplies — 1-2 per month
    const suppliesCount = randInt(1, 2);
    for (let i = 0; i < suppliesCount; i++) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, createdAt)
         VALUES ('SUPPLIES', ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.SUPPLIES),
        randInt(80, 400),
        dateStr,
        `${dateStr} 14:00:00`,
      );
    }

    // Repairs — occasional (30% chance per month)
    if (rand() < 0.3) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, createdAt)
         VALUES ('REPAIRS', ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.REPAIRS),
        randInt(300, 3000),
        dateStr,
        `${dateStr} 16:00:00`,
      );
    }

    // Other — 1 per month
    {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, createdAt)
         VALUES ('OTHER', ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.OTHER),
        randInt(50, 300),
        dateStr,
        `${dateStr} 11:00:00`,
      );
    }

    monthStart.setMonth(monthStart.getMonth() + 1);
  }

  onProgress?.("¡Simulación completa!");
}

// ── Purchase batch helper ────────────────────────────────────────────────────

/**
 * Creates purchases from multiple suppliers in one batch.
 * `initial` = true means bigger quantities to bootstrap stock.
 */
async function insertPurchaseBatch(
  db: SQLiteDatabase,
  date: Date,
  supplierIds: number[],
  productIds: number[],
  productNames: string[],
  productPrices: number[],
  productSupplierIdx: number[],
  stock: number[],
  initial: boolean,
) {
  // Group products by supplier
  const supplierProducts: Map<number, number[]> = new Map();
  for (let i = 0; i < productIds.length; i++) {
    const sIdx = productSupplierIdx[i];
    if (!supplierProducts.has(sIdx)) supplierProducts.set(sIdx, []);
    supplierProducts.get(sIdx)!.push(i);
  }

  for (const [sIdx, pIdxs] of supplierProducts.entries()) {
    // Not every supplier delivers every time (unless initial)
    if (!initial && rand() < 0.3) continue;

    const items: {
      productId: number;
      productName: string;
      quantity: number;
      unitCost: number;
    }[] = [];

    // Pick products to restock (respect profile)
    const toRestock = initial
      ? pIdxs // all products on initial stock (even dead — creates capital locked)
      : pIdxs.filter((i) => PROFILES[i].restock && stock[i] < 10);

    for (const pIdx of toRestock) {
      // Cost based on profile margin ± small random variation
      const costPct = PROFILES[pIdx].costPct + (rand() - 0.5) * 0.04;
      const unitCost = Math.round(productPrices[pIdx] * costPct * 100) / 100;
      const qty = initial ? randInt(30, 60) : randInt(8, 25);

      items.push({
        productId: productIds[pIdx],
        productName: productNames[pIdx],
        quantity: qty,
        unitCost,
      });

      stock[pIdx] += qty;
    }

    if (items.length === 0) continue;

    const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const transportCost = randInt(0, 1) === 1 ? randInt(100, 500) : 0;
    const total = itemsTotal + transportCost;

    const purchaseResult = await db.runAsync(
      `INSERT INTO purchases (supplierId, supplierName, notes, total, transportCost, itemCount, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      supplierIds[sIdx],
      SUPPLIERS_DATA[sIdx].name,
      initial ? "Stock inicial" : "Resurtido periódico",
      total,
      transportCost,
      items.length,
      fmtDatetime(date),
    );
    const purchaseId = purchaseResult.lastInsertRowId;

    for (const item of items) {
      const subtotal = item.quantity * item.unitCost;
      await db.runAsync(
        `INSERT INTO purchase_items (purchaseId, productId, productName, quantity, unitCost, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        purchaseId,
        item.productId,
        item.productName,
        item.quantity,
        item.unitCost,
        subtotal,
      );

      // Update product stock in DB
      await db.runAsync(
        `UPDATE products SET stockBaseQty = stockBaseQty + ? WHERE id = ?`,
        item.quantity,
        item.productId,
      );
    }
  }
}
