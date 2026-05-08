import type { Ticket, TicketItem } from "@/models/ticket";
import { buildReceiptBytes, buildTestBytes } from "@/utils/receipt-escpos";
import { Buffer } from "buffer";
import { useSQLiteContext } from "expo-sqlite";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  BleManager,
  Characteristic,
  Device,
  Subscription,
} from "react-native-ble-plx";

// Standard GATT services we never want to write to.
const STANDARD_SERVICE_PREFIXES = [
  "00001800-", // Generic Access
  "00001801-", // Generic Attribute
  "0000180a-", // Device Information
  "0000180f-", // Battery Service
];

export interface RecentPrinter {
  id: string;
  name: string;
  lastConnectedAt: string;
}

interface PrinterContextValue {
  /** Bluetooth peripheral identifier (MAC on Android, UUID on iOS). */
  printerAddress: string | null;
  /** Friendly name reported by the device. */
  printerName: string | null;
  /** Whether to print a receipt automatically on every confirmed sale. */
  autoPrint: boolean;
  /** True while we hold an open Bluetooth connection. */
  connected: boolean;
  /** True while we're scanning for nearby BLE devices. */
  scanning: boolean;
  /** True while a print job is in flight. */
  printing: boolean;
  /** Last error surfaced to the UI. */
  error: string | null;
  /** Devices found by the most recent scan. */
  devices: Device[];
  /** Up to 5 most recently connected printers, newest first. */
  recentPrinters: RecentPrinter[];

  /** Run a BLE scan and update `devices`. */
  scan: () => Promise<void>;
  /** Stop the current scan early. */
  stopScan: () => void;
  /** Persist & connect to the chosen device. */
  connect: (device: Device) => Promise<void>;
  /** Connect to a recently-used printer by its stored id/name. */
  connectRecent: (recent: RecentPrinter) => Promise<void>;
  /** Forget the saved printer and disconnect. */
  forget: () => Promise<void>;
  /** Remove one entry from the recent-connections list. */
  forgetRecent: (id: string) => Promise<void>;
  /** Toggle the auto-print preference. */
  setAutoPrint: (v: boolean) => Promise<void>;
  /** Print a single ticket. */
  printTicket: (
    ticket: Ticket,
    items: TicketItem[],
    storeName?: string | null,
  ) => Promise<void>;
  /** Print the test page used from the settings screen. */
  printTest: (storeName?: string | null) => Promise<void>;
}

const PrinterContext = createContext<PrinterContextValue>({
  printerAddress: null,
  printerName: null,
  autoPrint: false,
  connected: false,
  scanning: false,
  printing: false,
  error: null,
  devices: [],
  recentPrinters: [],
  scan: async () => {},
  stopScan: () => {},
  connect: async () => {},
  connectRecent: async () => {},
  forget: async () => {},
  forgetRecent: async () => {},
  setAutoPrint: async () => {},
  printTicket: async () => {},
  printTest: async () => {},
});

const KEY_ADDR = "printer.address";
const KEY_NAME = "printer.name";
const KEY_AUTO = "printer.autoPrint";
const KEY_HISTORY = "printer.history";
const MAX_HISTORY = 5;

async function ensureAndroidBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      "android.permission.BLUETOOTH_SCAN" as never,
      "android.permission.BLUETOOTH_CONNECT" as never,
    ]);
    return Object.values(result).every((v) => v === "granted");
  }
  const result = await PermissionsAndroid.request(
    "android.permission.ACCESS_FINE_LOCATION" as never,
  );
  return result === "granted";
}

/**
 * Scan a connected device's services for a writable characteristic.
 * Generic-purpose: works with any BLE thermal printer (Nordic UART, HM-10,
 * 18F0/2AF1, FFE0/FFE1 — we don't hardcode any vendor UUID).
 */
async function findWritableCharacteristic(
  device: Device,
): Promise<Characteristic | null> {
  const services = await device.services();
  for (const svc of services) {
    const lowered = svc.uuid.toLowerCase();
    if (STANDARD_SERVICE_PREFIXES.some((p) => lowered.startsWith(p))) continue;
    const chars = await svc.characteristics();
    const writable = chars.find(
      (c) => c.isWritableWithResponse || c.isWritableWithoutResponse,
    );
    if (writable) return writable;
  }
  return null;
}

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const manager = useMemo(() => new BleManager(), []);

  const [printerAddress, setPrinterAddress] = useState<string | null>(null);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [autoPrint, setAutoPrintState] = useState(false);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [recentPrinters, setRecentPrinters] = useState<RecentPrinter[]>([]);

  const connectedDeviceRef = useRef<Device | null>(null);
  const writableCharRef = useRef<Characteristic | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?)",
        [KEY_ADDR, KEY_NAME, KEY_AUTO, KEY_HISTORY],
      );
      for (const r of rows) {
        if (r.key === KEY_ADDR) setPrinterAddress(r.value || null);
        else if (r.key === KEY_NAME) setPrinterName(r.value || null);
        else if (r.key === KEY_AUTO) setAutoPrintState(r.value === "1");
        else if (r.key === KEY_HISTORY) {
          try {
            setRecentPrinters(JSON.parse(r.value) as RecentPrinter[]);
          } catch {
            // malformed JSON — ignore
          }
        }
      }
    })().catch((e) => console.warn("[Printer] load settings:", e));
  }, [db]);

  const writeSetting = useCallback(
    async (key: string, value: string | null) => {
      if (value === null) {
        await db.runAsync("DELETE FROM app_settings WHERE key = ?", [key]);
      } else {
        await db.runAsync(
          "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
          [key, value],
        );
      }
    },
    [db],
  );

  const pushToHistory = useCallback(
    async (id: string, name: string | null) => {
      setRecentPrinters((prev) => {
        const entry: RecentPrinter = {
          id,
          name: name ?? id,
          lastConnectedAt: new Date().toISOString(),
        };
        const filtered = prev.filter((r) => r.id !== id);
        const next = [entry, ...filtered].slice(0, MAX_HISTORY);
        writeSetting(KEY_HISTORY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [writeSetting],
  );

  const forgetRecent = useCallback(
    async (id: string) => {
      setRecentPrinters((prev) => {
        const next = prev.filter((r) => r.id !== id);
        writeSetting(KEY_HISTORY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [writeSetting],
  );

  const stopScan = useCallback(() => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    manager.stopDeviceScan();
    setScanning(false);
  }, [manager]);

  const disconnectDevice = useCallback(async () => {
    if (disconnectSubRef.current) {
      disconnectSubRef.current.remove();
      disconnectSubRef.current = null;
    }
    const dev = connectedDeviceRef.current;
    connectedDeviceRef.current = null;
    writableCharRef.current = null;
    setConnected(false);
    if (dev) {
      try {
        await manager.cancelDeviceConnection(dev.id);
      } catch {
        // Already disconnected — ignore.
      }
    }
  }, [manager]);

  // Disconnect & destroy on unmount
  useEffect(() => {
    return () => {
      disconnectDevice();
      manager.destroy();
    };
  }, [disconnectDevice, manager]);

  /**
   * Connect to a device by id. Performs MTU negotiation (Android) and finds
   * the writable characteristic. Idempotent if we're already connected.
   */
  const connectById = useCallback(
    async (id: string, name: string | null) => {
      if (connectedDeviceRef.current?.id === id && writableCharRef.current) {
        return;
      }
      await disconnectDevice();

      let dev = await manager.connectToDevice(id, { timeout: 10000 });

      // Bump MTU on Android — default 23 bytes is painfully slow. iOS
      // negotiates automatically on connect, so the call is a no-op there.
      if (Platform.OS === "android") {
        try {
          dev = await dev.requestMTU(247);
        } catch {
          // Some BLE chips reject MTU negotiation; carry on with default.
        }
      }

      await dev.discoverAllServicesAndCharacteristics();
      const writable = await findWritableCharacteristic(dev);
      if (!writable) {
        await manager.cancelDeviceConnection(dev.id).catch(() => {});
        throw new Error(
          "Esa impresora no tiene una característica BLE que permita escribir.",
        );
      }

      disconnectSubRef.current = manager.onDeviceDisconnected(dev.id, () => {
        connectedDeviceRef.current = null;
        writableCharRef.current = null;
        setConnected(false);
      });

      connectedDeviceRef.current = dev;
      writableCharRef.current = writable;
      setConnected(true);
      setPrinterAddress(dev.id);
      setPrinterName(name ?? dev.name ?? null);
    },
    [disconnectDevice, manager],
  );

  const connect = useCallback(
    async (device: Device) => {
      setError(null);
      stopScan();
      try {
        await connectById(device.id, device.name ?? null);
        await writeSetting(KEY_ADDR, device.id);
        await writeSetting(KEY_NAME, device.name ?? "");
        await pushToHistory(device.id, device.name ?? null);
      } catch (e) {
        setError(
          `No se pudo conectar a ${device.name ?? device.id}: ` +
            ((e as Error).message ?? String(e)),
        );
        throw e;
      }
    },
    [connectById, stopScan, writeSetting, pushToHistory],
  );

  const connectRecent = useCallback(
    async (recent: RecentPrinter) => {
      setError(null);
      stopScan();
      try {
        await connectById(recent.id, recent.name);
        await writeSetting(KEY_ADDR, recent.id);
        await writeSetting(KEY_NAME, recent.name);
        await pushToHistory(recent.id, recent.name);
      } catch (e) {
        setError(
          `No se pudo conectar a ${recent.name}: ` +
            ((e as Error).message ?? String(e)),
        );
        throw e;
      }
    },
    [connectById, stopScan, writeSetting, pushToHistory],
  );

  const scan = useCallback(async () => {
    setError(null);
    if (!(await ensureAndroidBluetoothPermissions())) {
      setError("Permisos de Bluetooth denegados.");
      return;
    }
    const state = await manager.state();
    if (state !== "PoweredOn") {
      setError("Enciende el Bluetooth y vuelve a buscar.");
      return;
    }

    stopScan();
    setScanning(true);
    setDevices([]);
    const found = new Map<string, Device>();

    manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) {
        setError("Error al escanear: " + err.message);
        stopScan();
        return;
      }
      if (device && device.name) {
        found.set(device.id, device);
        setDevices(Array.from(found.values()));
      }
    });

    scanTimerRef.current = setTimeout(stopScan, 8000);
  }, [manager, stopScan]);

  const forget = useCallback(async () => {
    await disconnectDevice();
    setPrinterAddress(null);
    setPrinterName(null);
    await writeSetting(KEY_ADDR, null);
    await writeSetting(KEY_NAME, null);
  }, [disconnectDevice, writeSetting]);

  const setAutoPrint = useCallback(
    async (v: boolean) => {
      setAutoPrintState(v);
      await writeSetting(KEY_AUTO, v ? "1" : "0");
    },
    [writeSetting],
  );

  /**
   * Send raw ESC/POS bytes to the connected printer in BLE-sized chunks.
   * Each chunk is base64-encoded independently — splitting an already-encoded
   * base64 string would corrupt the payload.
   */
  const writeBytes = useCallback(async (bytes: Uint8Array) => {
    const dev = connectedDeviceRef.current;
    const ch = writableCharRef.current;
    if (!dev || !ch) throw new Error("Impresora no conectada.");

    const mtu = (dev.mtu && dev.mtu > 23 ? dev.mtu : 23) - 3;
    const chunkSize = Math.max(20, mtu);
    const useResponse = !ch.isWritableWithoutResponse;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      const b64 = Buffer.from(slice).toString("base64");
      if (useResponse) {
        await dev.writeCharacteristicWithResponseForService(
          ch.serviceUUID,
          ch.uuid,
          b64,
        );
      } else {
        await dev.writeCharacteristicWithoutResponseForService(
          ch.serviceUUID,
          ch.uuid,
          b64,
        );
      }
    }
  }, []);

  const printBytes = useCallback(
    async (bytes: Uint8Array) => {
      setError(null);
      if (!printerAddress) {
        const msg =
          "No hay impresora — abre Configuración → Impresora y conecta una.";
        setError(msg);
        throw new Error(msg);
      }
      setPrinting(true);
      try {
        await connectById(printerAddress, printerName);
        await writeBytes(bytes);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        setError("Error al imprimir: " + msg);
        await disconnectDevice();
        throw e;
      } finally {
        setPrinting(false);
      }
    },
    [printerAddress, printerName, connectById, writeBytes, disconnectDevice],
  );

  const printTicket = useCallback(
    (ticket: Ticket, items: TicketItem[], storeName?: string | null) =>
      printBytes(buildReceiptBytes({ ticket, items, storeName })),
    [printBytes],
  );

  const printTest = useCallback(
    (storeName?: string | null) => printBytes(buildTestBytes(storeName)),
    [printBytes],
  );

  const value = useMemo<PrinterContextValue>(
    () => ({
      printerAddress,
      printerName,
      autoPrint,
      connected,
      scanning,
      printing,
      error,
      devices,
      recentPrinters,
      scan,
      stopScan,
      connect,
      connectRecent,
      forget,
      forgetRecent,
      setAutoPrint,
      printTicket,
      printTest,
    }),
    [
      printerAddress,
      printerName,
      autoPrint,
      connected,
      scanning,
      printing,
      error,
      devices,
      recentPrinters,
      scan,
      stopScan,
      connect,
      connectRecent,
      forget,
      forgetRecent,
      setAutoPrint,
      printTicket,
      printTest,
    ],
  );

  return (
    <PrinterContext.Provider value={value}>{children}</PrinterContext.Provider>
  );
}

export function usePrinter() {
  return useContext(PrinterContext);
}
