// Finds and fixes stores whose stored `region` column ("Bangkok"/"Upcountry")
// doesn't match what its `zone` code says it should be, per the rule:
//   Bangkok:   511, 512, 513, 550
//   Upcountry: 520, 530, 540, 560
// (zone is read with the DM-name suffix stripped, e.g. "511_Songpol" -> "511"
// — see zoneCode() in src/lib/recovery.ts, which this mirrors.)
//
// The app itself no longer trusts this column for display/filtering (it now
// computes region from zone everywhere — see regionFromZone() in
// src/lib/recovery.ts), so this script is purely a data-hygiene cleanup:
// makes the stored column match what's actually shown, in case anything
// else ever reads it directly (a future report, a DB query, etc).
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Always backs up the exact rows it's about to change first.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — run from the project root:
//   node ./scripts/fix-store-regions.mjs             # dry run
//   node ./scripts/fix-store-regions.mjs --confirm   # applies it
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.includes("--confirm");

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv(join(__dirname, "..", ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BKK_ZONES = new Set(["511", "512", "513", "550"]);
function zoneCode(zone) {
  return String(zone).split("_")[0];
}
function correctRegion(zone) {
  return BKK_ZONES.has(zoneCode(zone)) ? "Bangkok" : "Upcountry";
}

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm passed): nothing will be written.\n");

  const { data: stores, error } = await supabase.from("stores").select("id, store_code, store_name, zone, region");
  if (error) throw error;

  const mismatches = stores
    .map((s) => ({ ...s, correct: correctRegion(s.zone) }))
    .filter((s) => s.region !== s.correct);

  console.log(`Checked ${stores.length} store(s). Mismatched region: ${mismatches.length}\n`);

  if (mismatches.length > 0) {
    console.log("Mismatches (store — zone — current region -> correct region):");
    mismatches.forEach((s) => console.log(`  ${s.store_code} (${s.store_name}) — zone ${s.zone} — "${s.region}" -> "${s.correct}"`));
  }

  if (mismatches.length === 0) {
    console.log("Nothing to fix.");
    return;
  }

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `fix-store-regions-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        stores: mismatches.map((s) => ({ id: s.id, store_code: s.store_code, region_before: s.region })),
      },
      null,
      2
    )
  );
  console.log(`\nBackup of current values saved to: ${backupPath}`);

  if (!CONFIRMED) {
    console.log("\nReview the list above, then re-run with --confirm to apply:");
    console.log("  node ./scripts/fix-store-regions.mjs --confirm");
    return;
  }

  console.log("\nApplying changes...");
  let updated = 0;
  for (const s of mismatches) {
    const { error: updErr } = await supabase.from("stores").update({ region: s.correct }).eq("id", s.id);
    if (updErr) throw new Error(`Failed updating store ${s.store_code}: ${updErr.message}`);
    updated++;
  }
  console.log(`\nDone. Stores corrected: ${updated}.`);
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
