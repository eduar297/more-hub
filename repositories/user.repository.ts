import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserRole,
} from "@/models/user";
import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { BaseRepository } from "./base.repository";

export class UserRepository extends BaseRepository<
  User,
  CreateUserInput,
  UpdateUserInput
> {
  constructor(db: SQLiteDatabase, storeId?: number) {
    super(db, "users", storeId);
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

  findAll(): Promise<User[]> {
    return super.findAll("name ASC");
  }

  findByRole(role: UserRole): Promise<User[]> {
    // Admin is global (no storeId) — never filter by store
    if (role === "ADMIN") {
      return this.db.getAllAsync<User>(
        "SELECT * FROM users WHERE role = 'ADMIN' ORDER BY name ASC",
      );
    }
    if (this.storeId !== undefined) {
      return this.db.getAllAsync<User>(
        "SELECT * FROM users WHERE role = ? AND storeId = ? ORDER BY name ASC",
        [role, this.storeId],
      );
    }
    return this.db.getAllAsync<User>(
      "SELECT * FROM users WHERE role = ? ORDER BY name ASC",
      [role],
    );
  }

  async create(input: CreateUserInput): Promise<User> {
    // Admin is global (storeId = NULL), workers get a store
    const storeId = input.role === "ADMIN" ? null : this.storeId ?? 1;
    const result = await this.db.runAsync(
      "INSERT INTO users (name, role, pinHash, storeId) VALUES (?, ?, ?, ?)",
      input.name,
      input.role,
      input.pinHash,
      storeId,
    );
    const created = await this.findById(result.lastInsertRowId);
    if (!created) throw new Error("Usuario creado pero no encontrado");
    return created;
  }

  async verifyPin(id: number, pinHash: string): Promise<boolean> {
    const user = await this.findById(id);
    return user?.pinHash === pinHash;
  }

  async update(id: number | string, input: UpdateUserInput): Promise<User> {
    // When photo changes, recompute hash and clear cloud path
    if (input.photoUri !== undefined) {
      const hash = input.photoUri
        ? this.computePhotoHash(input.photoUri)
        : null;
      await super.update(id, input);
      await this.db.runAsync(
        "UPDATE users SET photoHash = ?, cloudPhotoPath = NULL WHERE id = ?",
        hash,
        id,
      );
      const updated = await this.findById(id);
      if (!updated) throw new Error("Usuario no encontrado tras actualizar");
      return updated;
    }
    return super.update(id, input);
  }
}
