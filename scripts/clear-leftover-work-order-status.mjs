// Clears leftover work-order fields on stores that have NO real work order
// (no open ticket and no recovery_stage) — decision 2026-10-14. These old
// values (recovery_status, cause, required_action, recovery_notes, batch_id)
// came from imports and made reports show such stores as "Open".
//
// Stores in --keep (comma-separated store codes) are never touched, e.g.
//   node ./scripts/clear-leftover-work-order-status.mjs --keep=54044
//
// Does NOT touch: tickets, stage history, cctv_assets, iVMS status, or any
// store that has a real work order.
//
// SAFE BY DEFAULT: no --confirm = DRY RUN (lists stores, writes a backup).
//   node ./scripts/clear-leftover-work-order-status.mjs --keep=54044
//   node ./scripts/clear-leftover-work-order-status.mjs --keep=54044 --confirm
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.includes("--confirm");
const KEEP = new Set(
  (process.argv.find((a) => a.startsWith("--keep=")) ?? "--keep=").slice(7).split(",").map((c) => c.trim()).filter(Boolean)
);
const OPEN_TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Waiting Parts"];
const FIELDS = ["recovery_status", "cause", "required_action", "recovery_notes", "batch_id"];

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

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm): nothing will be written.\n");

  const [storesRes, ticketsRes] = await Promise.all([
    supabase.from("stores").select("*"),
    supabase.from("incident_tickets").select("store_id, status"),
  ]);
  if (storesRes.error) throw storesRes.error;
  if (ticketsRes.error) throw ticketsRes.error;

  const openTicketStores = new Set(ticketsRes.data.filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).map((t) => t.store_id));

  const targets = storesRes.data
    .filter((s) => !KEEP.has(s.store_code))
    .filter((s) => s.recovery_stage == null && !openTicketStores.has(s.id))
    .filter((s) => FIELDS.some((f) => s[f] != null && s[f] !== ""))
    .sort((a, b) => a.store_code.localeCompare(b.store_code));

  console.log(`Stores with leftover work-order fields to CLEAR: ${targets.length}`);
  for (const s of targets) {
    const set = FIELDS.filter((f) => s[f] != null && s[f] !== "").map((f) => `${f}=${String(s[f]).slice(0, 30)}`);
    console.log(`  ${s.store_code}  ${s.store_name}  (${set.join(", ")})`);
  }
  if (KEEP.size) console.log(`\nKept untouched: ${[...KEEP].join(", ")}`);
  console.log("");

  if (targets.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `clear-leftover-work-order-status-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ created_at: new Date().toISOString(), stores_before: targets }, null, 2));
  console.log(`Backup saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Check the list above, then re-run with --confirm:");
    console.log(`  node ./scripts/clear-leftover-work-order-status.mjs ${process.argv.slice(2).join(" ")} --confirm`.replace(/\s+/g, " "));
    return;
  }

  const reset = Object.fromEntries(FIELDS.map((f) => [f, null]));
  const { error } = await supabase.from("stores").update(reset).in("id", targets.map((s) => s.id));
  if (error) throw new Error(`Failed clearing stores: ${error.message}`);
  console.log(`Done. Stores cleared: ${targets.length}. Backup kept at: ${backupPath}`);
}

main().catch((err) => {
  console.error("Clear failed:", err);
  process.exit(1);
});
