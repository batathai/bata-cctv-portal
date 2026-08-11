import * as XLSX from "xlsx";
import type { StoreWithAssets, MaintenanceRecord, IncidentTicket, RecoveryStatus, RecoveryStageHistoryEntry } from "@/types/database";
import { regionFromZone, zoneCode, deriveRecoveryStatus, getEffectiveRecoveryStage } from "@/lib/recovery";

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function exportStoresToExcel(stores: StoreWithAssets[], filename = "bata-asset-register.xlsx") {
  const rows = stores.map((s) => ({
    "Store Code": s.store_code,
    "Store Name": s.store_name,
    Region: regionFromZone(s.zone),
    Zone: zoneCode(s.zone),
    Province: s.province,
    Supplier: s.supplierName,
    "Overall Status": s.overall_status,
    "Health Score": s.healthScore,
    "NVR Brand": s.asset?.nvr_brand,
    "NVR Model": s.asset?.nvr_model,
    "NVR Serial": s.asset?.nvr_serial,
    "NVR Online": s.asset?.nvr_online ? "Yes" : "No",
    "Cameras Total": s.asset?.camera_total,
    "Cameras Working": s.asset?.camera_working,
    "Cameras Failed": s.asset?.camera_failed,
    "HDD Capacity": s.asset?.hdd_capacity,
    "HDD Status": s.asset?.hdd_status,
    "Playback Status": s.asset?.playback_status,
    ISP: s.asset?.isp,
    "Hik-Connect Status": s.hikconnect?.hikconnect_status,
    "Hik-Connect Owner": s.hikconnect?.owner_account,
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

// Column labels below are derived from deriveRecoveryStatus(store) — the
// same single source of truth the rest of the app uses for the Recovery
// Status badge — rather than the frozen store.cause/store.overall_status
// snapshot from whenever the store was first imported/opened. Without this,
// a store that's since been fixed and Verified would still export as "DVR
// Failure" forever, the exact staleness bug already fixed for the on-screen
// badges (see recovery.ts's deriveRecoveryStatus comment) — this export is
// meant to reflect the CURRENT Work Order state, not the original snapshot.
const CAUSE_LABEL: Record<RecoveryStatus, string> = {
  Normal: "ใช้งานปกติ ",
  "Camera Issue": "CCTV Camera Failure",
  "DVR Failure": "DVR Failure",
  "Device Not Registered": "Device Not Registered",
};

function onlineStatusLabel(store: StoreWithAssets): "Online" | "Offline" | "Unknown" {
  const status = deriveRecoveryStatus(store);
  if (status === "Device Not Registered") return "Unknown";
  if (status === "DVR Failure") return "Offline";
  return "Online"; // Normal or Camera Issue — the NVR itself is still reachable
}

function cameraStatusLabel(store: StoreWithAssets): "OK" | "Partial" | "Not Work" {
  const status = deriveRecoveryStatus(store);
  if (status === "Device Not Registered" || status === "DVR Failure") return "Not Work";
  if (status === "Normal") return "OK";
  // Camera Issue — distinguish "every camera down" from "some still working"
  const total = store.asset?.camera_total ?? 0;
  const failed = store.asset?.camera_failed ?? 0;
  if (total > 0 && failed >= total) return "Not Work";
  return "Partial";
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
      Cause: CAUSE_LABEL[deriveRecoveryStatus(s)],
      Remark: latestNote ?? s.recovery_notes ?? "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Work Orders Summary");
  download(wb, filename);
}

export function exportExecutiveSummaryToExcel(stores: StoreWithAssets[], filename = "bata-executive-summary.xlsx") {
  const counts = { Healthy: 0, Partial: 0, Offline: 0, Unknown: 0 } as Record<string, number>;
  stores.forEach((s) => (counts[s.overall_status] = (counts[s.overall_status] ?? 0) + 1));
  const avg = stores.length ? Math.round(stores.reduce((a, s) => a + s.healthScore, 0) / stores.length) : 0;

  const summaryRows = [
    { Metric: "Total Stores", Value: stores.length },
    { Metric: "Healthy", Value: counts.Healthy ?? 0 },
    { Metric: "Partial", Value: counts.Partial ?? 0 },
    { Metric: "Offline", Value: counts.Offline ?? 0 },
    { Metric: "Unknown", Value: counts.Unknown ?? 0 },
    { Metric: "Average Health Score", Value: avg },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      stores.map((s) => ({ "Store Code": s.store_code, "Store Name": s.store_name, Zone: s.zone, Status: s.overall_status, Score: s.healthScore }))
    ),
    "Store Scores"
  );
  download(wb, filename);
}
