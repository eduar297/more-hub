import type { SQLiteDatabase } from "expo-sqlite";

export async function seedUnits(db: SQLiteDatabase) {
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM unit_categories",
  );

  if ((count?.count ?? 0) > 0) return;

  await db.execAsync(`
    INSERT INTO unit_categories (name) VALUES
    ('Peso'),
    ('Volumen'),
    ('Longitud'),
    ('Unidad');

    INSERT INTO units (name, symbol, categoryId, toBaseFactor) VALUES
    ('kilogramo','kg',1,1),
    ('gramo','g',1,0.001),

    ('litro','L',2,1),
    ('mililitro','ml',2,0.001),

    ('metro','m',3,1),
    ('centimetro','cm',3,0.01),

    ('unidad','u',4,1),
    ('paquete','paq',4,1),
    ('saco','sac',4,1),
    ('rollo','roll',4,1);
  `);
}
