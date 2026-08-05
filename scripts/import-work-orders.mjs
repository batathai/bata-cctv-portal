// Bulk-imports the "first 50 stores" repair survey (Excel) into real Work
// Orders — ALL 50 rows get a work order opened, including the 13 rows whose
// Cause is "Normal" (per the user's decision: those get flagged too, and
// will be triaged/filled in manually afterward rather than guessed here).
//
// For each row this:
//   1. Updates stores.online_status/camera_status/add_device_status to match
//      the row (always — this is just factual survey data).
//   2. For rows with a real Cause (DVR Failure / CCTV Camera Failure /
//      Device Not Registered): also sets stores.recovery_status/cause/
//      required_action, and opens an incident_ticket with the matching
//      issue_type (see CAUSE_MAP below).
//   3. For rows with Cause = "Normal": does NOT set recovery_status/cause/
//      required_action (nothing to say yet) — only opens a bare
//      incident_ticket (issue_type left blank) so the store shows up on the
//      Work Orders page, ready for the store to be classified by hand via
//      Edit Detail / the Work Order stage editor.
// Either way this is exactly what clicking "New Ticket" would produce (see
// NewTicketModal.tsx / src/lib/ticketWrite.ts) — same audit trail on the
// store's Repair Tickets card.
//
// Expected columns (exact header names): Code, Store Name, DM, Online Status,
// Camera Status, Add Device Status, Cause, Required Action. Extra columns
// (Group, Status, DM) are read only for logging/cross-checks, never written.
//
// SAFE BY DEFAULT: no flags = DRY RUN, nothing written. Add --confirm to
// apply. Always backs up the exact rows it's about to change first (dry run
// or not), to backups/import-work-orders-backup-<timestamp>.json.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — run from the project root:
//   node ./scripts/import-work-orders.mjs "C:\path\to\50-stores.xlsx"             # dry run
//   node ./scripts/import-work-orders.mjs "C:\path\to\50-stores.xlsx" --confirm   # applies it
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.includes("--confirm");
const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node ./scripts/import-work-orders.mjs <path-to-excel-file> [--confirm]");
  process.exit(1);
}

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

// Cause (Excel, free text) -> [stores.recovery_status enum, ticket issue_type enum]
// Confirmed with the user — see conversation: DVR Failure -> NVR Offline,
// CCTV Camera Failure -> Camera Failure, Device Not Registered -> Hik-Connect Failure.
const CAUSE_MAP = {
  "DVR Failure": { recovery_status: "DVR Failure", issue_type: "NVR Offline" },
  "CCTV Camera Failure": { recovery_status: "Camera Issue", issue_type: "Camera Failure" },
  "Device Not Registered": { recovery_status: "Device Not Registered", issue_type: "Hik-Connect Failure" },
};
const NORMAL_CAUSE = "ใช้งานปกติ"; // trimmed match — the source file has a trailing space on this one
const NORMAL_TICKET_NOTE = "Opened as part of the first-50 store onboarding batch. No issue flagged in the survey — pending manual review/classification.";

const ADD_DEVICE_MAP = {
  "Registered / Added Successfully": "Registered",
  "Not Yet Registered in the System": "Not Registered",
};

const CAMERA_STATUS_VALUES = new Set(["OK", "Partial", "Not Work"]);
const ONLINE_STATUS_VALUES = new Set(["Online", "Offline"]); // "Unknown" in the sheet has no DB equivalent — left unset
const OPEN_TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Waiting Parts"];

function readRows(path) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

async function main() {
  console.log(CONFIRMED ? "Running with --confirm: changes WILL be written.\n" : "DRY RUN (no --confirm passed): nothing will be written.\n");

  const rows = readRows(filePath);
  console.log(`Read ${rows.length} row(s) from ${filePath}\n`);

  const { data: storesRaw, error: storesErr } = await supabase
    .from("stores")
    .select("id, store_code, store_name, zone, recovery_status, cause, required_action, online_status, camera_status, add_device_status");
  if (storesErr) throw storesErr;
  const storeByCode = new Map(storesRaw.map((s) => [String(s.store_code).trim(), s]));

  const { data: existingTickets, error: ticketsErr } = await supabase.from("incident_tickets").select("*");
  if (ticketsErr) throw ticketsErr;

  const plan = []; // { row, store, kind: "failure" | "normal-batch", action, mapped, skipTicket, zoneMismatch }
  const notFound = [];

  for (const row of rows) {
    const code = String(row["Code"]).trim();
    const cause = String(row["Cause"] ?? "").trim();
    const store = storeByCode.get(code);

    if (!store) {
      notFound.push({ code, storeName: row["Store Name"] });
      plan.push({ row, action: "skip-not-found" });
      continue;
    }

    const zoneStr = row["DM"] != null ? String(row["DM"]).trim() : null;
    const zoneMismatch = zoneStr && store.zone && zoneStr !== String(store.zone).trim();

    if (cause === NORMAL_CAUSE) {
      const alreadyOpen = existingTickets.some((t) => t.store_id === store.id && t.issue_type === null && OPEN_TICKET_STATUSES.includes(t.status));
      plan.push({ row, store, kind: "normal-batch", action: "update", mapped: { recovery_status: null, issue_type: null }, skipTicket: alreadyOpen, zoneMismatch });
      continue;
    }

    const mapped = CAUSE_MAP[cause];
    if (!mapped) {
      plan.push({ row, store, action: "skip-unknown-cause" });
      continue;
    }

    // Idempotency guard: don't open a second open ticket of the same type
    // for a store that already has one (e.g. this script run twice).
    const alreadyOpen = existingTickets.some(
      (t) => t.store_id === store.id && t.issue_type === mapped.issue_type && OPEN_TICKET_STATUSES.includes(t.status)
    );

    plan.push({ row, store, kind: "failure", action: "update", mapped, skipTicket: alreadyOpen, zoneMismatch });
  }

  const toUpdate = plan.filter((p) => p.action === "update");
  const failureRows = toUpdate.filter((p) => p.kind === "failure");
  const normalBatchRows = toUpdate.filter((p) => p.kind === "normal-batch");
  const skipUnknown = plan.filter((p) => p.action === "skip-unknown-cause");

  console.log(`Will open a work order with a classified cause: ${failureRows.length} store(s)`);
  console.log(`Will open a work order, unclassified (was "Normal" in the sheet): ${normalBatchRows.length} store(s)`);
  console.log(`Not found in the system:                          ${notFound.length} store(s)`);
  console.log(`Unrecognized Cause value:                         ${skipUnknown.length} store(s)`);

  if (notFound.length > 0) {
    console.log("\nNot found (check these codes manually):");
    notFound.forEach((n) => console.log(`  ${n.code} — ${n.storeName}`));
  }
  if (skipUnknown.length > 0) {
    console.log("\nUnrecognized Cause (skipped, not applied):");
    skipUnknown.forEach((p) => console.log(`  ${p.row["Code"]} — "${p.row["Cause"]}"`));
  }
  const mismatches = toUpdate.filter((p) => p.zoneMismatch);
  if (mismatches.length > 0) {
    console.log("\nDM column doesn't match the store's zone on file (double-check these, not blocking):");
    mismatches.forEach((p) => console.log(`  ${p.store.store_code} — sheet DM ${p.row["DM"]} vs system zone ${p.store.zone}`));
  }
  const alreadyTicketed = toUpdate.filter((p) => p.skipTicket);
  if (alreadyTicketed.length > 0) {
    console.log(`\n${alreadyTicketed.length} store(s) already have a matching open ticket — will update store fields but NOT create a duplicate ticket.`);
  }

  console.log("\nPlanned changes:");
  failureRows.forEach((p) => {
    console.log(`  ${p.store.store_code} (${p.store.store_name}): recovery_status -> ${p.mapped.recovery_status}, ticket -> ${p.skipTicket ? "(skipped, already open)" : p.mapped.issue_type}`);
  });
  normalBatchRows.forEach((p) => {
    console.log(`  ${p.store.store_code} (${p.store.store_name}): recovery_status unchanged, ticket -> ${p.skipTicket ? "(skipped, already open)" : "(open, no issue type — pending manual triage)"}`);
  });

  // Always back up the exact current state of every store this run will touch.
  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `import-work-orders-backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        source_file: filePath,
        stores: toUpdate.map((p) => ({
          id: p.store.id,
          store_code: p.store.store_code,
          recovery_status: p.store.recovery_status,
          cause: p.store.cause,
          required_action: p.store.required_action,
          online_status: p.store.online_status,
          camera_status: p.store.camera_status,
          add_device_status: p.store.add_device_status,
        })),
      },
      null,
      2
    )
  );
  console.log(`\nBackup of current state saved to: ${backupPath}`);

  if (!CONFIRMED) {
    console.log("\nReview the plan above, then re-run with --confirm to apply:");
    console.log(`  node ./scripts/import-work-orders.mjs "${filePath}" --confirm`);
    return;
  }

  console.log("\nApplying changes...");
  let updated = 0,
    ticketsCreated = 0;

  for (const p of toUpdate) {
    const row = p.row;
    const onlineStatusRaw = row["Online Status"] != null ? String(row["Online Status"]).trim() : null;
    const cameraStatusRaw = row["Camera Status"] != null ? String(row["Camera Status"]).trim() : null;
    const addDeviceRaw = row["Add Device Status"] != null ? String(row["Add Device Status"]).trim() : null;

    const storePatch = {};
    if (onlineStatusRaw && ONLINE_STATUS_VALUES.has(onlineStatusRaw)) storePatch.online_status = onlineStatusRaw;
    if (cameraStatusRaw && CAMERA_STATUS_VALUES.has(cameraStatusRaw)) storePatch.camera_status = cameraStatusRaw;
    if (addDeviceRaw && ADD_DEVICE_MAP[addDeviceRaw]) storePatch.add_device_status = ADD_DEVICE_MAP[addDeviceRaw];

    if (p.kind === "failure") {
      const causeText = String(row["Cause"]).trim();
      const requiredAction = row["Required Action"] != null ? String(row["Required Action"]).trim() : null;
      storePatch.recovery_status = p.mapped.recovery_status;
      storePatch.cause = causeText;
      storePatch.required_action = requiredAction;
    }
    // kind === "normal-batch": no recovery_status/cause/required_action written — left for manual triage.

    if (Object.keys(storePatch).length > 0) {
      const { error: updErr } = await supabase.from("stores").update(storePatch).eq("id", p.store.id);
      if (updErr) throw new Error(`Failed updating store ${p.store.store_code}: ${updErr.message}`);
    }
    updated++;

    if (!p.skipTicket) {
      const ticketPayload = {
        store_id: p.store.id,
        status: "Open",
        issue_type: p.mapped.issue_type, // null for normal-batch rows
        description: p.kind === "failure" ? (row["Required Action"] != null ? String(row["Required Action"]).trim() : String(row["Cause"]).trim()) : NORMAL_TICKET_NOTE,
      };
      const { error: tkErr } = await supabase.from("incident_tickets").insert(ticketPayload);
      if (tkErr) throw new Error(`Failed creating ticket for store ${p.store.store_code}: ${tkErr.message}`);
      ticketsCreated++;
    }
  }

  console.log(`\nDone. Stores updated: ${updated}. Tickets created: ${ticketsCreated}.`);
  console.log("Refresh the Work Orders page to see them.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
