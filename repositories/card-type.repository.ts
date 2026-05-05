import type {
    CardType,
    CreateCardTypeInput,
    UpdateCardTypeInput,
} from "@/models/card-type";
import { BaseRepository } from "./base.repository";

export class CardTypeRepository extends BaseRepository<CardType> {
  constructor(db: any, storeId: number) {
    super(db, "card_types", storeId);
  }

  async create(input: CreateCardTypeInput): Promise<CardType> {
    const result = await this.db.runAsync(
      `INSERT INTO card_types (
        name, description, cardNumber, isActive, storeId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        input.name,
        input.description,
        input.cardNumber,
        input.isActive ? 1 : 0,
        this.storeId,
      ],
    );

    const cardType = await this.findById(result.lastInsertRowId);
    if (!cardType) throw new Error("Failed to create card type");
    return cardType;
  }

  async update(id: number, input: UpdateCardTypeInput): Promise<CardType> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      fields.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push("description = ?");
      values.push(input.description);
    }
    if (input.cardNumber !== undefined) {
      fields.push("cardNumber = ?");
      values.push(input.cardNumber);
    }
    if (input.isActive !== undefined) {
      fields.push("isActive = ?");
      values.push(input.isActive ? 1 : 0);
    }

    fields.push("updatedAt = datetime('now')");
    values.push(id, this.storeId);

    await this.db.runAsync(
      `UPDATE card_types SET ${fields.join(", ")} 
       WHERE id = ? AND storeId = ?`,
      values,
    );

    const cardType = await this.findById(id);
    if (!cardType) throw new Error("Card type not found");
    return cardType;
  }

  async findAllActive(): Promise<CardType[]> {
    const result = await this.db.getAllAsync(
      `SELECT * FROM card_types 
       WHERE storeId = ? AND isActive = 1 
       ORDER BY name ASC`,
      [this.storeId],
    );

    return result.map(this.parseRow);
  }

  async findAll(): Promise<CardType[]> {
    const result = await this.db.getAllAsync(
      `SELECT * FROM card_types 
       WHERE storeId = ? 
       ORDER BY isActive DESC, name ASC`,
      [this.storeId],
    );

    return result.map(this.parseRow);
  }

  async findById(id: number): Promise<CardType | null> {
    const result = await this.db.getFirstAsync(
      `SELECT * FROM card_types WHERE id = ? AND storeId = ?`,
      [id, this.storeId],
    );

    if (!result) return null;
    return this.parseRow(result);
  }

  async delete(id: number): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM card_types WHERE id = ? AND storeId = ?`,
      [id, this.storeId],
    );
  }

  protected parseRow(row: any): CardType {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.isActive),
      storeId: row.storeId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
