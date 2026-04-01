export interface PairedDevice {
  id: number;
  deviceId: string;
  deviceName: string | null;
  lastConnected: string | null;
  storeId: number;
}
