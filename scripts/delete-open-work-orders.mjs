// Deletes the OPEN repair work orders so the Dashboard "Repair" card starts
// from 0 (decision 2026-10-13). "Open" uses the same rule as the Dashboard:
// the store has a work order (an open ticket or a recovery_stage set) and its
// effective stage is not Completed/Verified.
//
// Finished work orders (Completed / Verified, e.g. Robinson Chachoengsao) are
// KEPT untouched, and so are their Work Order Jobs (work_order_batches).
//
// For each open store it deletes:
//   - incident_tickets rows
//   - recovery_stage_history rows (stage moves + remarks)
//   - vendor_quotations rows, except any linked from installation_projects
// and resets on stores: recovery_stage, recovery_status, cause,
// required_action, repair_date, recovery_notes, batch_id -> null.
//
// Does NOT touch: store rows themselves, cctv_assets, maintenance_history,
// attachments, store_monitor / online_status (written by the iVMS sync).
//
// --include-finished also deletes Completed/Verified work orders, except the
// store codes listed in --keep (comma-separated), e.g.:
//   node ./scripts/delete-open-work-orders.mjs --include-finished --keep=54044
//
// SAFE BY DEFAULT: no flags = DRY RUN (lists the stores, writes a backup,
// changes nothing). Add --confirm to apply.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — run from the project root:
//   node ./scripts/delete-open-work-orders.mjs             # dry run
//   node ./scripts/delete-open-work-orders.mjs --confirm   # applies it
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.includes("--confirm");
const INCLUDE_FINISHED = process.argv.includes("--include-finished");
const KEEP_CODES = new Set(
  (process.argv.find((a) => a.startsWith("--keep=")) ?? "--keep=").slice(7).split(",").map((c) => c.trim()).filter(Boolean)
);
const OPEN_TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Waiting Parts"];

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

// Same as getEffectiveRecoveryStage() in src/lib/recovery.ts.
function effectiveStage(store, storeTickets) {
  if (store.recovery_stage === "Verified") return "Verified";
  if (store.recovery_stage === "Completed") return "Completed";
  const anyOpen = storeTickets.some((t) => OPEN_TICKET_STATUSES.includes(t.status));
  if (storeTickets.length > 0 && !anyOpen) return "Completed";
  return store.recovery_stage ?? "Waiting Vendor Quote";
}

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm): nothing will be written.\n");

  const [storesRes, ticketsRes] = await Promise.all([
    supabase.from("stores").select("*"),
    supabase.from("incident_tickets").select("*"),
  ]);
  if (storesRes.error) throw storesRes.error;
  if (ticketsRes.error) throw ticketsRes.error;

  const ticketsByStore = new Map();
  for (const t of ticketsRes.data) {
    if (!ticketsByStore.has(t.store_id)) ticketsByStore.set(t.store_id, []);
    ticketsByStore.get(t.store_id).push(t);
  }

  const open = [];
  const kept = [];
  for (const s of storesRes.data) {
    const st = ticketsByStore.get(s.id) ?? [];
    const hasWorkOrder = st.some((t) => OPEN_TICKET_STATUSES.includes(t.status)) || s.recovery_stage != null;
    if (!hasWorkOrder) continue;
    const stage = effectiveStage(s, st);
    const finished = stage === "Completed" || stage === "Verified";
    if (KEEP_CODES.has(s.store_code) || (finished && !INCLUDE_FINISHED)) kept.push({ s, stage });
    else open.push({ s, stage });
  }
  open.sort((a, b) => a.s.store_code.localeCompare(b.s.store_code));

  console.log(`Work orders to DELETE${INCLUDE_FINISHED ? " (open + finished)" : " (open)"}: ${open.length}`);
  for (const { s, stage } of open) console.log(`  ${s.store_code}  ${s.store_name}  [${stage}]`);
  console.log(`\nWork orders KEPT: ${kept.length}`);
  for (const { s, stage } of kept) console.log(`  ${s.store_code}  ${s.store_name}  [${stage}]`);
  console.log("");

  if (open.length === 0) {
    console.log("Nothing to delete.");
    return;
  }
  const ids = open.map((o) => o.s.id);

  const [historyRes, quotesRes, installRes] = await Promise.all([
    supabase.from("recovery_stage_history").select("*").in("store_id", ids),
    supabase.from("vendor_quotations").select("*").in("store_id", ids),
    supabase.from("installation_projects").select("approved_quotation_id"),
  ]);
  if (historyRes.error) throw historyRes.error;
  if (quotesRes.error) throw quotesRes.error;
  // installation_projects may not exist yet on this database; then nothing is protected.
  const protectedIds = new Set((installRes.error ? [] : installRes.data).map((p) => p.approved_quotation_id).filter(Boolean));
  const quotesToDelete = quotesRes.data.filter((q) => !protectedIds.has(q.id));
  const ticketsToDelete = ticketsRes.data.filter((t) => ids.includes(t.store_id));

  console.log(`  incident_tickets rows:       ${ticketsToDelete.length}`);
  console.log(`  recovery_stage_history rows: ${historyRes.data.length}`);
  console.log(`  vendor_quotations rows:      ${quotesToDelete.length} (${quotesRes.data.length - quotesToDelete.length} kept — linked from an installation project)`);
  console.log(`  stores to reset:             ${open.length}\n`);

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `delete-open-work-orders-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        stores_before: open.map((o) => o.s),
        incident_tickets: ticketsToDelete,
        recovery_stage_history: historyRes.data,
        vendor_quotations_deleted: quotesToDelete,
      },
      null,
      2
    )
  );
  console.log(`Backup saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Check the list above, then re-run with --confirm:");
    console.log(`  node ./scripts/delete-open-work-orders.mjs ${process.argv.slice(2).join(" ")} --confirm`.replace(/\s+/g, " "));
    return;
  }

  console.log("Applying...");
  if (ticketsToDelete.length) {
    const { error } = await supabase.from("incident_tickets").delete().in("id", ticketsToDelete.map((t) => t.id));
    if (error) throw new Error(`Failed deleting incident_tickets: ${error.message}`);
  }
  if (historyRes.data.length) {
    const { error } = await supabase.from("recovery_stage_history").delete().in("store_id", ids);
    if (error) throw new Error(`Failed deleting recovery_stage_history: ${error.message}`);
  }
  if (quotesToDelete.length) {
    const { error } = await supabase.from("vendor_quotations").delete().in("id", quotesToDelete.map((q) => q.id));
    if (error) throw new Error(`Failed deleting vendor_quotations: ${error.message}`);
  }
  const { error: resetErr } = await supabase
    .from("stores")
    .update({
      recovery_stage: null,
      recovery_status: null,
      cause: null,
      required_action: null,
      repair_date: null,
      recovery_notes: null,
      batch_id: null,
    })
    .in("id", ids);
  if (resetErr) throw new Error(`Failed resetting stores: ${resetErr.message}`);

  console.log(`\nDone. Work orders removed: ${open.length}. Backup kept at: ${backupPath}`);
}

main().catch((err) => {
  console.error("Delete failed:", err);
  process.exit(1);
});
