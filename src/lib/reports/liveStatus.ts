import { formatDateTime, statusSortRank, type DisplayStatus, type LiveRow } from "@/lib/monitoring";

/**
 * DVR status for reports, in the same four groups as the Device Status /
 * Dashboard cards (decision 2026-10-14: the Executive Report shows the iVMS
 * sync status, not the manual overall_status). English only, because the
 * PDF export has no Thai font.
 */
export const REPORT_STATUS_LABEL: Record<DisplayStatus, string> = {
  Offline: "Offline",
  Muted: "Offline (alerts muted)",
  CameraIssue: "Partial - camera repair",
  Confirming: "Online",
  Online: "Online",
  Unknown: "Waiting for first check",
  Stale: "Online",
  NotMonitored: "Not monitored",
};

/** 45 -> "45 min", 80 -> "1 h 20 min", 2520 -> "1 d 18 h" */
export function formatDurationEn(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  return min > 0 ? `${h} h ${min} min` : `${h} h`;
}

/** Last time the iVMS script saw this store (same as "อัปเดตล่าสุด" on Device Status). */
export function lastUpdated(row: LiveRow): string {
  const m = row.monitor;
  if (!m?.monitored) return "";
  return formatDateTime(m.last_checked_at ?? m.last_seen_at);
}

/** Offline first (longest down on top), then camera repair, Online, Not monitored — same order as Device Status. */
export function sortForReport(rows: LiveRow[]): LiveRow[] {
  return [...rows].sort((a, b) => {
    const r = statusSortRank(a.status) - statusSortRank(b.status);
    if (r !== 0) return r;
    const off = (b.offlineMinutes ?? -1) - (a.offlineMinutes ?? -1);
    if (off !== 0) return off;
    return a.store.store_code.localeCompare(b.store.store_code);
  });
}
