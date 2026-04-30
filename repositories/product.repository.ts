import type {
  CreateProductInput,
  PriceTierInput,
  Product,
  UpdateProductInput,
} from "@/models/product";
import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

export class ProductRepository extends BaseRepository<
  Product,
  CreateProductInput,
  Omit<UpdateProductInput, "priceTiers">
> {
  constructor(db: SQLiteDatabase, storeId?: number) {
    super(db, "products", storeId);
  }

  /** Compute MD5 hash of a local photo file. Returns null if file is missing. */
  private computePhotoHash(uri: string): string | null {
    try {
      const file = new File(uri);
      if (!file.exists) return null;
      return file.md5;
    } catch {
      return null;
    }
  }

  /** Map SQLite integer (0/1) to boolean for `visible` field. */
  private mapRow(row: any): Product {
    return { ...row, visible: !!row.visible };
  }

  private async findTiersByProductId(productId: number) {
    const rows = await this.db.getAllAsync<any>(
      "SELECT * FROM product_price_tiers WHERE productId = ? ORDER BY minQty ASC",
      [productId],
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      minQty: row.minQty,
      maxQty: row.maxQty,
      price: row.price,
    }));
  }

  private async attachPriceTiers(products: Product[]) {
    if (products.length === 0) return products;
    const ids = products.map((product) => product.id);
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM product_price_tiers WHERE productId IN (${placeholders}) ORDER BY productId, minQty ASC`,
      ids,
    );
    const grouped: Record<number, any[]> = {};
    for (const row of rows) {
      grouped[row.productId] = grouped[row.productId] ?? [];
      grouped[row.productId].push({
        id: row.id,
        productId: row.productId,
        minQty: row.minQty,
        maxQty: row.maxQty,
        price: row.price,
      });
    }
    return products.map((product) => ({
      ...product,
      priceTiers: grouped[product.id] ?? [],
    }));
  }

  async findAll(orderBy?: string): Promise<Product[]> {
    if (this.storeId !== undefined) {
      const rows = await this.db.getAllAsync<any>(
        `SELECT * FROM products WHERE storeId = ? ORDER BY ${
          orderBy ?? "name ASC"
        }`,
        [this.storeId],
      );
      return this.attachPriceTiers(rows.map(this.mapRow));
    }
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM products ORDER BY ${orderBy ?? "name ASC"}`,
    );
    return this.attachPriceTiers(rows.map(this.mapRow));
  }

  /** Only visible products, sorted by name. Used for worker views. */
  async findAllVisible(): Promise<Product[]> {
    if (this.storeId !== undefined) {
      const rows = await this.db.getAllAsync<any>(
        "SELECT * FROM products WHERE visible = 1 AND storeId = ? ORDER BY name ASC",
        [this.storeId],
      );
      return this.attachPriceTiers(rows.map(this.mapRow));
    }
    const rows = await this.db.getAllAsync<any>(
      "SELECT * FROM products WHERE visible = 1 ORDER BY name ASC",
    );
    return this.attachPriceTiers(rows.map(this.mapRow));
  }

  async findById(id: number): Promise<Product | null> {
    const row = await this.db.getFirstAsync<any>(
      "SELECT * FROM products WHERE id = ?",
      [id],
    );
    if (!row) return null;
    const product = this.mapRow(row);
    product.priceTiers = await this.findTiersByProductId(id);
    return product;
  }

  async findByCode(code: string): Promise<Product | null> {
    if (this.storeId !== undefined) {
      const row = await this.db.getFirstAsync<any>(
        "SELECT * FROM products WHERE code = ? AND storeId = ?",
        [code, this.storeId],
      );
      return row ? this.findById(row.id) : null;
    }
    const row = await this.db.getFirstAsync<any>(
      "SELECT * FROM products WHERE code = ?",
      [code],
    );
    return row ? this.findById(row.id) : null;
  }

  /** Find a visible product by code (for worker scanner). */
  async findVisibleByCode(code: string): Promise<Product | null> {
    if (this.storeId !== undefined) {
      const row = await this.db.getFirstAsync<any>(
        "SELECT * FROM products WHERE code = ? AND visible = 1 AND storeId = ?",
        [code, this.storeId],
      );
      return row ? this.findById(row.id) : null;
    }
    const row = await this.db.getFirstAsync<any>(
      "SELECT * FROM products WHERE code = ? AND visible = 1",
      [code],
    );
    return row ? this.findById(row.id) : null;
  }

  async create(input: CreateProductInput): Promise<Product> {
    await this.db.runAsync(
      `INSERT INTO products (name, code, pricePerBaseUnit, costPrice, salePrice, visible, baseUnitId, stockBaseQty, saleMode, photoUri, details, storeId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.code,
      input.costPrice,
      input.costPrice,
      input.salePrice,
      input.visible ? 1 : 0,
      input.baseUnitId,
      input.stockBaseQty,
      input.saleMode,
      input.photoUri ?? null,
      input.details ?? null,
      this.storeId ?? 1,
    );
    const created = await this.findByCode(input.code);
    if (!created) throw new Error("Producto creado pero no encontrado");

    if (created.photoUri) {
      const hash = this.computePhotoHash(created.photoUri);
      if (hash) {
        await this.db.runAsync(
          "UPDATE products SET photoHash = ?, cloudPhotoPath = NULL WHERE id = ?",
          hash,
          created.id,
        );
      }
    }

    if (input.priceTiers && input.priceTiers.length > 0) {
      await this.savePriceTiers(created.id, input.priceTiers);
    }

    const final = await this.findById(created.id);
    if (!final) throw new Error("Error al obtener producto creado");
    return final;
  }

  async update(id: number, input: UpdateProductInput): Promise<Product> {
    const sets: string[] = [];
    const vals: any[] = [];

    const map: Record<string, string> = {
      name: "name",
      code: "code",
      costPrice: "costPrice",
      salePrice: "salePrice",
      pricePerBaseUnit: "pricePerBaseUnit",
      baseUnitId: "baseUnitId",
      stockBaseQty: "stockBaseQty",
      saleMode: "saleMode",
      photoUri: "photoUri",
      details: "details",
    };

    for (const [key, col] of Object.entries(map)) {
      if ((input as any)[key] !== undefined) {
        sets.push(`${col} = ?`);
        vals.push((input as any)[key]);
      }
    }

    if (input.visible !== undefined) {
      sets.push("visible = ?");
      vals.push(input.visible ? 1 : 0);
    }

    // When photo changes, recompute hash and clear cloud path
    if (input.photoUri !== undefined) {
      const hash = input.photoUri
        ? this.computePhotoHash(input.photoUri)
        : null;
      sets.push("photoHash = ?");
      vals.push(hash);
      sets.push("cloudPhotoPath = ?");
      vals.push(null);
    }

    // Keep pricePerBaseUnit in sync with costPrice for backward compat
    if (input.costPrice !== undefined && input.pricePerBaseUnit === undefined) {
      sets.push("pricePerBaseUnit = ?");
      vals.push(input.costPrice);
    }

    if (sets.length > 0) {
      vals.push(id);
      await this.db.runAsync(
        `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
        ...vals,
      );
    }

    if (input.priceTiers !== undefined) {
      await this.savePriceTiers(id, input.priceTiers);
    }

    const updated = await this.findById(id);
    if (!updated) throw new Error("Producto no encontrado");
    return updated;
  }

  private async savePriceTiers(
    productId: number,
    tiers: PriceTierInput[],
  ): Promise<void> {
    await this.db.runAsync(
      "DELETE FROM product_price_tiers WHERE productId = ?",
      productId,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [index, tier] of tiers.entries()) {
      await this.db.runAsync(
        "INSERT INTO product_price_tiers (productId, minQty, maxQty, price) VALUES (?, ?, ?, ?)",
        productId,
        tier.minQty,
        tier.maxQty,
        tier.price,
      );
    }
  }

  /** Bulk-update sale prices for multiple products. */
  async bulkUpdateSalePrice(
    updates: { id: number; salePrice: number }[],
  ): Promise<void> {
    for (const u of updates) {
      await this.db.runAsync(
        "UPDATE products SET salePrice = ? WHERE id = ?",
        u.salePrice,
        u.id,
      );
    }
  }
}
