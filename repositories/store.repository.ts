import type { CreateStoreInput, Store, UpdateStoreInput } from "@/models/store";
import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

export class StoreRepository extends BaseRepository<
  Store,
  CreateStoreInput,
  UpdateStoreInput
> {
  constructor(db: SQLiteDatabase) {
    super(db, "stores");
  }

  /** Compute MD5 hash of a local logo file. Returns null if file is missing. */
  private computeLogoHash(uri: string): string | null {
    try {
      const file = new File(uri);
      if (!file.exists) return null;
      return file.md5;
    } catch {
      return null;
    }
  }

  findAll(): Promise<Store[]> {
    return super.findAll("name ASC");
  }

  async create(input: CreateStoreInput): Promise<Store> {
    const result = await this.db.runAsync(
      `INSERT INTO stores (name, address, phone, logoUri, color) VALUES (?, ?, ?, ?, ?)`,
      input.name,
      input.address ?? null,
      input.phone ?? null,
      input.logoUri ?? null,
      input.color ?? "#3b82f6",
    );
    const created = await this.findById(result.lastInsertRowId);
    if (!created) throw new Error("Tienda creada pero no encontrada");

    // If a logo was provided, compute its hash and clear cloud path
    if (created.logoUri) {
      const hash = this.computeLogoHash(created.logoUri);
      if (hash) {
        await this.db.runAsync(
          "UPDATE stores SET logoHash = ?, cloudLogoPath = NULL WHERE id = ?",
          hash,
          created.id,
        );
        return { ...created, logoHash: hash, cloudLogoPath: null };
      }
    }
    return created;
  }

  async update(id: number | string, input: UpdateStoreInput): Promise<Store> {
    // When logo changes, recompute hash and clear cloud path
    if (input.logoUri !== undefined) {
      const hash = input.logoUri ? this.computeLogoHash(input.logoUri) : null;
      await super.update(id, input);
      await this.db.runAsync(
        "UPDATE stores SET logoHash = ?, cloudLogoPath = NULL WHERE id = ?",
        hash,
        id,
      );
      const updated = await this.findById(id);
      if (!updated) throw new Error("Tienda no encontrada tras actualizar");
      return updated;
    }
    return super.update(id, input);
  }
}
