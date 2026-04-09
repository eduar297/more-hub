import { STORAGE_KEYS } from "@/constants/storage-keys";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constants/supabase";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseOptions = {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

/** Central Supabase — activation codes & business connections */
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseOptions,
);

// ── Dynamic Data Client ──────────────────────────────────────────────────────

let _dataClient: SupabaseClient | null = null;
let _dataClientUrl: string | null = null;
let _dataClientAnonKey: string | null = null;

function isNetworkFailure(errorMessage: string): boolean {
  return /network request failed/i.test(errorMessage);
}

async function canReachDataProject(
  dataUrl: string,
  dataAnonKey: string,
  businessId: string,
): Promise<boolean> {
  try {
    const testClient = createClient(dataUrl, dataAnonKey, supabaseOptions);
    const { error } = await testClient
      .from("stores")
      .select("id")
      .eq("business_id", businessId)
      .limit(1);

    // Any non-network error still means the endpoint is reachable.
    if (!error) return true;
    return !isNetworkFailure(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return !isNetworkFailure(message);
  }
}

/** Check if cloud sync can reach Central for this activated device. */
export async function hasDataConnection(): Promise<boolean> {
  try {
    const businessId = await SecureStore.getItemAsync(STORAGE_KEYS.businessId);
    const activated = await SecureStore.getItemAsync(STORAGE_KEYS.activated);
    const deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.deviceId);

    if (activated !== "true" || !businessId || !deviceId) return false;

    const { data, error } = await supabase.rpc("get_data_connection", {
      p_business_id: businessId,
      p_device_id: deviceId,
    });

    if (error) return false;
    return !!(data?.success && data?.data_url && data?.data_anon_key);
  } catch {
    return false;
  }
}

function getOrCreateDataClient(
  dataUrl: string,
  dataAnonKey: string,
): SupabaseClient {
  if (
    _dataClient &&
    _dataClientUrl === dataUrl &&
    _dataClientAnonKey === dataAnonKey
  ) {
    return _dataClient;
  }

  _dataClient = createClient(dataUrl, dataAnonKey, supabaseOptions);
  _dataClientUrl = dataUrl;
  _dataClientAnonKey = dataAnonKey;
  return _dataClient;
}

/** Clear in-memory data connection cache */
export async function clearDataConnection(): Promise<void> {
  _dataClient = null;
  _dataClientUrl = null;
  _dataClientAnonKey = null;
}

// ── Fetch credentials from Central ──────────────────────────────────────────

/**
 * Ask Central for the Data Supabase credentials.
 * Verifies device ownership via activation_codes.
 * Saves them to SecureStore and returns the client.
 */
export async function fetchAndSaveDataConnection(
  businessId: string,
  deviceId: string,
): Promise<{
  success: boolean;
  error?: string;
  dataUrl?: string;
  dataAnonKey?: string;
}> {
  try {
    const { data, error } = await supabase.rpc("get_data_connection", {
      p_business_id: businessId,
      p_device_id: deviceId,
    });

    if (error) {
      console.warn("[DataConn] RPC error:", error.message);
      return { success: false, error: "network_error" };
    }

    if (!data?.success) {
      return { success: false, error: data?.error ?? "unknown" };
    }

    const reachable = await canReachDataProject(
      data.data_url,
      data.data_anon_key,
      businessId,
    );
    if (!reachable) {
      console.warn("[DataConn] Central returned unreachable data credentials");
      return { success: false, error: "unreachable_data_project" };
    }

    console.log("[DataConn] Credentials fetched from Central");
    return {
      success: true,
      dataUrl: data.data_url,
      dataAnonKey: data.data_anon_key,
    };
  } catch (err) {
    console.warn("[DataConn] Network error:", err);
    return { success: false, error: "network_error" };
  }
}

/**
 * Ensure we have a Data client — always ask Central first.
 * This is the main entry point for cloud sync.
 */
export async function ensureDataClient(
  businessId: string,
  deviceId: string,
): Promise<SupabaseClient | null> {
  // Always ask Central. No local credentials fallback.
  const result = await fetchAndSaveDataConnection(businessId, deviceId);
  if (!result.success || !result.dataUrl || !result.dataAnonKey) {
    console.warn("[DataConn] Could not obtain credentials:", result.error);
    return null;
  }

  return getOrCreateDataClient(result.dataUrl, result.dataAnonKey);
}
