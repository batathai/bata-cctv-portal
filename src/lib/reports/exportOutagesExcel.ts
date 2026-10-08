import * as XLSX from "xlsx";
import type { DeviceOutage, StoreWithAssets } from "@/types/database";
import { zoneCode, regionFromZone } from "@/lib/recovery";
import { formatDateTime, outageMinutes, summarizeByStore } from "@/lib/monitoring";

/**
 * Device outage history export (R10, R12). Client-side `xlsx` like the other
 * exports in this folder. Three sheets:
 *  - Outages: one row per outage
 *  - By Store: totals per store for SLA follow-up
 *  - After-hours: stores whose DVR went off outside business hours (24h policy)
 */
export function exportOutagesToExcel(
  outages: DeviceOutage[],
  storesById: Map<string, StoreWithAssets>,
  range: { from: string; to: string },
  now: Date = new Date()
) {
  const outageRows = outages
    .map((o) => ({ o, s: storesById.get(o.store_id) }))
    .filter((x): x is { o: DeviceOutage; s: StoreWithAssets } => !!x.s)
    .map(({ o, s }) => ({
      "Store Code": s.store_code,
      "Store Name": s.store_name,
      Region: regionFromZone(s.zone),
      Zone: zoneCode(s.zone),
      "Started (last seen)": formatDateTime(o.started_at),
      Detected: formatDateTime(o.detected_at),
      "Back Online": o.ended_at ? formatDateTime(o.ended_at) : "Still offline",
      "Duration (min)": Math.round(outageMinutes(o, now) ?? 0),
      "In Business Hours": o.during_business_hours ? "Yes" : "No",
      Muted: o.muted ? "Yes" : "No",
      "Instant Email": o.alert_sent_at ? formatDateTime(o.alert_sent_at) : "",
      "Morning Summary": o.summary_sent_at ? formatDateTime(o.summary_sent_at) : "",
      "Late-open Email": o.late_open_alert_sent_at ? formatDateTime(o.late_open_alert_sent_at) : "",
      "Central Suspect": o.central_suspect ? "Yes" : "No",
      Note: o.note ?? "",
    }));

  const summaries = summarizeByStore(outages, storesById, now);
  const byStoreRows = summaries.map((x) => ({
    "Store Code": x.store.store_code,
    "Store Name": x.store.store_name,
    Region: regionFromZone(x.store.zone),
    Zone: zoneCode(x.store.zone),
    Outages: x.count,
    "Total Minutes": Math.round(x.totalMinutes),
    "In Business Hours": x.inHours,
    "After Hours": x.afterHours,
    "Longest (min)": Math.round(x.longestMinutes),
  }));

  const afterHoursRows = summaries
    .filter((x) => x.afterHours > 0)
    .sort((a, b) => b.afterHoursNights - a.afterHoursNights)
    .map((x) => {
      const starts = outages
        .filter((o) => o.store_id === x.store.id && !o.during_business_hours)
        .map((o) => {
          const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(o.started_at));
          const h = Number(p.find((v) => v.type === "hour")?.value ?? 0);
          const m = Number(p.find((v) => v.type === "minute")?.value ?? 0);
          // Shift early-morning times past midnight so 22:00 and 01:00 average sensibly.
          return h * 60 + m < 12 * 60 ? h * 60 + m + 1440 : h * 60 + m;
        });
      const avg = starts.length ? Math.round(starts.reduce((a, b) => a + b, 0) / starts.length) % 1440 : null;
      return {
        "Store Code": x.store.store_code,
        "Store Name": x.store.store_name,
        Region: regionFromZone(x.store.zone),
        Zone: zoneCode(x.store.zone),
        "Nights Off": x.afterHoursNights,
        "After-hours Outages": x.afterHours,
        "Last Time": formatDateTime(x.lastAfterHours),
        "Average Off Time": avg == null ? "" : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      };
    });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outageRows), "Outages");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byStoreRows), "By Store");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(afterHoursRows), "After-hours");
  XLSX.writeFile(wb, `bata-device-outages_${range.from}_to_${range.to}.xlsx`);
}
