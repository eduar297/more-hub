import { supabase } from "./client";

interface ValidationResult {
  success: boolean;
  businessId?: string;
  error?: "invalid_code" | "already_used" | "expired" | "network_error";
}

export async function validateActivationCode(
  code: string,
  deviceId: string,
  deviceInfo: Record<string, string | null>,
): Promise<ValidationResult> {
  try {
    const { data, error } = await supabase.rpc("validate_activation_code", {
      p_code: code.toUpperCase().trim(),
      p_device_id: deviceId,
      p_device_info: deviceInfo,
    });

    if (error) {
      console.warn("[Activation] RPC error:", error.message);
      return { success: false, error: "network_error" };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error ?? "invalid_code",
      };
    }

    return {
      success: true,
      businessId: data.business_id,
    };
  } catch (err) {
    console.warn("[Activation] Network error:", err);
    return { success: false, error: "network_error" };
  }
}
