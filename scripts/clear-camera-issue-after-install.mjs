// Clears the old "ต้องซ่อมกล้อง" flag on stores that got a NEW system
// installed (Installation Project) — found 2026-10-14: newly installed Top 20
// stores still showed "ต้องซ่อมกล้อง" because stores.camera_issue was set
// before the installation and the iVMS sync keeps Partial while it is true.
//
// A store is cleared when:
//   - it has an installation_projects row with d2_date (actual install date)
//     on or before today, or stage Verify / Completed, AND
//   - stores.camera_issue is true and was set BEFORE the install date
//     (an issue reported after the install is kept).
// For each: camera_issue -> false, and overall_status Partial -> Healthy.
// Offline stores keep Offline (the iVMS sync decides that).
//
// SAFE BY DEFAULT: no --confirm = DRY RUN (lists stores, writes a backup).
//   node ./scripts/clear-camera-issue-after-install.mjs
//   node ./scripts/clear-camera-issue-after-install.mjs --confirm
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.includes("--confirm");

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv(join(__dirname, "..", ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Bangkok "today" as YYYY-MM-DD.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm): nothing will be written.\n");

  const [projRes, storesRes] = await Promise.all([
    supabase.from("installation_projects").select("store_id, wave, current_stage, d2_date"),
    supabase.from("stores").select("id, store_code, store_name, overall_status, camera_issue, camera_issue_at"),
  ]);
  if (projRes.error) throw projRes.error;
  if (storesRes.error) throw storesRes.error;
  const storeById = new Map(storesRes.data.map((s) => [s.id, s]));

  const targets = [];
  const keptLater = [];
  const notYet = [];
  for (const p of projRes.data) {
    const s = storeById.get(p.store_id);
    if (!s || !s.camera_issue) continue;
    const installed = (p.d2_date && p.d2_date <= today) || p.current_stage === "Verify" || p.current_stage === "Completed";
    if (!installed) {
      notYet.push({ s, p });
      continue;
    }
    // Issue reported after the install day -> it is about the new system; keep it.
    const issueDay = s.camera_issue_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(s.camera_issue_at)) : null;
    if (p.d2_date && issueDay && issueDay > p.d2_date) {
      keptLater.push({ s, p, issueDay });
      continue;
    }
    targets.push({ s, p });
  }
  targets.sort((a, b) => a.s.store_code.localeCompare(b.s.store_code));

  console.log(`Installed stores with old camera flag to CLEAR: ${targets.length}`);
  for (const { s, p } of targets) console.log(`  ${s.store_code}  ${s.store_name}  [${s.overall_status}]  installed ${p.d2_date ?? "-"} (${p.current_stage})`);
  if (keptLater.length) {
    console.log(`\nKEPT — camera issue reported after install: ${keptLater.length}`);
    for (const { s, p, issueDay } of keptLater) console.log(`  ${s.store_code}  ${s.store_name}  installed ${p.d2_date}, issue ${issueDay}`);
  }
  if (notYet.length) {
    console.log(`\nKEPT — not installed yet: ${notYet.length}`);
    for (const { s, p } of notYet) console.log(`  ${s.store_code}  ${s.store_name}  (${p.current_stage}, install ${p.d2_date ?? "no date"})`);
  }
  console.log("");

  if (targets.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `clear-camera-issue-after-install-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ created_at: new Date().toISOString(), stores_before: targets.map((t) => t.s) }, null, 2));
  console.log(`Backup saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Check the list above, then re-run with --confirm:");
    console.log("  node ./scripts/clear-camera-issue-after-install.mjs --confirm");
    return;
  }

  const ids = targets.map((t) => t.s.id);
  const now = new Date().toISOString();
  const { error } = await supabase.from("stores").update({ camera_issue: false, camera_issue_at: now }).in("id", ids);
  if (error) throw new Error(`Failed clearing camera_issue: ${error.message}`);
  const { error: e2 } = await supabase.from("stores").update({ overall_status: "Healthy" }).in("id", ids).eq("overall_status", "Partial");
  if (e2) throw new Error(`Failed resetting Partial: ${e2.message}`);

  console.log(`Done. Stores cleared: ${ids.length}. Backup kept at: ${backupPath}`);
  console.log("Device Status updates on the next page refresh; the next iVMS sync keeps them Online.");
}

main().catch((err) => {
  console.error("Clear failed:", err);
  process.exit(1);
});
