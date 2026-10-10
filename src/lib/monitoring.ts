import type { DeviceOutage, MonitorRun, MonitorSettings, StoreMonitor, StoreWithAssets } from "@/types/database";
import { zoneCode, getRecoveryRegion } from "@/lib/recovery";

/**
 * Pure helpers for Device Offline Monitoring (no Supabase, no React).
 * The HQ script owns the actual Online/Offline decisions — see
 * tools/ivms-monitor/state.py. These helpers only decide how the portal
 * DISPLAYS what the script wrote (stale data, mute, not monitored, ...).
 * Design: docs/workflow/DESIGN-device-offline-monitoring.md
 */

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  id: 1,
  check_interval_minutes: 5,
  confirm_cycles: 2,
  default_open_time: "10:00:00",
  default_close_time: "22:00:00",
  late_open_grace_minutes: 30,
  mass_alert_threshold: 10,
  suspect_ratio: 0.8,
  stale_after_minutes: 15,
  alert_recipients: [],
  admin_recipients: [],
  morning_summary_time: "10:00:00",
  emails_enabled: true,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

export const MAX_MUTE_DAYS = 30;
/** Offline at least this long (and not muted) → Device Status suggests opening a repair ticket. */
export const REPAIR_SUGGEST_MINUTES = 120;
export const TOTAL_STORES_TARGET = 194;
const TZ = "Asia/Bangkok";

// ---------- time ----------

/** "10:00:00" | "10:00" -> 600. Returns null for anything unparseable. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** "10:00:00" -> "10:00" */
export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** Minutes since midnight in Bangkok time. */
export function bangkokMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function bangkokDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "13:05" when today (Bangkok), otherwise "07 ต.ค. 22:10". */
export function formatSeen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  if (bangkokDateKey(d) === bangkokDateKey(now)) return time;
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "2-digit", month: "short" }).format(d);
  return `${date} ${time}`;
}

/** Full Bangkok date + time, for exports. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
}

/** 22 -> "22 นาที", 80 -> "1 ชม. 20 นาที", 2520 -> "1 วัน 18 ชม." */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} นาที`;
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} วัน ${hours} ชม.` : `${days} วัน`;
  return mins > 0 ? `${hours} ชม. ${mins} นาที` : `${hours} ชม.`;
}

export function minutesBetween(fromIso: string | null | undefined, to: Date | string): number | null {
  if (!fromIso) return null;
  const a = new Date(fromIso).getTime();
  const b = (typeof to === "string" ? new Date(to) : to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, (b - a) / 60000);
}

// ---------- business hours ----------

export interface EffectiveHours {
  open: string; // "HH:MM"
  close: string;
  custom: boolean;
}

export function effectiveHours(m: Pick<StoreMonitor, "open_time" | "close_time"> | null | undefined, settings: MonitorSettings): EffectiveHours {
  if (m?.open_time && m?.close_time) return { open: shortTime(m.open_time), close: shortTime(m.close_time), custom: true };
  return { open: shortTime(settings.default_open_time), close: shortTime(settings.default_close_time), custom: false };
}

/** Same rule as the HQ script: open <= t < close, wrapping past midnight when close < open. */
export function isWithinHours(minuteOfDay: number, hours: EffectiveHours): boolean {
  const o = timeToMinutes(hours.open);
  const c = timeToMinutes(hours.close);
  if (o == null || c == null || o === c) return true;
  return o < c ? minuteOfDay >= o && minuteOfDay < c : minuteOfDay >= o || minuteOfDay < c;
}

// ---------- status ----------

export type DisplayStatus = "Offline" | "Muted" | "Confirming" | "Online" | "Unknown" | "Stale" | "NotMonitored";

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  Offline: "Offline",
  Muted: "Muted (Offline)",
  Confirming: "Online · กำลังยืนยัน",
  Online: "Online",
  Unknown: "รอผลตรวจ",
  Stale: "ข้อมูลเก่า",
  NotMonitored: "Not monitored",
};

const SORT_RANK: Record<DisplayStatus, number> = {
  Offline: 0, Muted: 1, Confirming: 2, Stale: 3, Unknown: 4, Online: 5, NotMonitored: 6,
};

export function isMuted(m: Pick<StoreMonitor, "muted_until"> | null | undefined, now: Date = new Date()): boolean {
  return !!m?.muted_until && new Date(m.muted_until).getTime() > now.getTime();
}

export interface MonitorHealth {
  kind: "ok" | "stale" | "never" | "failed" | "partial" | "suspect" | "mismatch" | "notInstalled";
  minutesSinceRun: number | null;
  ivmsTotal: number | null;
  monitoredCount: number;
}

export function monitorHealth(args: {
  latestRun: MonitorRun | null;
  settings: MonitorSettings;
  monitoredCount: number;
  notInstalled?: boolean;
  now?: Date;
}): MonitorHealth {
  const { latestRun, settings, monitoredCount, notInstalled } = args;
  const now = args.now ?? new Date();
  const base = { minutesSinceRun: null as number | null, ivmsTotal: latestRun?.ivms_total ?? null, monitoredCount };
  if (notInstalled) return { ...base, kind: "notInstalled" };
  if (!latestRun) return { ...base, kind: "never" };
  const since = minutesBetween(latestRun.ran_at, now);
  const withSince = { ...base, minutesSinceRun: since };
  if (since != null && since > settings.stale_after_minutes) return { ...withSince, kind: "stale" };
  if (latestRun.status === "failed") return { ...withSince, kind: "failed" };
  if (latestRun.status === "suspect") return { ...withSince, kind: "suspect" };
  if (latestRun.status === "partial") return { ...withSince, kind: "partial" };
  if (latestRun.ivms_total != null && latestRun.ivms_total !== monitoredCount) return { ...withSince, kind: "mismatch" };
  return { ...withSince, kind: "ok" };
}

/** Data on screen can't be trusted as "live" — show every monitored store as stale instead of guessing. */
export function healthIsStale(h: MonitorHealth): boolean {
  return h.kind === "stale" || h.kind === "never" || h.kind === "notInstalled";
}

export function displayStatus(m: StoreMonitor | null | undefined, stale: boolean, now: Date = new Date()): DisplayStatus {
  if (!m || !m.monitored) return "NotMonitored";
  if (stale) return "Stale";
  if (m.state === "Offline") return isMuted(m, now) ? "Muted" : "Offline";
  if (m.state === "Online") return m.offline_streak > 0 ? "Confirming" : "Online";
  return "Unknown";
}

export function statusSortRank(s: DisplayStatus): number {
  return SORT_RANK[s];
}

export type RegionKey = "BKK" | "UPC";

export function regionKey(zone: string): RegionKey {
  return getRecoveryRegion(zone) === "BKK" ? "BKK" : "UPC";
}

export const ZONES_BY_REGION: Record<RegionKey, string[]> = {
  BKK: ["511", "512", "513", "550"],
  UPC: ["520", "530", "540", "560"],
};

// ---------- rows used by the live table ----------

export interface LiveRow {
  store: StoreWithAssets;
  monitor: StoreMonitor | null;
  status: DisplayStatus;
  zone: string;
  region: RegionKey;
  offlineMinutes: number | null;
  hours: EffectiveHours;
  muted: boolean;
}

export function buildLiveRows(stores: StoreWithAssets[], monitors: StoreMonitor[], settings: MonitorSettings, stale: boolean, now: Date = new Date()): LiveRow[] {
  const byStore = new Map(monitors.map((m) => [m.store_id, m]));
  return stores
    .map((store) => {
      const monitor = byStore.get(store.id) ?? null;
      const status = displayStatus(monitor, stale, now);
      const offlineMinutes =
        monitor && monitor.monitored && monitor.state === "Offline" ? minutesBetween(monitor.last_seen_at ?? monitor.state_since, now) : null;
      return {
        store,
        monitor,
        status,
        zone: zoneCode(store.zone),
        region: regionKey(store.zone),
        offlineMinutes,
        hours: effectiveHours(monitor, settings),
        muted: isMuted(monitor, now),
      };
    })
    .sort((a, b) => {
      const r = statusSortRank(a.status) - statusSortRank(b.status);
      if (r !== 0) return r;
      // Longest outage first among offline ones, then by store code.
      const d = (b.offlineMinutes ?? -1) - (a.offlineMinutes ?? -1);
      if (d !== 0) return d;
      return a.store.store_code.localeCompare(b.store.store_code);
    });
}

// ---------- outage history ----------

export interface OutageFilter {
  region: "" | RegionKey;
  zone: string;
  query: string;
  afterHoursOnly: boolean;
  includeMuted: boolean;
}

export function outageMinutes(o: DeviceOutage, now: Date = new Date()): number | null {
  return o.duration_minutes ?? minutesBetween(o.started_at, now);
}

export function filterOutages(outages: DeviceOutage[], storesById: Map<string, StoreWithAssets>, f: OutageFilter): DeviceOutage[] {
  const q = f.query.trim().toLowerCase();
  return outages.filter((o) => {
    const s = storesById.get(o.store_id);
    if (!s) return false;
    if (!f.includeMuted && o.muted) return false;
    if (f.afterHoursOnly && o.during_business_hours) return false;
    if (f.region && regionKey(s.zone) !== f.region) return false;
    if (f.zone && zoneCode(s.zone) !== f.zone) return false;
    if (q && !(s.store_code + " " + s.store_name).toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface OutageTotals {
  count: number;
  totalMinutes: number;
  inHours: number;
  afterHours: number;
  stillOpen: number;
}

export function outageTotals(outages: DeviceOutage[], now: Date = new Date()): OutageTotals {
  return outages.reduce<OutageTotals>(
    (t, o) => ({
      count: t.count + 1,
      totalMinutes: t.totalMinutes + (outageMinutes(o, now) ?? 0),
      inHours: t.inHours + (o.during_business_hours ? 1 : 0),
      afterHours: t.afterHours + (o.during_business_hours ? 0 : 1),
      stillOpen: t.stillOpen + (o.ended_at ? 0 : 1),
    }),
    { count: 0, totalMinutes: 0, inHours: 0, afterHours: 0, stillOpen: 0 }
  );
}

export interface StoreOutageSummary {
  store: StoreWithAssets;
  count: number;
  totalMinutes: number;
  inHours: number;
  afterHours: number;
  longestMinutes: number;
  afterHoursNights: number; // distinct Bangkok dates with an after-hours outage start
  lastAfterHours: string | null;
}

export function summarizeByStore(outages: DeviceOutage[], storesById: Map<string, StoreWithAssets>, now: Date = new Date()): StoreOutageSummary[] {
  const acc = new Map<string, StoreOutageSummary & { nights: Set<string> }>();
  outages.forEach((o) => {
    const store = storesById.get(o.store_id);
    if (!store) return;
    const mins = outageMinutes(o, now) ?? 0;
    const cur =
      acc.get(o.store_id) ??
      { store, count: 0, totalMinutes: 0, inHours: 0, afterHours: 0, longestMinutes: 0, afterHoursNights: 0, lastAfterHours: null, nights: new Set<string>() };
    cur.count += 1;
    cur.totalMinutes += mins;
    cur.longestMinutes = Math.max(cur.longestMinutes, mins);
    if (o.during_business_hours) cur.inHours += 1;
    else {
      cur.afterHours += 1;
      cur.nights.add(bangkokDateKey(new Date(o.started_at)));
      if (!cur.lastAfterHours || o.started_at > cur.lastAfterHours) cur.lastAfterHours = o.started_at;
    }
    acc.set(o.store_id, cur);
  });
  return Array.from(acc.values())
    .map(({ nights, ...rest }) => ({ ...rest, afterHoursNights: nights.size }))
    .sort((a, b) => b.count - a.count);
}

// ---------- validation for portal writes ----------

export function validateMute(until: Date | null, reason: string, now: Date = new Date()): string | null {
  if (!reason.trim()) return "กรุณาใส่เหตุผล";
  if (!until || Number.isNaN(until.getTime())) return "กรุณาเลือกวันหมดอายุ";
  if (until.getTime() <= now.getTime()) return "วันหมดอายุต้องอยู่ในอนาคต";
  if (until.getTime() - now.getTime() > MAX_MUTE_DAYS * 86400000) return `ปิดเตือนได้สูงสุด ${MAX_MUTE_DAYS} วัน`;
  return null;
}

export function validateHours(open: string, close: string): string | null {
  const o = timeToMinutes(open);
  const c = timeToMinutes(close);
  if (o == null || c == null) return "กรุณาใส่เวลาเปิดและปิด";
  if (o === c) return "เวลาเปิดและปิดต้องไม่เท่ากัน";
  return null;
}

/** Splits a textarea of emails (one per line, or comma separated) and reports invalid ones. */
export function parseRecipients(text: string): { emails: string[]; invalid: string[] } {
  const items = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = Array.from(new Set(items.filter((e) => re.test(e)).map((e) => e.toLowerCase())));
  const invalid = items.filter((e) => !re.test(e));
  return { emails, invalid };
}
