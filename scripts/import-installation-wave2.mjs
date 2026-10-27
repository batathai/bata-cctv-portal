// Imports the Wave 2 (Top 50, ranks 21-50 not yet installed) installation
// schedule into `installation_projects`. Same shape and safety rules as
// import-installation-wave1.mjs.
//
// Source: SECOM PDF "Installation Weekry (cctv) 30 สาขา" sent by the project
// owner on 2026-10-27 (Gantt chart, 15/11-26/12/2026). Each store has a dark
// cell (เดินท่อร้อยสาย + ติดตั้ง) followed by a light cell (setting) on the
// next day -> read as D1 = วันนัดติดตั้ง and D2 = วันติดตั้ง/setting, same
// two-day pattern as Wave 1. Dates were read from the PDF's cell fills, not
// by eye, and all 30 store codes match PLAN-install-wave2-top50.
//
// Stage on import:
//   - dated rows: inferred from today vs D1/D2 like Wave 1
//     (today < D1 -> "Scheduled", never auto "Completed")
//   - 55950 Lotus Phuket has no date in the PDF (owner will book it) ->
//     "Permit" with no dates, so it sits before "Scheduled" on the board.
//     Dragging it to "Scheduled" later without a date would stamp today as
//     D1, so set the date on its detail page instead.
//
// Not in this file: 54098 Central Pattaya (new store replacing 54021) —
// its date is still being re-booked; handled separately once confirmed.
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Backs up/reports first. Never overwrites a store that already has
// an installation_projects row (re-run safe).
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local -- run from the project root:
//   node ./scripts/import-installation-wave2.mjs             # dry run
//   node ./scripts/import-installation-wave2.mjs --confirm   # applies it
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
  { name: "Central Rama 9", store_code: "51430", d1: "16/11/2026", d2: "17/11/2026" },
  { name: "The Mall Bangkapi (The Mall 8)", store_code: "51416", d1: "18/11/2026", d2: "19/11/2026" },
  { name: "The Mall Ngamwongwan (The Mall 6)", store_code: "51407", d1: "20/11/2026", d2: "21/11/2026" },
  { name: "Min Buri", store_code: "51498", d1: "23/11/2026", d2: "24/11/2026" },
  { name: "Mega Bang Na", store_code: "51431", d1: "25/11/2026", d2: "26/11/2026" },
  { name: "Big C Bang Phli", store_code: "51548", d1: "27/11/2026", d2: "28/11/2026" },
  { name: "HomePro Suvarnabhumi", store_code: "51435", d1: "30/11/2026", d2: "01/12/2026" },
  { name: "Central Rama 3", store_code: "51518", d1: "01/12/2026", d2: "02/12/2026" },
  { name: "Big C Suksawat", store_code: "51550", d1: "03/12/2026", d2: "04/12/2026" },
  { name: "Central Rama 2", store_code: "51905", d1: "04/12/2026", d2: "05/12/2026" },
  { name: "Central Mahachai", store_code: "54022", d1: "07/12/2026", d2: "08/12/2026" },
  { name: "Central Nakornprathom", store_code: "54094", d1: "17/11/2026", d2: "18/11/2026" },
  { name: "Robinson Kanchanaburi", store_code: "54017", d1: "19/11/2026", d2: "20/11/2026" },
  { name: "Robinson Saraburi", store_code: "54035", d1: "17/11/2026", d2: "18/11/2026" },
  { name: "Central Rayong", store_code: "54046", d1: "19/11/2026", d2: "20/11/2026" },
  { name: "Central Marina", store_code: "54048", d1: "24/11/2026", d2: "25/11/2026" },
  { name: "Central Nakhon Si", store_code: "55043", d1: "16/11/2026", d2: "17/11/2026" },
  { name: "The Mall Korat", store_code: "53009", d1: "18/11/2026", d2: "19/11/2026" },
  { name: "Taweekit 2 (Buriram)", store_code: "53003", d1: "20/11/2026", d2: "21/11/2026" },
  { name: "Big C Ubon Ratchathani", store_code: "53953", d1: "23/11/2026", d2: "24/11/2026" },
  { name: "Central Hat Yai", store_code: "55035", d1: "24/11/2026", d2: "25/11/2026" },
  { name: "Central Suratthani", store_code: "55030", d1: "30/11/2026", d2: "01/12/2026" },
  { name: "Central Samui", store_code: "55038", d1: "02/12/2026", d2: "03/12/2026" },
  { name: "Lotus Phuket", store_code: "55950", d1: null, d2: null }, // ยังไม่นัด — owner books the date himself
  { name: "Kalasin Plaza", store_code: "53011", d1: "16/11/2026", d2: "17/11/2026" },
  { name: "Lotus Khon Kaen 2", store_code: "53046", d1: "18/11/2026", d2: "19/11/2026" },
  { name: "Big C Loei", store_code: "53905", d1: "20/11/2026", d2: "21/11/2026" },
  { name: "Lotus Kamthieng", store_code: "52007", d1: "23/11/2026", d2: "24/11/2026" },
  { name: "Maya Chiangmai", store_code: "52025", d1: "25/11/2026", d2: "26/11/2026" },
  { name: "Central Phitsanulok", store_code: "52010", d1: "27/11/2026", d2: "28/11/2026" },
];

const WAVE = "Wave 2";

function ddmmyyyyToIso(s) {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function inferStage(d1Iso, d2Iso) {
  if (!d1Iso) return "Permit";
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
    const d1Iso = row.d1 ? ddmmyyyyToIso(row.d1) : null;
    const d2Iso = row.d2 ? ddmmyyyyToIso(row.d2) : null;
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
      console.log(`  - ${r.store_name_in_schedule} (${r.store_code}) -> wave="${r.wave}" stage="${r.current_stage}" D1=${r.d1_date ?? "-"} D2=${r.d2_date ?? "-"}`)
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
  const backupPath = join(backupsDir, `import-installation-wave2-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ created_at: new Date().toISOString(), to_insert: toInsert, skipped_existing: skippedExisting, unmatched }, null, 2)
  );
  console.log(`Backup/report saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Review the lists above (and the backup file), then re-run with --confirm to apply:");
    console.log("  node ./scripts/import-installation-wave2.mjs --confirm");
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
    note: "Imported from Wave 2 schedule (SECOM PDF 2026-10-27, scripts/import-installation-wave2.mjs)",
  }));
  const { error: historyErr } = await supabase.from("installation_stage_history").insert(historyRows);
  if (historyErr) console.error(`Warning: history insert failed (non-fatal): ${historyErr.message}`);

  console.log(`\nDone. Inserted ${inserted.length} installation_projects rows. Backup/report kept at: ${backupPath}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
