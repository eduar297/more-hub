import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type DeviceRole = "ADMIN" | "WORKER" | "DISPLAY";

const KEYS = {
  deviceId: "morehub_device_id",
  deviceRole: "morehub_device_role",
  activated: "morehub_activated",
  businessId: "morehub_business_id",
} as const;

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
}

// ── Device Info (for Supabase metadata) ──────────────────────────────────────

export async function getDeviceInfo(): Promise<Record<string, string | null>> {
  return {
    os: Platform.OS,
    osVersion: Platform.Version?.toString() ?? null,
    appName: Application.applicationName,
    appVersion: Application.nativeApplicationVersion,
    buildVersion: Application.nativeBuildVersion,
  };
}
