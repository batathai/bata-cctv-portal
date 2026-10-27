// Checks and fixes the stage of Wave 2 installation_projects rows.
//
// Reported 2026-10-27: after import-installation-wave2.mjs, the 30 Wave 2
// cards showed in "ขอใบเสนอราคา/อนุมัติงบ" (Quotation) instead of
// "นัดติดตั้ง" (Scheduled). This script first prints what is actually in
// the database (stage, dates, wave, created time, history) so the cause can
// be seen, then moves each Wave 2 row to the stage the import intended:
//   has D1 date  -> "Scheduled"
//   no D1 date   -> "Permit"   (55950 Lotus Phuket, not booked yet)
// Only rows currently at "Quotation" are touched — a card someone already
// moved by hand is left alone.
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Backs up the rows it changes first. Writes one
// installation_stage_history row per change, like the app does.
//
// Run from the project root (needs SUPABASE_SERVICE_ROLE_KEY in .env.local):
//   node ./scripts/fix-installation-wave2-stage.mjs             # check only
//   node ./scripts/fix-installation-wave2-stage.mjs --confirm   # apply fix
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

const WAVE = "Wave 2";

async function main() {
  console.log(CONFIRMED ? "=== APPLYING FIX ===\n" : "=== CHECK ONLY (add --confirm to apply) ===\n");

  const { data: projects, error } = await supabase
    .from("installation_projects")
    .select("id, store_id, wave, current_stage, d1_date, d2_date, created_at, stores(store_code, store_name)")
    .eq("wave", WAVE)
    .order("d1_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  console.log(`Wave 2 rows in database: ${projects.length}`);
  const byStage = {};
  projects.forEach((p) => (byStage[p.current_stage] = (byStage[p.current_stage] || 0) + 1));
  console.log("By stage:", JSON.stringify(byStage));
  console.log("");

  const ids = projects.map((p) => p.store_id);
  const { data: history, error: hErr } = await supabase
    .from("installation_stage_history")
    .select("store_id, from_stage, to_stage, note, changed_at")
    .in("store_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("changed_at", { ascending: true });
  if (hErr) throw hErr;
  const histByStore = new Map();
  history.forEach((h) => {
    if (!histByStore.has(h.store_id)) histByStore.set(h.store_id, []);
    histByStore.get(h.store_id).push(h);
  });

  const toFix = [];
  for (const p of projects) {
    const code = p.stores?.store_code ?? "?";
    const name = p.stores?.store_name ?? "?";
    const target = p.d1_date ? "Scheduled" : "Permit";
    const hist = (histByStore.get(p.store_id) || []).map((h) => `${h.from_stage ?? "-"}->${h.to_stage}`).join(", ");
    const willFix = p.current_stage === "Quotation";
    console.log(
      `${code} ${name.padEnd(26)} stage=${p.current_stage.padEnd(10)} D1=${p.d1_date ?? "-"} D2=${p.d2_date ?? "-"} ` +
        `created=${p.created_at.slice(0, 16)} history=[${hist || "none"}]${willFix ? `  => ${target}` : ""}`
    );
    if (willFix) toFix.push({ ...p, target });
  }

  console.log(`\nTo fix: ${toFix.length}`);
  if (toFix.length === 0) {
    console.log("Nothing to change.");
    return;
  }
  if (!CONFIRMED) {
    console.log("Re-run with --confirm to apply:\n  node ./scripts/fix-installation-wave2-stage.mjs --confirm");
    return;
  }

  const backupDir = join(__dirname, "..", "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `fix-installation-wave2-stage-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify(toFix, null, 2));
  console.log(`Backup written to ${backupPath}`);

  for (const p of toFix) {
    const { data: updated, error: uErr } = await supabase
      .from("installation_projects")
      .update({ current_stage: p.target })
      .eq("id", p.id)
      .select("current_stage")
      .single();
    if (uErr) throw new Error(`Update failed for ${p.stores?.store_code}: ${uErr.message}`);
    if (updated.current_stage !== p.target) {
      console.log(`⚠ ${p.stores?.store_code}: database still says ${updated.current_stage} after update (something resets it)`);
      continue;
    }
    const { error: hInsErr } = await supabase.from("installation_stage_history").insert({
      store_id: p.store_id,
      from_stage: "Quotation",
      to_stage: p.target,
      note: "Wave 2 import stage fix (scripts/fix-installation-wave2-stage.mjs)",
    });
    if (hInsErr) console.error(`Warning: history insert failed for ${p.stores?.store_code}: ${hInsErr.message}`);
  }

  console.log(`Done. Fixed ${toFix.length} rows. Refresh the Installation Project page (F5).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
