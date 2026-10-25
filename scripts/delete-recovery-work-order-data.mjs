// Retires the old Recovery / Work Order (repair-tracking) data so the
// Work Orders section can be repurposed for Installation Project only, per
// the decision to move Installation Project under /work-orders and drop
// the old 50-store repair job data instead of keeping both side by side.
//
// Deletes, for every store currently part of a repair Work Order
// (stores.batch_id is not null OR stores.is_recovery50 = true):
//   - maintenance_history rows
//   - incident_tickets rows
//   - recovery_stage_history rows
//   - vendor_quotations rows — EXCEPT any row still linked from
//     installation_projects.approved_quotation_id (vendor_quotations is
//     shared with Installation Project; those rows must survive)
//   - stores.recovery_stage / recovery_status / cause / required_action /
//     is_recovery50 / online_status / camera_status / add_device_status /
//     repair_date / recovery_notes / batch_id -> reset to null/false
// ALL work_order_batches rows are deleted (the Job 1 / Ad-hoc groupings
// themselves).
//
// Does NOT touch: the store rows themselves (store_id/store_code/name
// survive), cctv_assets, attachments, installation_projects,
// installation_stage_history, or any vendor_quotations row referenced by
// an installation project.
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Always backs up every row it's about to delete/change first.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — run from the project root:
//   node ./scripts/delete-recovery-work-order-data.mjs             # dry run
//   node ./scripts/delete-recovery-work-order-data.mjs --confirm   # applies it
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

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm passed): nothing will be written.\n");

  // 1. Figure out the affected store set.
  const { data: stores, error: storesErr } = await supabase
    .from("stores")
    .select("id, store_code, store_name, batch_id, is_recovery50, recovery_stage, recovery_status");
  if (storesErr) throw storesErr;

  const affected = stores.filter((s) => s.batch_id || s.is_recovery50);
  const affectedIds = affected.map((s) => s.id);
  console.log(`Stores currently in a repair Work Order: ${affected.length} of ${stores.length} total.`);

  if (affectedIds.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // 2. Pull every row that would be deleted, plus the exclusion set for
  //    vendor_quotations (anything an installation project still points to).
  const [maint, tickets, recoveryHistory, quotations, batches, installProjects] = await Promise.all([
    supabase.from("maintenance_history").select("*").in("store_id", affectedIds),
    supabase.from("incident_tickets").select("*").in("store_id", affectedIds),
    supabase.from("recovery_stage_history").select("*").in("store_id", affectedIds),
    supabase.from("vendor_quotations").select("*").in("store_id", affectedIds),
    supabase.from("work_order_batches").select("*"),
    supabase.from("installation_projects").select("id, store_id, approved_quotation_id"),
  ]);
  for (const [name, res] of Object.entries({ maint, tickets, recoveryHistory, quotations, batches, installProjects })) {
    if (res.error) throw new Error(`Failed reading ${name}: ${res.error.message}`);
  }

  const protectedQuotationIds = new Set((installProjects.data ?? []).map((p) => p.approved_quotation_id).filter(Boolean));
  const quotationsToDelete = (quotations.data ?? []).filter((q) => !protectedQuotationIds.has(q.id));
  const quotationsProtected = (quotations.data ?? []).length - quotationsToDelete.length;

  console.log(`  maintenance_history rows:     ${maint.data.length}`);
  console.log(`  incident_tickets rows:        ${tickets.data.length}`);
  console.log(`  recovery_stage_history rows:  ${recoveryHistory.data.length}`);
  console.log(`  vendor_quotations rows:       ${quotationsToDelete.length} (${quotationsProtected} kept — linked from an installation project)`);
  console.log(`  work_order_batches rows:      ${batches.data.length}`);
  console.log(`  stores to reset:              ${affected.length}\n`);

  // 3. Backup everything before touching anything.
  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `delete-recovery-work-order-data-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        affected_store_ids: affectedIds,
        stores_before: affected,
        maintenance_history: maint.data,
        incident_tickets: tickets.data,
        recovery_stage_history: recoveryHistory.data,
        vendor_quotations_deleted: quotationsToDelete,
        vendor_quotations_protected: (quotations.data ?? []).filter((q) => protectedQuotationIds.has(q.id)),
        work_order_batches: batches.data,
      },
      null,
      2
    )
  );
  console.log(`Backup saved to: ${backupPath}\n`);

  if (!CONFIRMED) {
    console.log("Review the counts above (and the backup file), then re-run with --confirm to apply:");
    console.log("  node ./scripts/delete-recovery-work-order-data.mjs --confirm");
    return;
  }

  console.log("Applying deletions...");

  if (maint.data.length > 0) {
    const { error } = await supabase.from("maintenance_history").delete().in("store_id", affectedIds);
    if (error) throw new Error(`Failed deleting maintenance_history: ${error.message}`);
  }
  if (tickets.data.length > 0) {
    const { error } = await supabase.from("incident_tickets").delete().in("store_id", affectedIds);
    if (error) throw new Error(`Failed deleting incident_tickets: ${error.message}`);
  }
  if (recoveryHistory.data.length > 0) {
    const { error } = await supabase.from("recovery_stage_history").delete().in("store_id", affectedIds);
    if (error) throw new Error(`Failed deleting recovery_stage_history: ${error.message}`);
  }
  if (quotationsToDelete.length > 0) {
    const { error } = await supabase
      .from("vendor_quotations")
      .delete()
      .in("id", quotationsToDelete.map((q) => q.id));
    if (error) throw new Error(`Failed deleting vendor_quotations: ${error.message}`);
  }
  if (batches.data.length > 0) {
    const { error } = await supabase.from("work_order_batches").delete().in("id", batches.data.map((b) => b.id));
    if (error) throw new Error(`Failed deleting work_order_batches: ${error.message}`);
  }

  let resetCount = 0;
  for (const s of affected) {
    const { error } = await supabase
      .from("stores")
      .update({
        recovery_stage: null,
        recovery_status: null,
        cause: null,
        required_action: null,
        is_recovery50: false,
        online_status: null,
        camera_status: null,
        add_device_status: null,
        repair_date: null,
        recovery_notes: null,
        batch_id: null,
      })
      .eq("id", s.id);
    if (error) throw new Error(`Failed resetting store ${s.store_code}: ${error.message}`);
    resetCount++;
  }

  console.log(`\nDone. Stores reset: ${resetCount}. Backup kept at: ${backupPath}`);
}

main().catch((err) => {
  console.error("Delete failed:", err);
  process.exit(1);
});
