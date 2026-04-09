import { STORAGE_KEYS } from "@/constants/storage-keys";
import { clearDataConnection } from "@/services/supabase/client";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type DeviceRole = "ADMIN" | "WORKER" | "DISPLAY";

// Re-export so existing consumers keep working
export { STORAGE_KEYS } from "@/constants/storage-keys";

const KEYS = STORAGE_KEYS;

// ── Device ID ────────────────────────────────────────────────────────────────

export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEYS.deviceId);
  if (existing) return existing;

  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEYS.deviceId, id);
  return id;
}

// ── Device Role ──────────────────────────────────────────────────────────────

export async function getDeviceRole(): Promise<DeviceRole | null> {
  const role = await SecureStore.getItemAsync(KEYS.deviceRole);
  if (role === "ADMIN" || role === "WORKER" || role === "DISPLAY") return role;
  return null;
}

export async function setDeviceRole(role: DeviceRole): Promise<void> {
  await SecureStore.setItemAsync(KEYS.deviceRole, role);
}

export async function clearDeviceRole(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.deviceRole);
}

// ── Activation (Admin only) ──────────────────────────────────────────────────

export async function getActivationStatus(): Promise<{
  activated: boolean;
  businessId: string | null;
}> {
  const activated = await SecureStore.getItemAsync(KEYS.activated);
  const businessId = await SecureStore.getItemAsync(KEYS.businessId);
  return {
    activated: activated === "true",
    businessId: businessId ?? null,
  };
}

export async function saveActivation(businessId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.activated, "true");
  await SecureStore.setItemAsync(KEYS.businessId, businessId);
}

export async function clearActivation(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.activated);
  await SecureStore.deleteItemAsync(KEYS.businessId);
  await clearDataConnection();
}

// ── Device Info (for Supabase metadata + LAN identification) ─────────────────

export interface DeviceInfo {
  os: string;
  osVersion: string | null;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  deviceYearClass: number | null;
  totalMemory: number | null;
  appName: string | null;
  appVersion: string | null;
  buildVersion: string | null;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    os: Platform.OS,
    osVersion: Platform.Version?.toString() ?? null,
    brand: Device.brand ?? null,
    manufacturer: Device.manufacturer ?? null,
    modelName: Device.modelName ?? null,
    deviceYearClass: Device.deviceYearClass ?? null,
    totalMemory: Device.totalMemory ?? null,
    appName: Application.applicationName,
    appVersion: Application.nativeApplicationVersion,
    buildVersion: Application.nativeBuildVersion,
  };
}

/** Short human-readable label, e.g. "Samsung Galaxy S24 · Android 14" */
export function formatDeviceLabel(info: Partial<DeviceInfo>): string {
  const parts: string[] = [];
  const model = info.modelName ?? info.brand;
  if (model) parts.push(model);
  if (info.os && info.osVersion) {
    const osName = info.os === "ios" ? "iOS" : "Android";
    parts.push(`${osName} ${info.osVersion}`);
  }
  if (info.appVersion) parts.push(`v${info.appVersion}`);
  return parts.join(" · ") || "Dispositivo desconocido";
}
