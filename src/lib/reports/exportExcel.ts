import * as XLSX from "xlsx";
import type { StoreWithAssets, MaintenanceRecord } from "@/types/database";
import { regionFromZone, zoneCode } from "@/lib/recovery";

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
