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
  constructor(db: SQLiteDatabase) {
    super(db, "users");
  }

  findAll(): Promise<User[]> {
    return super.findAll("name ASC");
  }

  findByRole(role: UserRole): Promise<User[]> {
    return this.db.getAllAsync<User>(
      "SELECT * FROM users WHERE role = ? ORDER BY name ASC",
      [role],
    );
  }

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.runAsync(
      "INSERT INTO users (name, role, pinHash) VALUES (?, ?, ?)",
      input.name,
      input.role,
      input.pinHash,
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
