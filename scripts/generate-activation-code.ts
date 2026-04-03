/**
 * Generate activation codes for MoreHub businesses.
 *
 * Usage:
 *   npx tsx scripts/generate-activation-code.ts --business-name "Mi Negocio" --hours 720
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(process.cwd(), ".env.local") });

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Error: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--business-name" && args[i + 1]) {
      businessName = args[++i];
    } else if (args[i] === "--hours" && args[i + 1]) {
      hours = parseInt(args[++i], 10);
    }
  }

  if (!businessName) {
    console.error("Usage: --business-name <name> [--hours <number>]");
    process.exit(1);
  }

  return { businessName, hours };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { businessName, hours } = parseArgs();

  // Upsert business (find existing or create)
  let { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("name", businessName)
    .maybeSingle();

  if (!business) {
    const res = await supabase
      .from("businesses")
      .insert({ name: businessName })
      .select("id")
      .single();
    if (res.error) {
      console.error("Failed to create business:", res.error.message);
      process.exit(1);
    }
    business = res.data;
  }

  // Generate and insert code
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

  console.log(`\nActivation Code Generated`);
  console.log(`─────────────────────────`);
  console.log(`Business : ${businessName}`);
  console.log(`Code     : ${code}`);
  console.log(`Expires  : ${expiresAt}`);
  console.log(`Hours    : ${hours} (${(hours / 24).toFixed(1)} days)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
