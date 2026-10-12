// Imports the real Wave 1 (first 20 stores) installation schedule into
// `installation_projects`, replacing what used to be demo-only mock data.
// Source: a raw schedule the user pasted in chat (store name, store_code,
// D1 = วันนัดติดตั้ง / scheduled date, D2 = วันติดตั้งจริง / actual install
// date, both dd/mm/yyyy). There is no "current stage" column in the source,
// so this script infers a starting stage from today's date vs D1/D2:
//   today < D1        -> "Scheduled"
//   D1 <= today < D2   -> "Installing"
//   today >= D2        -> "Verify" (never auto-set to "Completed" -- that
//                         only happens once the 12-item Verify Checklist is
//                         actually ticked in the app)
// Earlier stages (Floor Plan / Layout / Quotation / Permit) are assumed
// already passed for all 20, since the source has no data on them -- if
// that's wrong for a given store, correct it afterward by dragging its
// card in the Kanban board.
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Always backs up the exact rows it's about to write/skip first.
// Never overwrites a store that already has an installation_projects row
// (prints it as "already exists, skipped" instead) -- re-run-safe.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local -- run from the project root:
//   node ./scripts/import-installation-wave1.mjs             # dry run
//   node ./scripts/import-installation-wave1.mjs --confirm   # applies it
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

// name is kept only for the printed report / mismatch warnings -- the real
// match key against `stores` is store_code.
const SCHEDULE = [
  { name: "MBK 2", store_code: "51428", d1: "01/10/2026", d2: "02/10/2026" },
  { name: "MBK", store_code: "51944", d1: "05/10/2026", d2: "06/10/2026" },
  { name: "Big C Rajdamri", store_code: "51426", d1: "07/10/2026", d2: "08/10/2026" },
  { name: "Imperial Samrong", store_code: "51506", d1: "12/10/2026", d2: "13/10/2026" },
  { name: "Central Westgate", store_code: "51436", d1: "14/10/2026", d2: "15/10/2026" },
  { name: "Central Pinklao", store_code: "51438", d1: "16/10/2026", d2: "17/10/2026" },
  { name: "Fashion Island", store_code: "51404", d1: "06/10/2026", d2: "07/10/2026" },
  { name: "Future Park", store_code: "51403", d1: "08/10/2026", d2: "09/10/2026" },
  { name: "Ayutthaya Park", store_code: "52003", d1: "12/10/2026", d2: "13/10/2026" },
  { name: "Central Chonburi", store_code: "54023", d1: "05/10/2026", d2: "06/10/2026" },
  { name: "Central Pattaya", store_code: "54021", d1: "07/10/2026", d2: "08/10/2026" },
  { name: "Central Ubon", store_code: "53031", d1: "05/10/2026", d2: "06/10/2026" },
  { name: "Central Udon", store_code: "53012", d1: "07/10/2026", d2: "08/10/2026" },
  { name: "Lotus Nong Khai", store_code: "53955", d1: "09/10/2026", d2: "10/10/2026" },
  { name: "Central Khon Kaen", store_code: "53022", d1: "06/10/2026", d2: "07/10/2026" },
  { name: "Huahin Market", store_code: "55001", d1: "06/10/2026", d2: "07/10/2026" },
  { name: "Central Phuket", store_code: "55012", d1: "08/10/2026", d2: "09/10/2026" },
  { name: "Jungceylon", store_code: "55008", d1: "12/10/2026", d2: "13/10/2026" },
  { name: "Central Chiang Mai", store_code: "52037", d1: "08/10/2026", d2: "09/10/2026" },
  { name: "Central Chiang Rai", store_code: "52002", d1: "12/10/2026", d2: "13/10/2026" },
];

const WAVE = "Wave 1";

function ddmmyyyyToIso(s) {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function inferStage(d1Iso, d2Iso) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < d1Iso) return "Scheduled";
  if (today < d2Iso) return "Installing";
  return "Verify";
}

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm passed): nothing will be written.\n");

  const { data: stores, error: storesErr } = await supabase.from("stores").select("id, store_code, store_name");
  if (storesErr) throw storesErr;
  const storeByCode = new Map(stores.map((s) => [String(s.store_code).trim(), s]));

  const { data: existingProjects, error: projErr } = await supabase.from("installation_projects").select("id, store_id, wave, current_stage");
  if (projErr) throw projErr;
  const existingByStoreId = new Map(existingProjects.map((p) => [p.store_id, p]));

  const toInsert = [];
  const skippedExisting = [];
  const unmatched = [];

  for (const row of SCHEDULE) {
    const store = storeByCode.get(row.store_code);
    if (!store) {
      unmatched.push(row);
      continue;
    }
    const existing = existingByStoreId.get(store.id);
    if (existing) {
      skippedExisting.push({ ...row, store_id: store.id, existing_stage: existing.current_stage, existing_wave: existing.wave });
      continue;
    }
    const d1Iso = ddmmyyyyToIso(row.d1);
    const d2Iso = ddmmyyyyToIso(row.d2);
    toInsert.push({
      store_id: store.id,
      wave: WAVE,
      current_stage: inferStage(d1Iso, d2Iso),
      d1_date: d1Iso,
      d2_date: d2Iso,
      verify_checked: [],
      verify_total: 0,
      store_code: row.store_code,
      store_name_in_schedule: row.name,
      store_name_in_db: store.store_name,
    });
  }

  console.log(`Schedule rows: ${SCHEDULE.length}`);
  console.log(`  To insert:        ${toInsert.length}`);
  console.log(`  Already exists:   ${skippedExisting.length} (left untouched -- re-run safe)`);
  console.log(`  No matching store_code in 'stores' table: ${unmatched.length}\n`);

  if (unmatched.length > 0) {
    console.log("UNMATCHED (fix the store_code or add the store first):");
    unmatched.forEach((r) => console.log(`  - ${r.name} (${r.store_code})`));
    console.log("");
  }

  if (skippedExisting.length > 0) {
    console.log("ALREADY HAS A PROJECT (skipped, not overwritten):");
    skippedExisting.forEach((r) => console.log(`  - ${r.name} (${r.store_code}): wave="${r.existing_wave}" stage="${r.existing_stage}"`));
    console.log("");
  }

  if (toInsert.length > 0) {
    console.log("WILL INSERT:");
    toInsert.forEach((r) =>
      console.log(`  - ${r.store_name_in_schedule} (${r.store_code}) -> wave="${r.wave}" stage="${r.current_stage}" D1=${r.d1_date} D2=${r.d2_date}`)
    );
    console.log("");
    // Flag a schedule name that doesn't match the real store_name on file,
    // in case the store_code was mistyped and happened to match a
    // different real store.
    const nameMismatches = toInsert.filter((r) => r.store_name_in_schedule.trim() !== r.store_name_in_db.trim());
    if (nameMismatches.length > 0) {
      console.log("NAME MISMATCH WARNING (store_code matched a store with a different name -- double-check these):");
      nameMismatches.forEach((r) => console.log(`  - schedule says "${r.store_name_in_schedule}" but stores.store_name is "${r.store_name_in_db}" (${r.store_code})`));
      console.log("");
    }
  }

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `import-installation-wave1-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ created_at: new Date().toISOString(), to_insert: toInsert, skipped_existing: skippedExisting, unmatched }, null, 2)
  );
  console.log(`Backup/report saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Review the lists above (and the backup file), then re-run with --confirm to apply:");
    console.log("  node ./scripts/import-installation-wave1.mjs --confirm");
    return;
  }

  if (toInsert.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  console.log("Inserting...");
  const rows = toInsert.map((r) => ({
    store_id: r.store_id,
    wave: r.wave,
    current_stage: r.current_stage,
    d1_date: r.d1_date,
    d2_date: r.d2_date,
    verify_checked: r.verify_checked,
    verify_total: r.verify_total,
  }));
  const { data: inserted, error: insertErr } = await supabase.from("installation_projects").insert(rows).select("id, store_id, current_stage");
  if (insertErr) throw new Error(`Failed inserting installation_projects: ${insertErr.message}`);

  // Append-only history row per project, matching the pattern every other
  // stage-change write in this app follows (installationWrite.ts).
  const historyRows = inserted.map((p) => ({
    store_id: p.store_id,
    from_stage: null,
    to_stage: p.current_stage,
    note: "Imported from Wave 1 schedule (scripts/import-installation-wave1.mjs)",
  }));
  const { error: historyErr } = await supabase.from("installation_stage_history").insert(historyRows);
  if (historyErr) console.error(`Warning: history insert failed (non-fatal): ${historyErr.message}`);

  console.log(`\nDone. Inserted ${inserted.length} installation_projects rows. Backup/report kept at: ${backupPath}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
