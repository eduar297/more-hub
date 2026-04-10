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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

const BASIC_WORKER = { name: "Vendedor Demo", pin: "1234" };

const BASIC_SUPPLIER = {
  name: "Proveedor Demo",
  contactName: "Marco Demo",
  phone: "555-0000",
  email: "demo@proveedor.com",
  address: "Zona Centro",
};

const BASIC_PRODUCTS = [
  {
    name: "Refresco Cola 600ml",
    code: "900000000001",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    details: "Refresco de cola carbonatado, botella PET 600ml. Servir frío.",
  },
  {
    name: "Agua 1L",
    code: "900000000002",
    price: 14,
    unit: 7,
    mode: "UNIT" as const,
    details: "Agua purificada natural, botella de 1 litro.",
  },
  {
    name: "Papas 45g",
    code: "900000000003",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    details: "Papas fritas crujientes sabor original, bolsa individual 45g.",
  },
  {
    name: "Galletas 6pz",
    code: "900000000004",
    price: 16,
    unit: 8,
    mode: "UNIT" as const,
    details: "Paquete de 6 galletas de vainilla con relleno de crema.",
  },
  {
    name: "Pan de caja chico",
    code: "900000000005",
    price: 38,
    unit: 8,
    mode: "UNIT" as const,
    details: "Pan blanco de caja tamaño chico, ideal para sándwiches.",
  },
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
const PRODUCTS_DATA = [
  // ── Bebidas (supplier 4 = Bebidas y Refrescos Unidos) ──
  {
    name: "Coca-Cola 600ml",
    code: "7501055300120",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Refresco de cola original, botella PET 600ml.",
  },
  {
    name: "Coca-Cola 2L",
    code: "7501055300228",
    price: 35,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Refresco de cola original, botella familiar 2 litros.",
  },
  {
    name: "Pepsi 600ml",
    code: "7501031310227",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Refresco de cola Pepsi, botella PET 600ml.",
  },
  {
    name: "Agua Bonafont 1L",
    code: "7501013130519",
    price: 14,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Agua purificada natural Bonafont, 1 litro.",
  },
  {
    name: "Agua Bonafont 1.5L",
    code: "7501013130526",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Agua purificada natural Bonafont, 1.5 litros.",
  },
  {
    name: "Jugo Del Valle 1L Manzana",
    code: "7501055301103",
    price: 28,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Jugo de manzana Del Valle, envase Tetra Pak 1 litro.",
  },
  {
    name: "Gatorade 600ml",
    code: "7501031311101",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Bebida hidratante con electrolitos, botella 600ml.",
  },
  {
    name: "Sprite 600ml",
    code: "7501055300330",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Refresco de lima-limón, botella PET 600ml.",
  },
  {
    name: "Fanta Naranja 600ml",
    code: "7501055300440",
    price: 17,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Refresco sabor naranja, botella PET 600ml.",
  },
  {
    name: "Red Bull 250ml",
    code: "9002490100070",
    price: 38,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 4,
    details: "Bebida energética con taurina y cafeína, lata 250ml.",
  },

  // ── Snacks y Dulces (supplier 2 = Dulces y Snacks del Norte) ──
  {
    name: "Sabritas Original 45g",
    code: "7501011115001",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Papas fritas sabor original, bolsa individual 45g.",
  },
  {
    name: "Doritos Nacho 62g",
    code: "7501011115100",
    price: 22,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Totopos de maíz sabor nacho, bolsa 62g.",
  },
  {
    name: "Cheetos Flamin Hot 52g",
    code: "7501011115200",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Botana de maíz horneada extra picante, bolsa 52g.",
  },
  {
    name: "Ruffles Queso 45g",
    code: "7501011115300",
    price: 20,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Papas fritas onduladas sabor queso, bolsa 45g.",
  },
  {
    name: "Galletas Marías Gamesa",
    code: "7501000611201",
    price: 16,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Galletas clásicas tipo María, paquete individual.",
  },
  {
    name: "Galletas Oreo 6pz",
    code: "7622210100108",
    price: 18,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Galletas de chocolate con relleno de crema, 6 piezas.",
  },
  {
    name: "Chocolate Carlos V",
    code: "7501000912301",
    price: 12,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Barra de chocolate con leche, pieza individual.",
  },
  {
    name: "Chicles Trident 18pz",
    code: "7622210300201",
    price: 25,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Chicle sin azúcar sabor menta, paquete de 18 piezas.",
  },
  {
    name: "Mazapán De La Rosa",
    code: "7501000403011",
    price: 8,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Dulce tradicional mexicano de cacahuate, pieza individual.",
  },
  {
    name: "Paleta Payaso",
    code: "7501000404018",
    price: 15,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 2,
    details: "Malvavisco cubierto de chocolate con gomitas, pieza.",
  },

  // ── Lácteos (supplier 3 = Lácteos Frescos SA) ──
  {
    name: "Leche Lala Entera 1L",
    code: "7501055900107",
    price: 28,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 3,
    details: "Leche entera pasteurizada Lala, envase 1 litro.",
  },
  {
    name: "Leche Lala Light 1L",
    code: "7501055900114",
    price: 30,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 3,
    details: "Leche semidescremada Lala Light, envase 1 litro.",
  },
  {
    name: "Yogurt Yoplait Fresa 1kg",
    code: "7501055900200",
    price: 42,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 3,
    details: "Yogurt batido sabor fresa Yoplait, envase 1kg.",
  },
  {
    name: "Queso Oaxaca 400g",
    code: "7501055900307",
    price: 75,
    unit: 1,
    mode: "VARIABLE" as const,
    supplier: 3,
    details: "Queso Oaxaca tipo hebra, paquete de 400g. Se vende por peso.",
  },
  {
    name: "Crema Lala 200ml",
    code: "7501055900404",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 3,
    details: "Crema ácida Lala, envase de 200ml.",
  },
  {
    name: "Mantequilla Gloria 90g",
    code: "7501055900501",
    price: 28,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 3,
    details: "Mantequilla con sal Gloria, barra de 90g.",
  },

  // ── Abarrotes básicos (supplier 0 = Distribuidora El Sol) ──
  {
    name: "Aceite 123 1L",
    code: "7501003332103",
    price: 42,
    unit: 3,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Aceite vegetal comestible 123, botella de 1 litro.",
  },
  {
    name: "Arroz Verde Valle 1kg",
    code: "7501003340108",
    price: 32,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Arroz blanco grano largo Verde Valle, bolsa de 1kg.",
  },
  {
    name: "Frijol Negro 1kg",
    code: "7501003340201",
    price: 38,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Frijol negro seleccionado, bolsa de 1kg.",
  },
  {
    name: "Azúcar Morena 1kg",
    code: "7501003340304",
    price: 30,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Azúcar morena estándar, bolsa de 1kg.",
  },
  {
    name: "Sal de Mesa 1kg",
    code: "7501003340407",
    price: 12,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Sal de mesa refinada y yodada, bolsa de 1kg.",
  },
  {
    name: "Harina de Maíz Maseca 1kg",
    code: "7501003340500",
    price: 25,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Harina de maíz nixtamalizado Maseca, bolsa de 1kg.",
  },
  {
    name: "Pasta Spaghetti La Moderna",
    code: "7501003340603",
    price: 14,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Pasta tipo spaghetti La Moderna, paquete individual.",
  },
  {
    name: "Atún Dolores en Agua",
    code: "7501003340706",
    price: 24,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Atún en trozos en agua Dolores, lata individual.",
  },
  {
    name: "Salsa Valentina 370ml",
    code: "7501003340809",
    price: 16,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Salsa picante Valentina etiqueta amarilla, botella 370ml.",
  },
  {
    name: "Papel Higiénico Regio 4 rollos",
    code: "7501003340902",
    price: 35,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Papel higiénico Regio, paquete de 4 rollos.",
  },
  {
    name: "Jabón Zote en Barra",
    code: "7501003341009",
    price: 18,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Jabón de lavandería Zote rosa, barra individual.",
  },
  {
    name: "Detergente Roma 500g",
    code: "7501003341102",
    price: 22,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 0,
    details: "Detergente en polvo Roma multiusos, bolsa 500g.",
  },

  // ── Mayoreo / granel (supplier 1 = Abarrotes Mayoreo MX) ──
  {
    name: "Huevo Blanco (kg)",
    code: "7501003350101",
    price: 55,
    unit: 1,
    mode: "VARIABLE" as const,
    supplier: 1,
    details: "Huevo blanco fresco, se vende por kilogramo.",
  },
  {
    name: "Tortillas de Maíz 1kg",
    code: "7501003350204",
    price: 22,
    unit: 1,
    mode: "UNIT" as const,
    supplier: 1,
    details: "Tortillas de maíz hechas del día, paquete de 1kg.",
  },
  {
    name: "Pan Blanco Bimbo Grande",
    code: "7501003350307",
    price: 58,
    unit: 8,
    mode: "UNIT" as const,
    supplier: 1,
    details: "Pan blanco de caja Bimbo tamaño grande, ideal para sándwiches.",
  },
  {
    name: "Café Nescafé Clásico 120g",
    code: "7501003350400",
    price: 85,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 1,
    details: "Café soluble Nescafé Clásico, frasco de vidrio 120g.",
  },
  {
    name: "Cereal Zucaritas 490g",
    code: "7501003350503",
    price: 68,
    unit: 7,
    mode: "UNIT" as const,
    supplier: 1,
    details: "Cereal de hojuelas de maíz azucaradas Zucaritas, caja 490g.",
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
  pop: number;
  trend: "stable" | "rise" | "fall" | "crash" | "dead";
  costPct: number;
  restock: boolean;
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

function trendFactor(trend: ProductProfile["trend"], t: number): number {
  switch (trend) {
    case "stable":
      return 1.0;
    case "rise":
      return 0.3 + 1.7 * t;
    case "fall":
      return 1.5 * (1 - t * 0.85);
    case "crash":
      return t < 0.5 ? 1.2 : 0.02;
    case "dead":
      return 0;
  }
}

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

export async function resetDatabase(db: SQLiteDatabase) {
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
    DELETE FROM notification_history;
    DELETE FROM app_settings;
  `);

  const storeCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM stores",
  );
  if ((storeCount?.count ?? 0) === 0) {
    // Al resetear nos aseguramos de crear al menos una tienda
    await db.runAsync(
      "INSERT INTO stores (name, color) VALUES (?, ?)",
      "Mi Tienda",
      "#3b82f6",
    );
  }
}

export async function seedBasicSimulation(
  db: SQLiteDatabase,
  storeId: number,
  onProgress?: (msg: string) => void,
) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 10);
  startDate.setHours(8, 0, 0, 0);

  onProgress?.("Creando vendedor...");
  const workerPinHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    BASIC_WORKER.pin,
  );
  const workerResult = await db.runAsync(
    `INSERT INTO users (name, role, pinHash, storeId, createdAt) VALUES (?, 'WORKER', ?, ?, ?)`,
    BASIC_WORKER.name,
    workerPinHash,
    storeId,
    fmtDatetime(startDate),
  );
  const workerId = workerResult.lastInsertRowId;

  onProgress?.("Creando proveedor...");
  const supplierResult = await db.runAsync(
    `INSERT INTO suppliers (name, contactName, phone, email, address, storeId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    BASIC_SUPPLIER.name,
    BASIC_SUPPLIER.contactName,
    BASIC_SUPPLIER.phone,
    BASIC_SUPPLIER.email,
    BASIC_SUPPLIER.address,
    storeId,
    fmtDatetime(startDate),
  );
  const supplierId = supplierResult.lastInsertRowId;

  onProgress?.("Creando 5 productos...");
  const productIds: number[] = [];
  const productNames: string[] = [];
  const salePrices: number[] = [];
  const stock: number[] = [];

  for (const p of BASIC_PRODUCTS) {
    const costPrice = Math.round(p.price * 0.72 * 100) / 100;
    const salePrice = Math.round(p.price * 1.22 * 100) / 100;
    const result = await db.runAsync(
      `INSERT INTO products (name, code, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode, details, storeId)
       VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)`,
      p.name,
      p.code,
      p.price,
      costPrice,
      salePrice,
      p.unit,
      p.mode,
      p.details ?? null,
      storeId,
    );
    productIds.push(result.lastInsertRowId);
    productNames.push(p.name);
    salePrices.push(salePrice);
    stock.push(0);
  }

  onProgress?.("Creando compras iniciales...");
  for (let batch = 0; batch < 2; batch++) {
    const purchaseDate = new Date(startDate);
    purchaseDate.setDate(startDate.getDate() + batch * 3);
    purchaseDate.setHours(8 + batch, 30, 0, 0);

    const items = productIds.map((productId, index) => {
      const quantity = batch === 0 ? 22 - index * 2 : 12 - index;
      const unitCost = Math.round(salePrices[index] * 0.73 * 100) / 100;
      stock[index] += quantity;
      return {
        productId,
        productName: productNames[index],
        quantity,
        unitCost,
      };
    });

    const total = items.reduce((sum, item) => {
      return sum + item.quantity * item.unitCost;
    }, 0);

    const purchaseResult = await db.runAsync(
      `INSERT INTO purchases (supplierId, supplierName, notes, total, transportCost, itemCount, storeId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      supplierId,
      BASIC_SUPPLIER.name,
      batch === 0 ? "Stock inicial básico" : "Reabastecimiento básico",
      total,
      0,
      items.length,
      storeId,
      fmtDatetime(purchaseDate),
    );
    const purchaseId = purchaseResult.lastInsertRowId;

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO purchase_items (purchaseId, productId, productName, quantity, unitCost, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        purchaseId,
        item.productId,
        item.productName,
        item.quantity,
        item.unitCost,
        item.quantity * item.unitCost,
      );
    }
  }

  onProgress?.("Registrando ventas de ejemplo...");
  const ticketsToCreate = 8;
  for (let i = 0; i < ticketsToCreate; i++) {
    const ticketDate = new Date(startDate);
    ticketDate.setDate(startDate.getDate() + i);
    ticketDate.setHours(10 + (i % 6), 10 + (i % 5) * 8, 0, 0);

    const firstProductIdx = i % productIds.length;
    const secondProductIdx = (i + 2) % productIds.length;
    const selections = [firstProductIdx, secondProductIdx].filter(
      (idx) => stock[idx] > 0,
    );

    if (selections.length === 0) continue;

    let total = 0;
    const ticketId = Crypto.randomUUID();
    const ticketItems: { idx: number; qty: number }[] = [];

    for (const idx of selections) {
      const qty = Math.min(2, stock[idx]);
      if (qty <= 0) continue;
      ticketItems.push({ idx, qty });
      total += qty * salePrices[idx];
      stock[idx] -= qty;
    }

    if (ticketItems.length === 0) continue;

    await db.runAsync(
      `INSERT INTO tickets (id, createdAt, paymentMethod, total, itemCount, workerId, workerName, storeId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ticketId,
      fmtDatetime(ticketDate),
      i % 3 === 0 ? "CARD" : "CASH",
      total,
      ticketItems.length,
      workerId,
      BASIC_WORKER.name,
      storeId,
    );

    for (const item of ticketItems) {
      const unitPrice = salePrices[item.idx];
      await db.runAsync(
        `INSERT INTO ticket_items (ticketId, productId, productName, quantity, unitPrice, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ticketId,
        productIds[item.idx],
        productNames[item.idx],
        item.qty,
        unitPrice,
        item.qty * unitPrice,
      );
    }
  }

  onProgress?.("Actualizando stock...");
  for (let i = 0; i < productIds.length; i++) {
    await db.runAsync(
      `UPDATE products SET stockBaseQty = ? WHERE id = ?`,
      Math.max(0, stock[i]),
      productIds[i],
    );
  }

  onProgress?.("Agregando gastos básicos...");
  const baseDate = fmt(startDate).slice(0, 7);
  await db.runAsync(
    `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
     VALUES ('TRANSPORT', ?, ?, ?, ?, ?)`,
    "Flete de mercancía",
    220,
    `${baseDate}-05`,
    storeId,
    `${baseDate}-05 12:00:00`,
  );
  await db.runAsync(
    `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
     VALUES ('SUPPLIES', ?, ?, ?, ?, ?)`,
    "Bolsas y artículos de mostrador",
    140,
    `${baseDate}-08`,
    storeId,
    `${baseDate}-08 11:00:00`,
  );
  await db.runAsync(
    `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
     VALUES ('OTHER', ?, ?, ?, ?, ?)`,
    "Limpieza general",
    90,
    `${baseDate}-10`,
    storeId,
    `${baseDate}-10 16:00:00`,
  );

  onProgress?.("¡Simulación básica completada!");
}

// ── Seed simulation ──────────────────────────────────────────────────────────

export async function seedSimulation(
  db: SQLiteDatabase,
  storeId: number,
  onProgress?: (msg: string) => void,
) {
  const now = new Date();
  const startDate = new Date(now.getFullYear() - 1, 0, 1);

  onProgress?.("Creando trabajadores...");

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
      storeId,
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
      `INSERT INTO suppliers (name, contactName, phone, email, address, storeId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      s.name,
      s.contactName,
      s.phone,
      s.email,
      s.address,
      storeId,
      fmtDatetime(startDate),
    );
    supplierIds.push(result.lastInsertRowId);
  }

  onProgress?.("Creando productos...");

  // ── 3. Create products ─────────────────────────────────────────────────────
  const productIds: number[] = [];
  const productPrices: number[] = [];
  const productNames: string[] = [];
  const productSupplierIdx: number[] = [];

  for (let pi = 0; pi < PRODUCTS_DATA.length; pi++) {
    const p = PRODUCTS_DATA[pi];
    const profile = PROFILES[pi];
    const markup = 1.25 + rand() * 0.3;
    const salePx = Math.round(p.price * markup * 100) / 100;
    const costPx = Math.round(salePx * profile.costPct * 100) / 100;

    const result = await db.runAsync(
      `INSERT INTO products (name, code, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode, details, storeId)
       VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)`,
      p.name,
      p.code,
      p.price,
      costPx,
      salePx,
      p.unit,
      p.mode,
      p.details ?? null,
      storeId,
    );
    productIds.push(result.lastInsertRowId);
    productPrices.push(salePx);
    productNames.push(p.name);
    productSupplierIdx.push(p.supplier);
  }

  const stock: number[] = productIds.map(() => 0);

  // ── 4. Generate working days ───────────────────────────────────────────────
  const workingDays: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const dow = cursor.getDay();
    // Lunes (1) a Sábado (6), domingo (0) no se trabaja
    if (dow >= 1 && dow <= 6) {
      workingDays.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  onProgress?.(`Simulando ${workingDays.length} días laborales...`);

  // ── 5. Initial stock purchase ──────────────────────────────────────────────
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
    storeId, // <--- Pasamos el storeId
  );

  // ── 6. Day-by-day simulation ───────────────────────────────────────────────
  let dayCount = 0;
  let purchaseDayCounter = 0;

  for (const day of workingDays) {
    dayCount++;
    purchaseDayCounter++;

    const weekNum = Math.floor(dayCount / 6);
    const teamA = [0, 1];
    const teamB = [2, 3];
    const todayTeam = weekNum % 2 === 0 ? teamA : teamB;

    if (purchaseDayCounter >= 5) {
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
        storeId, // <--- Pasamos el storeId
      );
    }

    const morningTickets = randInt(4, 7);
    const afternoonTickets = randInt(3, 6);
    const eveningTickets = randInt(2, 4);
    const totalTickets = morningTickets + afternoonTickets + eveningTickets;

    for (let t = 0; t < totalTickets; t++) {
      let hour: number;
      let minute: number;
      if (t < morningTickets) {
        // Mañana: 8:00 – 11:59
        hour = 8 + Math.floor((t / morningTickets) * 4);
        minute = randInt(0, 59);
      } else if (t < morningTickets + afternoonTickets) {
        // Tarde: 12:00 – 14:59
        hour = 12 + Math.floor(((t - morningTickets) / afternoonTickets) * 3);
        minute = randInt(0, 59);
      } else {
        // Última franja: 15:00 – 17:59
        hour =
          15 +
          Math.floor(
            ((t - morningTickets - afternoonTickets) / eveningTickets) * 3,
          );
        minute = randInt(0, 59);
      }

      const ticketTime = new Date(day);
      ticketTime.setHours(hour, minute, randInt(0, 59));

      const wIdx = todayTeam[t % 2];
      const wId = workerIds[wIdx];
      const wName = workerNames[wIdx];

      const numItems = randInt(1, 6);
      const cartProductIdxs: number[] = [];
      const timePos = dayCount / workingDays.length;
      const available = productIds.map((_, i) => i).filter((i) => stock[i] > 0);

      if (available.length === 0) continue;

      const weights = available.map(
        (i) => PROFILES[i].pop * trendFactor(PROFILES[i].trend, timePos),
      );

      for (let ci = 0; ci < numItems; ci++) {
        if (available.length === 0) break;
        const pIdx = weightedPick(available, weights);
        if (!cartProductIdxs.includes(pIdx)) {
          cartProductIdxs.push(pIdx);
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

      // Insertamos el Ticket con su storeId
      const ticketId = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO tickets (id, createdAt, paymentMethod, total, itemCount, workerId, workerName, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ticketId,
        fmtDatetime(ticketTime),
        paymentMethod,
        ticketTotal,
        items.length,
        wId,
        wName,
        storeId, // <--- Pasamos el storeId
      );

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

    if (dayCount % 20 === 0) {
      onProgress?.(`Día ${dayCount}/${workingDays.length}...`);
    }
  }

  // ── 6b. Sync in-memory stock to DB ─────────────────────────────────────────
  onProgress?.("Actualizando stock en base de datos...");
  for (let i = 0; i < productIds.length; i++) {
    await db.runAsync(
      `UPDATE products SET stockBaseQty = ? WHERE id = ?`,
      Math.max(0, stock[i]),
      productIds[i],
    );
  }

  onProgress?.("Creando gastos mensuales...");

  // ── 7. Monthly expenses ────────────────────────────────────────────────────
  const monthStart = new Date(startDate);
  while (monthStart <= now) {
    const ym = fmt(monthStart);

    await db.runAsync(
      `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
       VALUES ('RENT', 'Renta del local mes', ?, ?, ?, ?)`,
      randInt(8000, 12000),
      `${ym.slice(0, 7)}-01`,
      storeId,
      `${ym.slice(0, 7)}-01 09:00:00`,
    );

    if ((monthStart.getMonth() + 1) % 2 === 1) {
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
         VALUES ('ELECTRICITY', 'Pago de luz bimestral', ?, ?, ?, ?)`,
        randInt(1500, 3500),
        `${ym.slice(0, 7)}-15`,
        storeId,
        `${ym.slice(0, 7)}-15 10:00:00`,
      );
    }

    const transportCount = randInt(2, 4);
    for (let i = 0; i < transportCount; i++) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
         VALUES ('TRANSPORT', ?, ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.TRANSPORT),
        randInt(150, 800),
        dateStr,
        storeId,
        `${dateStr} 12:00:00`,
      );
    }

    const suppliesCount = randInt(1, 2);
    for (let i = 0; i < suppliesCount; i++) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
         VALUES ('SUPPLIES', ?, ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.SUPPLIES),
        randInt(80, 400),
        dateStr,
        storeId,
        `${dateStr} 14:00:00`,
      );
    }

    if (rand() < 0.3) {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
         VALUES ('REPAIRS', ?, ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.REPAIRS),
        randInt(300, 3000),
        dateStr,
        storeId,
        `${dateStr} 16:00:00`,
      );
    }

    {
      const d = randInt(1, 28);
      const dateStr = `${ym.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      await db.runAsync(
        `INSERT INTO expenses (category, description, amount, date, storeId, createdAt)
         VALUES ('OTHER', ?, ?, ?, ?, ?)`,
        pick(EXPENSE_DESCS.OTHER),
        randInt(50, 300),
        dateStr,
        storeId,
        `${dateStr} 11:00:00`,
      );
    }

    monthStart.setMonth(monthStart.getMonth() + 1);
  }

  onProgress?.("¡Simulación completa!");
}

// ── Purchase batch helper ────────────────────────────────────────────────────

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
  storeId: number, // <--- Agregamos este parámetro
) {
  const supplierProducts: Map<number, number[]> = new Map();
  for (let i = 0; i < productIds.length; i++) {
    const sIdx = productSupplierIdx[i];
    if (!supplierProducts.has(sIdx)) supplierProducts.set(sIdx, []);
    supplierProducts.get(sIdx)!.push(i);
  }

  for (const [sIdx, pIdxs] of supplierProducts.entries()) {
    if (!initial && rand() < 0.1) continue;

    const items: {
      productId: number;
      productName: string;
      quantity: number;
      unitCost: number;
    }[] = [];

    const toRestock = initial
      ? pIdxs
      : pIdxs.filter((i) => PROFILES[i].restock && stock[i] < 40);

    for (const pIdx of toRestock) {
      const costPct = PROFILES[pIdx].costPct + (rand() - 0.5) * 0.04;
      const unitCost = Math.round(productPrices[pIdx] * costPct * 100) / 100;
      // Scale restock quantity with product popularity
      const pop = PROFILES[pIdx].pop;
      const qty = initial
        ? randInt(50, 100)
        : pop >= 1.5
        ? randInt(40, 80)
        : pop >= 1.0
        ? randInt(25, 50)
        : randInt(15, 35);

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

    // Pasamos el storeId a la compra
    const purchaseResult = await db.runAsync(
      `INSERT INTO purchases (supplierId, supplierName, notes, total, transportCost, itemCount, storeId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      supplierIds[sIdx],
      SUPPLIERS_DATA[sIdx].name,
      initial ? "Stock inicial" : "Resurtido periódico",
      total,
      transportCost,
      items.length,
      storeId,
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
    }
  }
}
