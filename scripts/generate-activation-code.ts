/**
 * Generate activation codes for MoreHub businesses.
 *
 * Usage:
 *   npx tsx scripts/generate-activation-code.ts \
 *     --business-name "Mi Negocio" \
 *     --hours 720 \
 *     --data-center-name "morehub-data-01"
 *
 *   Or, to create a new data center on the fly:
 *   npx tsx scripts/generate-activation-code.ts \
 *     --business-name "Mi Negocio" \
 *     --hours 720 \
 *     --data-url "https://xxxxx.supabase.co" \
 *     --data-anon-key "eyJ..."
 *
 * Requires EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (pointing to the CENTRAL Supabase project).
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(process.cwd(), ".env.local") });

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Error: Falta EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Characters that avoid ambiguity (no 0/O, 1/I/L) */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let businessName = "";
  let hours = 720; // default 30 days
  let dataCenterName = "";
  let dataUrl = "";
  let dataAnonKey = "";
  let copyUrl = false;
  let copyKey = false;
  let copyCode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--business-name" && args[i + 1]) {
      businessName = args[++i];
    } else if (args[i] === "--hours" && args[i + 1]) {
      hours = parseInt(args[++i], 10);
    } else if (args[i] === "--data-center-name" && args[i + 1]) {
      dataCenterName = args[++i];
    } else if (args[i] === "--data-url" && args[i + 1]) {
      dataUrl = args[++i];
    } else if (args[i] === "--data-anon-key" && args[i + 1]) {
      dataAnonKey = args[++i];
    } else if (args[i] === "--copy-url") {
      copyUrl = true;
    } else if (args[i] === "--copy-key") {
      copyKey = true;
    } else if (args[i] === "--copy-code") {
      copyCode = true;
    }
  }

  if (!businessName) {
    console.error(
      "Usage: --business-name <name> [--hours <n>] [--data-center-name <name> | --data-url <url> --data-anon-key <key>]",
    );
    process.exit(1);
  }

  return {
    businessName,
    hours,
    dataCenterName,
    dataUrl,
    dataAnonKey,
    copyUrl,
    copyKey,
    copyCode,
  };
}

function maskSecret(secret: string): string {
  if (secret.length <= 10) return "*".repeat(secret.length);
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

function copyToClipboard(value: string): boolean {
  if (!value) return false;

  if (process.platform === "darwin") {
    const res = spawnSync("pbcopy", { input: value });
    return res.status === 0;
  }
  if (process.platform === "win32") {
    const res = spawnSync("clip", { input: value, shell: true });
    return res.status === 0;
  }

  const xclip = spawnSync("xclip", ["-selection", "clipboard"], {
    input: value,
  });
  if (xclip.status === 0) return true;

  const xsel = spawnSync("xsel", ["--clipboard", "--input"], {
    input: value,
  });
  return xsel.status === 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const {
    businessName,
    hours,
    dataCenterName,
    dataUrl,
    dataAnonKey,
    copyUrl,
    copyKey,
    copyCode,
  } = parseArgs();

  // ── Resolve or create data center ─────────────────────────────────────────

  let dataCenterId: string | null = null;

  if (dataCenterName) {
    // Look up existing data center by name
    const { data: dc } = await supabase
      .from("data_centers")
      .select("id, data_url, data_anon_key")
      .eq("name", dataCenterName)
      .maybeSingle();

    if (!dc) {
      console.error(`Data center "${dataCenterName}" not found.`);
      console.error("Available data centers:");
      const { data: all } = await supabase.from("data_centers").select("name");
      for (const row of all ?? []) console.error(`  - ${row.name}`);
      process.exit(1);
    }
    dataCenterId = dc.id;
  } else if (dataUrl && dataAnonKey) {
    // Upsert data center from URL (name = hostname)
    const dcName = dataUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const { data: dc, error: dcErr } = await supabase
      .from("data_centers")
      .upsert(
        { name: dcName, data_url: dataUrl, data_anon_key: dataAnonKey },
        { onConflict: "data_url" },
      )
      .select("id")
      .single();

    if (dcErr) {
      console.error("Failed to upsert data center:", dcErr.message);
      process.exit(1);
    }
    dataCenterId = dc.id;
  }

  // ── Resolve or create business ────────────────────────────────────────────

  let { data: business } = await supabase
    .from("businesses")
    .select("id, data_center_id")
    .eq("name", businessName)
    .maybeSingle();

  if (!business) {
    if (!dataCenterId) {
      console.error(
        "New business requires a data center. Use --data-center-name or --data-url + --data-anon-key.",
      );
      process.exit(1);
    }
    const res = await supabase
      .from("businesses")
      .insert({ name: businessName, data_center_id: dataCenterId })
      .select("id, data_center_id")
      .single();
    if (res.error) {
      console.error("Failed to create business:", res.error.message);
      process.exit(1);
    }
    business = res.data;
  } else if (dataCenterId && business.data_center_id !== dataCenterId) {
    // Update business's data center if a new one was specified
    await supabase
      .from("businesses")
      .update({ data_center_id: dataCenterId })
      .eq("id", business.id);
    business.data_center_id = dataCenterId;
  }

  // ── Read resolved data center info ────────────────────────────────────────

  let resolvedDc: { data_url: string; data_anon_key: string } | null = null;
  if (business!.data_center_id) {
    const { data: dc } = await supabase
      .from("data_centers")
      .select("data_url, data_anon_key")
      .eq("id", business!.data_center_id)
      .maybeSingle();
    resolvedDc = dc;
  }

  // ── Generate and insert code ──────────────────────────────────────────────

  const code = generateCode();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("activation_codes")
    .insert({
      code,
      business_id: business!.id,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error("Failed to insert code:", insertError.message);
    process.exit(1);
  }

  // ── Output ────────────────────────────────────────────────────────────────

  console.log(`\nActivation Code Generated`);
  console.log(`─────────────────────────`);
  console.log(`Business : ${businessName}`);
  console.log(`Code     : ${code}`);
  console.log(`Expires  : ${expiresAt}`);
  console.log(`Hours    : ${hours} (${(hours / 24).toFixed(1)} days)`);
  if (resolvedDc?.data_url) {
    console.log(`Data URL : ${resolvedDc.data_url}`);
  } else {
    console.log(`Data URL : (sin configurar)`);
  }
  if (resolvedDc?.data_anon_key) {
    console.log(`Anon Key : ${maskSecret(resolvedDc.data_anon_key)}`);
  } else {
    console.log(`Anon Key : (sin configurar)`);
  }

  if (copyCode) {
    const ok = copyToClipboard(code);
    console.log(ok ? "Copiado: code" : "No se pudo copiar code");
  }
  if (copyUrl) {
    const ok = copyToClipboard(resolvedDc?.data_url ?? "");
    console.log(ok ? "Copiado: data_url" : "No se pudo copiar data_url");
  }
  if (copyKey) {
    const ok = copyToClipboard(resolvedDc?.data_anon_key ?? "");
    console.log(
      ok ? "Copiado: data_anon_key" : "No se pudo copiar data_anon_key",
    );
  }

  if (!copyCode && !copyUrl && !copyKey) {
    console.log(
      "Tip: usa --copy-code / --copy-url / --copy-key para copiar directo",
    );
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
