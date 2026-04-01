import type { PairedDevice } from "@/models/paired-device";
import type { SQLiteDatabase } from "expo-sqlite";

export class PairingRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly storeId: number,
  ) {}

  async findByDeviceId(deviceId: string): Promise<PairedDevice | null> {
    return this.db.getFirstAsync<PairedDevice>(
      "SELECT * FROM paired_devices WHERE deviceId = ? AND storeId = ?",
      [deviceId, this.storeId],
    );
  }

  async findAll(): Promise<PairedDevice[]> {
    return this.db.getAllAsync<PairedDevice>(
      "SELECT * FROM paired_devices WHERE storeId = ? ORDER BY lastConnected DESC",
      [this.storeId],
    );
  }

  async savePairing(deviceId: string, deviceName?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO paired_devices (deviceId, deviceName, lastConnected, storeId)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(deviceId) DO UPDATE SET
         deviceName = COALESCE(excluded.deviceName, deviceName),
         lastConnected = excluded.lastConnected`,
      [deviceId, deviceName ?? null, now, this.storeId],
    );
  }

  async updateLastConnected(deviceId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      "UPDATE paired_devices SET lastConnected = ? WHERE deviceId = ? AND storeId = ?",
      [now, deviceId, this.storeId],
    );
  }

  async removePairing(deviceId: string): Promise<void> {
    await this.db.runAsync(
      "DELETE FROM paired_devices WHERE deviceId = ? AND storeId = ?",
      [deviceId, this.storeId],
    );
  }
}
