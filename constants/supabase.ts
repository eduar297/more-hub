// ── Supabase Central Configuration ───────────────────────────────────────────
// Central Supabase: activation codes + business → data-instance mapping.
// Values come from EXPO_PUBLIC_* env vars (inlined by Metro from .env.local).

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// SecureStore keys for the dynamic Data Supabase connection
export const DATA_URL_KEY = process.env.EXPO_PUBLIC_DATA_URL_KEY!;
export const DATA_ANON_KEY_KEY = process.env.EXPO_PUBLIC_DATA_ANON_KEY_KEY!;
