import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserRole,
} from "@/models/user";
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
    const storeId = input.role === "ADMIN" ? null : (this.storeId ?? 1);
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
}
