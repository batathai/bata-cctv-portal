import * as XLSX from "xlsx";
import type { StoreWithAssets, MaintenanceRecord, IncidentTicket, RecoveryStatus, RecoveryStageHistoryEntry } from "@/types/database";
import { regionFromZone, zoneCode, deriveRecoveryStatus, getEffectiveRecoveryStage } from "@/lib/recovery";
import { getStatusLabel } from "@/components/ui/Badge";

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

// Trimmed from the original ~20-column dump down to what was asked to be
// kept: dropped HDD Status, Playback Status, ISP, Hik-Connect Status,
// Hik-Connect Owner, Cameras Working, Cameras Failed, Province, Supplier —
// everything else (including NVR Brand/Model/Serial/Online, Cameras Total,
// HDD Capacity) stays, since those were never asked to be removed.
export function exportStoresToExcel(stores: StoreWithAssets[], filename = "bata-asset-register.xlsx") {
  const rows = stores.map((s) => ({
    "Store Code": s.store_code,
    "Store Name": s.store_name,
    Region: regionFromZone(s.zone),
    Zone: zoneCode(s.zone),
    Status: getStatusLabel(s.overall_status),
    "NVR Brand": s.asset?.nvr_brand ?? "",
    "NVR Model": s.asset?.nvr_model ?? "",
    "NVR Serial": s.asset?.nvr_serial ?? "",
    "NVR Online": s.asset?.nvr_online ? "Yes" : "No",
    "Cameras Total": s.asset?.camera_total ?? "",
    "HDD Capacity": s.asset?.hdd_capacity ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asset Register");
  download(wb, filename);
}

export function exportMaintenanceToExcel(records: MaintenanceRecord[], storeMap: Map<string, StoreWithAssets>, filename = "bata-maintenance-history.xlsx") {
  const rows = records.map((r) => ({
    "Ticket Ref": r.ticket_ref,
    "Store Code": storeMap.get(r.store_id)?.store_code,
    "Store Name": storeMap.get(r.store_id)?.store_name,
    Date: r.issue_date,
    Vendor: r.vendor,
    Problem: r.problem,
    "Root Cause": r.root_cause,
    Resolution: r.resolution,
    "Cost (THB)": r.cost,
    Technician: r.technician,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Maintenance History");
  download(wb, filename);
}

// deriveRecoveryStatus(store) reads `recovery_status` — a category set once
// at import time — falling back to raw asset fields if it's null. It does
// NOT know about `overall_status`, the field EditableStatusBadge actually
// writes to everywhere else in the app (Asset Register, Work Orders,
// Dashboard, Status, Store Detail). Once someone manually flips a store's
// status to Offline/Partial there, `recovery_status` is never updated to
// match, so deriveRecoveryStatus keeps reporting "Normal" forever — e.g.
// store 54022 (Central Mahachai) exported as Online Status "Online" /
// Cause "ใช้งานปกติ" here while the app itself showed it as Offline.
// `overall_status` is the live, single source of truth (see
// EditableStatusBadge's comment), so every label below is anchored to it —
// deriveRecoveryStatus is only used to add finer detail (which kind of
// problem) when it doesn't contradict that live status.
const CAUSE_LABEL: Record<RecoveryStatus, string> = {
  Normal: "ใช้งานปกติ ",
  "Camera Issue": "CCTV Camera Failure",
  "DVR Failure": "DVR Failure",
  "Device Not Registered": "Device Not Registered",
};

function onlineStatusLabel(store: StoreWithAssets): "Online" | "Offline" | "Unknown" {
  if (store.overall_status === "Offline") return "Offline";
  if (store.overall_status === "Unknown") return "Unknown";
  return "Online"; // Healthy or Partial — the NVR itself is still reachable, only camera coverage may be degraded
}

function cameraStatusLabel(store: StoreWithAssets): "OK" | "Partial" | "Not Work" {
  if (store.overall_status === "Healthy") return "OK";
  if (store.overall_status === "Partial") return "Partial";
  return "Not Work"; // Offline or Unknown
}

function causeLabel(store: StoreWithAssets): string {
  const derived = deriveRecoveryStatus(store);
  // Trust the finer Camera Issue / DVR Failure / Device Not Registered
  // classification only when it agrees the store actually has a problem.
  // If overall_status says something's wrong but recovery_status was never
  // updated to match (still reads "Normal"), report the real live status
  // instead of the stale "ใช้งานปกติ".
  if (store.overall_status !== "Healthy" && derived === "Normal") {
    return getStatusLabel(store.overall_status);
  }
  return CAUSE_LABEL[derived];
}

function addDeviceStatusLabel(store: StoreWithAssets): string {
  return store.hikconnect?.ivms_account ? "Registered / Added Successfully" : "Not Yet Registered in the System";
}

/**
 * Matches the exact column layout of the team's own "50 Stores Summary"
 * reference file (Code / Store Name / DM / Status / Online Status / Camera
 * Status / Add Device Status / Cause), plus a Remark column — every value
 * is computed live from the current store + ticket + stage-history state,
 * not the original import snapshot. That's intentional: a store that's
 * since been fixed and Verified will show "ใช้งานปกติ"/"OK"/"Online" here
 * even though the original reference file recorded it as "DVR Failure" —
 * this export reflects the CURRENT Work Order state. `history` should be
 * the full recoveryStageHistory list (unfiltered — this function filters
 * per store itself).
 */
export function exportWorkOrdersToExcel(
  stores: StoreWithAssets[],
  tickets: IncidentTicket[],
  history: RecoveryStageHistoryEntry[],
  filename = "work-orders-summary.xlsx"
) {
  const rows = stores.map((s) => {
    const stage = getEffectiveRecoveryStage(s, tickets);
    // Most recent note left against this store, current-stage remarks and
    // actual stage-transition notes alike — whichever was logged last.
    const latestNote = [...history]
      .filter((h) => h.store_id === s.id && h.note)
      .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))[0]?.note;
    return {
      Code: s.store_code,
      "Store Name": s.store_name,
      DM: zoneCode(s.zone),
      Status: stage === "Verified" || stage === "Completed" ? "Closed" : "Open",
      "Online Status": onlineStatusLabel(s),
      "Camera Status": cameraStatusLabel(s),
      "Add Device Status": addDeviceStatusLabel(s),
      Cause: causeLabel(s),
      Remark: latestNote ?? s.recovery_notes ?? "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Work Orders Summary");
  download(wb, filename);
}

/**
 * "Healthy"/"Health Score" are internal keys/metrics that don't exist
 * anywhere in the actual product UI — the app only ever shows the person
 * Online/Partial/Offline/Unknown (see the status-edit dropdown on any store),
 * and no numeric score at all. This export mirrors exactly that: real status
 * labels via getStatusLabel (the same mapping the on-screen badges use), no
 * score/points anywhere.
 */
export function exportExecutiveSummaryToExcel(stores: StoreWithAssets[], filename = "bata-executive-summary.xlsx") {
  const counts = { Healthy: 0, Partial: 0, Offline: 0, Unknown: 0 } as Record<string, number>;
  stores.forEach((s) => (counts[s.overall_status] = (counts[s.overall_status] ?? 0) + 1));

  const summaryRows = [
    { Metric: "Total Stores", Value: stores.length },
    { Metric: "Online", Value: counts.Healthy ?? 0 },
    { Metric: "Partial", Value: counts.Partial ?? 0 },
    { Metric: "Offline", Value: counts.Offline ?? 0 },
    { Metric: "Unknown", Value: counts.Unknown ?? 0 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      stores.map((s) => ({
        "Store Code": s.store_code,
        "Store Name": s.store_name,
        Region: regionFromZone(s.zone),
        Zone: zoneCode(s.zone),
        Status: getStatusLabel(s.overall_status),
      }))
    ),
    "Store Status"
  );
  download(wb, filename);
}
