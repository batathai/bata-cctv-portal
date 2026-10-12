// Corrects a handful of wrong D1/D2 dates in `installation_projects` that
// slipped in through the original Wave 1 import (import-installation-wave1.mjs)
// or through later manual edits. Reported by the project owner on 2026-10-05:
//
//   - 51428 (MBK 2): D1 should be 05/10/2026 (ติดตั้งคืนนี้ 05/10), D2 follows
//     as D1+1 day = 06/10/2026. Was D1=01/10/2026, D2=02/10/2026.
//   - 53031 (Central Ubon): D1 should be 06/10/2026, D2 = 07/10/2026.
//     Was D1=05/10/2026, D2=06/10/2026.
//   - 54023 (Central Chonburi): D1 should be 06/10/2026, D2 = 07/10/2026.
//     Was D1=05/10/2026, D2=06/10/2026.
//   - 51944 (MBK) — originally misreported as "51499": the real install
//     already happened back on 01/05/2026 (confirmed explicitly), so D1 is
//     set to the day before (30/04/2026) and D2 to 01/05/2026. Was
//     D1=05/10/2026, D2=06/10/2026 (wrong wave/date entirely).
//
// Only touches d1_date / d2_date on the matching installation_projects row.
// Does NOT touch current_stage — per the same convention as the Wave 1
// import script, correct the stage afterward by dragging the card on the
// Kanban board if the new dates mean it should be in a different column
// (e.g. 51428 moving into "today" likely belongs in "Installing" now).
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Always backs up the exact rows it's about to change first.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — run from the project root:
//   node ./scripts/fix-installation-wave1-dates.mjs             # dry run
//   node ./scripts/fix-installation-wave1-dates.mjs --confirm   # applies it
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

function ddmmyyyyToIso(s) {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

const CORRECTIONS = [
  { store_code: "51428", name: "MBK 2", d1: "05/10/2026", d2: "06/10/2026" },
  { store_code: "53031", name: "Central Ubon", d1: "06/10/2026", d2: "07/10/2026" },
  { store_code: "54023", name: "Central Chonburi", d1: "06/10/2026", d2: "07/10/2026" },
  { store_code: "51944", name: "MBK", d1: "30/04/2026", d2: "01/05/2026" },
];

async function main() {
  console.log(CONFIRMED ? "=== APPLYING CORRECTIONS ===" : "=== DRY RUN (add --confirm to apply) ===");

  const codes = CORRECTIONS.map((c) => c.store_code);
  const { data: storesData, error: storesErr } = await supabase
    .from("stores")
    .select("id, store_code, store_name")
    .in("store_code", codes);
  if (storesErr) throw storesErr;

  const storeByCode = new Map(storesData.map((s) => [s.store_code, s]));
  const unmatched = codes.filter((c) => !storeByCode.has(c));
  if (unmatched.length > 0) {
    console.log("⚠ Store codes not found in `stores`, skipped:", unmatched.join(", "));
  }

  const storeIds = storesData.map((s) => s.id);
  const { data: projects, error: projErr } = await supabase
    .from("installation_projects")
    .select("id, store_id, current_stage, d1_date, d2_date")
    .in("store_id", storeIds);
  if (projErr) throw projErr;
  const projByStoreId = new Map(projects.map((p) => [p.store_id, p]));

  const backup = [];
  const updates = [];

  for (const c of CORRECTIONS) {
    const store = storeByCode.get(c.store_code);
    if (!store) continue;
    const project = projByStoreId.get(store.id);
    if (!project) {
      console.log(`⚠ ${c.store_code} (${store.store_name}) — no installation_projects row found, skipped`);
      continue;
    }
    const newD1 = ddmmyyyyToIso(c.d1);
    const newD2 = ddmmyyyyToIso(c.d2);
    console.log(
      `${c.store_code} (${store.store_name}) [stage: ${project.current_stage}] — ` +
        `D1: ${project.d1_date ?? "-"} -> ${newD1}, D2: ${project.d2_date ?? "-"} -> ${newD2}`
    );
    backup.push({ ...project });
    updates.push({ id: project.id, d1_date: newD1, d2_date: newD2 });
  }

  if (updates.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  if (!CONFIRMED) {
    console.log(`\nTo update: ${updates.length}. Re-run with --confirm to apply.`);
    return;
  }

  const backupDir = join(__dirname, "..", "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `fix-installation-wave1-dates-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written to ${backupPath}`);

  for (const u of updates) {
    const { error } = await supabase
      .from("installation_projects")
      .update({ d1_date: u.d1_date, d2_date: u.d2_date })
      .eq("id", u.id);
    if (error) throw error;
  }

  console.log(`Done. Updated ${updates.length} installation_projects rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
