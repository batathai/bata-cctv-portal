"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Search, FileText, BellOff, Bell, Wrench } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { Card } from "@/components/ui/Card";
import { getStatusLabel } from "@/components/ui/Badge";
import { MonitorStatusPill } from "@/components/status/MonitorStatusPill";
import { MuteDialog } from "@/components/status/MuteDialog";
import {
  buildLiveRows, formatDuration, formatSeen, ZONES_BY_REGION, TOTAL_STORES_TARGET, REPAIR_SUGGEST_MINUTES,
  type DisplayStatus, type RegionKey, type LiveRow,
} from "@/lib/monitoring";
import { canLogMaintenance } from "@/lib/rbac";
import { hasOpenTicket } from "@/lib/tickets";
import type { StoreWithAssets } from "@/types/database";

const iconBtn =
  "inline-flex items-center justify-center w-8 h-8 rounded-md border border-black/10 dark:border-white/10 text-ink-soft dark:text-white/70 hover:bg-surface-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white";

type StatusFilter = "" | "Offline" | "Online" | "Muted" | "NotMonitored";

function matchesStatus(s: DisplayStatus, f: StatusFilter) {
  if (!f) return true;
  if (f === "Online") return s === "Online" || s === "Confirming";
  return s === f;
}

/** Tab 1 of /status: live Online/Offline per store from the iVMS monitor (R7). */
export function LiveStatusTab() {
  const { stores, role, tickets } = useAppData();
  const { monitors, settings, stale, unmuteStore } = useMonitoring();
  const [region, setRegion] = useState<"" | RegionKey>("");
  const [zone, setZone] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [muteFor, setMuteFor] = useState<StoreWithAssets | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canEdit = canLogMaintenance(role);

  const rows = useMemo(() => buildLiveRows(stores, monitors, settings, stale), [stores, monitors, settings, stale]);

  const counts = useMemo(() => {
    const c = { Offline: 0, Online: 0, Muted: 0, NotMonitored: 0, monitored: 0 };
    rows.forEach((r) => {
      if (r.status === "Offline") c.Offline++;
      else if (r.status === "Online" || r.status === "Confirming") c.Online++;
      else if (r.status === "Muted") c.Muted++;
      else if (r.status === "NotMonitored") c.NotMonitored++;
      if (r.monitor?.monitored) c.monitored++;
    });
    return c;
  }, [rows]);

  const zoneOptions = region ? ZONES_BY_REGION[region] : [...ZONES_BY_REGION.BKK, ...ZONES_BY_REGION.UPC];
  const ql = q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!region || r.region === region) &&
      (!zone || r.zone === zone) &&
      (!ql || (r.store.store_code + " " + r.store.store_name).toLowerCase().includes(ql)) &&
      matchesStatus(r.status, statusFilter)
  );

  async function unmute(r: LiveRow) {
    if (!window.confirm(`ปลด Mute ${r.store.store_code} ${r.store.store_name}? จะกลับมาส่งเมลแจ้งเตือนตามปกติ`)) return;
    setBusy(r.store.id);
    try {
      await unmuteStore(r.store.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "ปลด Mute ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const kpi = (key: StatusFilter, label: string, value: number, color: string, suffix?: string) => (
    <button
      onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
      aria-pressed={statusFilter === key}
      className={clsx(
        "flex-1 min-w-[150px] text-left bg-white dark:bg-white/[0.03] border rounded-card shadow-card p-4 transition-shadow hover:shadow-md",
        statusFilter === key ? "border-brand ring-1 ring-brand" : "border-black/5 dark:border-white/10"
      )}
    >
      <div className="text-xs uppercase tracking-wide text-ink-faint mb-2">{label}</div>
      <div className={clsx("font-display text-2xl font-bold", color)}>
        {stale && key !== "NotMonitored" ? "—" : value}
        {suffix && <span className="text-sm font-medium text-ink-faint ml-1.5">{suffix}</span>}
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {kpi("Offline", "Offline", counts.Offline, "text-status-offline")}
        {kpi("Online", "Online", counts.Online, "text-status-healthy")}
        {kpi("Muted", "Muted", counts.Muted, "text-ink-soft dark:text-white/70")}
        {kpi("NotMonitored", "Not monitored", counts.NotMonitored, "text-ink dark:text-white", `เฝ้าอยู่ ${counts.monitored} / ${TOTAL_STORES_TARGET}`)}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-black/5 dark:border-white/10">
          {([["", "ทั้งหมด"], ["BKK", "BKK · 511 512 513 550"], ["UPC", "UPC · 520 530 540 560"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setRegion(k);
                setZone("");
              }}
              aria-pressed={region === k}
              className={clsx(
                "h-9 px-3.5 rounded-full border text-sm",
                region === k ? "bg-ink text-white border-ink dark:bg-white dark:text-ink" : "border-black/10 dark:border-white/15 hover:bg-surface-muted dark:hover:bg-white/5"
              )}
            >
              {label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60">
            เขต
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2 text-sm">
              <option value="">ทั้งหมด</option>
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-3 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสาขา / รหัส"
              aria-label="ค้นหาสาขา"
              className="pl-8 pr-3 h-9 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint bg-surface-muted/60 dark:bg-white/[0.02]">
                <th className="px-4 py-2.5 font-semibold w-[70px]">รหัส</th>
                <th className="px-2 py-2.5 font-semibold">สาขา</th>
                <th className="px-2 py-2.5 font-semibold w-[60px]">เขต</th>
                <th className="px-2 py-2.5 font-semibold w-[170px]">สถานะ</th>
                <th className="px-2 py-2.5 font-semibold w-[120px]">Last seen</th>
                <th className="px-2 py-2.5 font-semibold w-[120px]">หลุดมานาน</th>
                <th className="px-2 py-2.5 font-semibold w-[110px]">เวลาทำการ</th>
                <th className="px-4 py-2.5 w-[140px]">
                  <span className="sr-only">การทำงาน</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((r) => {
                const m = r.monitor;
                const sub = r.muted
                  ? `Mute ถึง ${formatSeen(m?.muted_until)} — ${m?.mute_reason ?? ""}`
                  : r.status === "Confirming"
                  ? `กำลังยืนยัน (เห็น Offline ${m?.offline_streak} จาก ${settings.confirm_cycles} รอบ)`
                  : r.status === "NotMonitored"
                  ? "ยังไม่อยู่ใน iVMS"
                  : `กล้อง: ${getStatusLabel(r.store.overall_status)}`;
                return (
                  <tr key={r.store.id} className="hover:bg-surface-muted/50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-soft dark:text-white/60">{r.store.store_code}</td>
                    <td className="px-2 py-2.5 min-w-0">
                      <div className="font-medium text-ink dark:text-white truncate max-w-[280px]">{r.store.store_name}</div>
                      <div className="text-[11px] text-ink-faint truncate max-w-[280px]" title={sub}>
                        {sub}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-ink-soft dark:text-white/60">{r.zone}</td>
                    <td className="px-2 py-2.5">
                      <MonitorStatusPill status={r.status} />
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-ink-soft dark:text-white/60 whitespace-nowrap">{m?.monitored ? formatSeen(m.last_seen_at) : "—"}</td>
                    <td className={clsx("px-2 py-2.5 text-xs whitespace-nowrap", r.status === "Offline" ? "font-semibold text-status-offline" : "text-ink-faint")}>
                      {r.offlineMinutes != null ? formatDuration(r.offlineMinutes) : "—"}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-ink-faint whitespace-nowrap">
                      {r.hours.open}–{r.hours.close}
                      {r.hours.custom && <span className="ml-1 text-brand" title="ตั้งเฉพาะสาขานี้">*</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {(() => {
                          // Wrench = open a repair ticket, offered once a DVR has been offline
                          // REPAIR_SUGGEST_MINUTES (and isn't muted). If the store already has an
                          // open ticket, the wrench turns grey and just links to it.
                          const longOffline = r.status === "Offline" && (r.offlineMinutes ?? 0) >= REPAIR_SUGGEST_MINUTES;
                          if (!canEdit || !longOffline) return <span className="w-8" aria-hidden="true" />;
                          const open = hasOpenTicket(r.store.id, tickets);
                          const label = open ? "มีเคสซ่อมเปิดอยู่แล้ว — ดูเคส" : `เปิดเคสซ่อม (Offline ${formatDuration(r.offlineMinutes)})`;
                          const href = open
                            ? `/assets/${r.store.store_code}#tickets`
                            : `/assets/${r.store.store_code}?newTicket=${encodeURIComponent("NVR Offline")}&note=${encodeURIComponent(
                                `DVR Offline จาก iVMS ตั้งแต่ ${formatSeen(m?.last_seen_at ?? m?.state_since)} (${formatDuration(r.offlineMinutes)})`
                              )}#tickets`;
                          return (
                            <Link href={href} title={label} aria-label={label} className={clsx(iconBtn, open ? "text-ink-faint" : "text-status-offline border-status-offline/40 bg-status-offline/5")}>
                              <Wrench size={15} />
                            </Link>
                          );
                        })()}
                        <Link href={`/recovery/${r.store.store_code}`} title="ดูรายละเอียดสาขา" aria-label="ดูรายละเอียดสาขา" className={iconBtn}>
                          <FileText size={15} />
                        </Link>
                        {canEdit && m?.monitored ? (
                          r.muted ? (
                            <button onClick={() => unmute(r)} disabled={busy === r.store.id} title="ปลด Mute" aria-label="ปลด Mute" className={clsx(iconBtn, "disabled:opacity-50")}>
                              <Bell size={15} />
                            </button>
                          ) : (
                            <button onClick={() => setMuteFor(r.store)} title="ปิดเตือนชั่วคราว (Mute)" aria-label="ปิดเตือนชั่วคราว (Mute)" className={iconBtn}>
                              <BellOff size={15} />
                            </button>
                          )
                        ) : (
                          <span className="w-8" aria-hidden="true" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-sm text-ink-faint py-8 text-center">ไม่มีสาขาในกลุ่มนี้</p>}
        </div>
        <div className="px-4 py-2.5 text-[11px] text-ink-faint border-t border-black/5 dark:border-white/10">
          เรียง: Offline (หลุดนานสุดบนสุด) → Muted → Online → Not monitored · โหลดใหม่เองทุก 60 วินาที · * = เวลาทำการเฉพาะสาขา · ประแจแดง = Offline เกิน {REPAIR_SUGGEST_MINUTES / 60} ชม. กดเพื่อเปิดเคสซ่อม
        </div>
      </Card>

      {muteFor && <MuteDialog store={muteFor} onClose={() => setMuteFor(null)} />}
    </div>
  );
}
