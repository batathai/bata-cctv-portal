// Read-only verification: reproduces the Work Orders page's 3 counts
// (openCount card, header "ใบงาน (N)" default list, stage-breakdown sum)
// against live Supabase data using the same getEffectiveRecoveryStage
// single-source-of-truth the page now uses (src/lib/recovery.ts), and
// asserts they agree. Exits non-zero if any invariant fails.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (read-only queries only) — run from
// the project root: node ./scripts/verify-work-orders-counts.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// --- mirrors src/lib/recovery.ts + src/lib/tickets.ts ---
function deriveRecoveryStatus(store) {
  if (store.recovery_status) return store.recovery_status;
  if (!store.asset) return "Normal";
  if (!store.hikconnect || !store.hikconnect.ivms_account) return "Device Not Registered";
  if (!store.asset.nvr_online) return "DVR Failure";
  if (store.asset.camera_failed > 0) return "Camera Issue";
  return "Normal";
}
const OPEN_TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Waiting Parts"];
function hasOpenTicket(storeId, tickets) {
  return tickets.some((t) => t.store_id === storeId && OPEN_TICKET_STATUSES.includes(t.status));
}
function ticketsForStore(storeId, tickets) {
  return tickets.filter((t) => t.store_id === storeId);
}
function needsRepair(store, tickets) {
  return deriveRecoveryStatus(store) !== "Normal" || hasOpenTicket(store.id, tickets);
}
function isRepairCompleted(store, tickets) {
  if (!needsRepair(store, tickets)) return false;
  if (store.recovery_stage === "Completed" || store.recovery_stage === "Verified") return true;
  return ticketsForStore(store.id, tickets).some((t) => t.status === "Completed" || t.status === "Closed");
}
function getEffectiveRecoveryStage(store, tickets) {
  if (store.recovery_stage === "Verified") return "Verified";
  if (isRepairCompleted(store, tickets)) return "Completed";
  return store.recovery_stage ?? "Waiting Vendor Quote";
}
const RECOVERY_STAGES = ["Waiting Vendor Quote", "Waiting Approval", "Waiting Repair", "Repairing", "Completed", "Verified"];
// --- end mirror ---

const { data: storesRaw, error: storesErr } = await supabase
  .from("stores")
  .select("*, cctv_assets(*), hikconnect_devices(*), suppliers(name)");
if (storesErr) throw storesErr;

const { data: tickets, error: ticketsErr } = await supabase.from("incident_tickets").select("*");
if (ticketsErr) throw ticketsErr;

const stores = storesRaw.map((s) => {
  const asset = Array.isArray(s.cctv_assets) ? s.cctv_assets[0] : s.cctv_assets;
  const hikconnect = Array.isArray(s.hikconnect_devices) ? s.hikconnect_devices[0] : s.hikconnect_devices;
  return { ...s, asset: asset ?? null, hikconnect: hikconnect ?? null };
});

const workOrderStores = stores.filter((s) => needsRepair(s, tickets));

// stage breakdown (source of truth)
const stageCounts = Object.fromEntries(RECOVERY_STAGES.map((s) => [s, 0]));
for (const s of workOrderStores) {
  const stage = getEffectiveRecoveryStage(s, tickets);
  stageCounts[stage] += 1;
}
const stageSum = Object.values(stageCounts).reduce((a, b) => a + b, 0);

// "เปิดอยู่ทั้งหมด" card: sum of non-terminal buckets
const openCount = RECOVERY_STAGES.filter((s) => s !== "Completed" && s !== "Verified").reduce((sum, s) => sum + stageCounts[s], 0);

// header "ใบงาน (N)" default list: same terminal-stage check, no other filters
const headerList = workOrderStores.filter((s) => {
  const stage = getEffectiveRecoveryStage(s, tickets);
  return stage !== "Completed" && stage !== "Verified";
});

console.log("workOrderStores (needsRepair) total:", workOrderStores.length);
console.log("stageCounts:", stageCounts, "-> sum:", stageSum);
console.log("openCount (card 'เปิดอยู่ทั้งหมด'):     ", openCount);
console.log("headerList.length ('ใบงาน (N)' default):", headerList.length);

let ok = true;
function assertEqual(name, a, b) {
  const pass = a === b;
  ok = ok && pass;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${a} ${pass ? "==" : "!="} ${b}`);
}

console.log("\n--- Invariants ---");
assertEqual("stageCounts sum == workOrderStores.length", stageSum, workOrderStores.length);
assertEqual("openCount == headerList.length (default view)", openCount, headerList.length);
assertEqual(
  "openCount == sum of non-terminal stageCounts",
  openCount,
  RECOVERY_STAGES.filter((s) => s !== "Completed" && s !== "Verified").reduce((sum, s) => sum + stageCounts[s], 0)
);

process.exit(ok ? 0 : 1);
