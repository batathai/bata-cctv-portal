"use client";

import clsx from "clsx";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { displayStatus, formatDuration, formatSeen, minutesBetween, withCameraIssue, type DisplayStatus } from "@/lib/monitoring";
import type { StoreWithAssets } from "@/types/database";

/**
 * Small coloured dot showing the live DVR state (HQ iVMS script) next to a
 * store in Asset Register. The full view lives on /status; this is only a
 * signal. Reads MonitoringProvider (polled every 60 s). Colour is never the
 * only cue: every dot has a tooltip and a screen-reader label, and the
 * legend spells the colours out.
 */

const DOT: Record<DisplayStatus, { cls: string; label: string } | null> = {
  Online: { cls: "bg-status-healthy", label: "DVR Online" },
  Offline: { cls: "bg-status-offline", label: "DVR Offline" },
  // DVR online but the store is marked Partial: cameras can't be viewed → open a repair job
  CameraIssue: { cls: "bg-status-partial", label: "ต้องซ่อมกล้อง · DVR Online แต่ดูกล้องไม่ได้ — เปิดงานซ่อม" },
  // Seen offline once, not confirmed yet: still online (green), tooltip explains
  Confirming: { cls: "bg-status-healthy", label: "DVR Online · เห็น Offline 1 รอบ รอยืนยัน" },
  Muted: { cls: "bg-ink-soft dark:bg-white/50", label: "DVR Offline · ปิดเตือนอยู่" },
  Stale: { cls: "bg-[#8B5E3C]", label: "DVR ข้อมูลเก่า (ตัวตรวจไม่ได้รายงาน)" },
  Unknown: { cls: "border border-ink-soft dark:border-white/50", label: "DVR รอผลตรวจ" },
  NotMonitored: null, // not in iVMS — no dot, keeps the table quiet
};

/** Order and wording used by the legend. */
export const DEVICE_DOT_LEGEND: { status: DisplayStatus; text: string }[] = [
  { status: "Online", text: "Online" },
  { status: "CameraIssue", text: "ต้องซ่อมกล้อง" },
  { status: "Offline", text: "Offline" },
  { status: "Muted", text: "ปิดเตือน" },
  { status: "Stale", text: "ข้อมูลเก่า" },
];

function Dot({ status, className }: { status: DisplayStatus; className?: string }) {
  const d = DOT[status];
  if (!d) return null;
  return <span aria-hidden="true" className={clsx("inline-block w-2.5 h-2.5 rounded-full shrink-0", d.cls, className)} />;
}

export function DeviceDot({ store, withText = false }: { store: StoreWithAssets; withText?: boolean }) {
  const storeId = store.id;
  const { monitorByStore, stale, loading } = useMonitoring();
  // Empty slot the size of a dot, so store names stay aligned in the table.
  const slot = <span aria-hidden="true" className="inline-block w-2.5 h-2.5 shrink-0" />;
  if (loading) return withText ? null : slot;
  const now = new Date();
  const m = monitorByStore.get(storeId);
  const status = withCameraIssue(displayStatus(m, stale, now), store);
  const d = DOT[status];
  if (!d) return withText ? <span className="text-xs text-ink-faint">DVR ยังไม่อยู่ใน iVMS</span> : slot;

  let extra = "";
  if ((status === "Offline" || status === "Muted") && m) extra = ` · หลุดมา ${formatDuration(minutesBetween(m.last_seen_at ?? m.state_since, now))}`;
  else if (m?.last_seen_at) extra = ` · เห็นล่าสุด ${formatSeen(m.last_seen_at, now)}`;
  const title = d.label + extra;

  return (
    <span title={title} className="inline-flex items-center gap-1.5">
      <Dot status={status} />
      {withText ? <span className="text-xs text-ink-soft dark:text-white/70">{title}</span> : <span className="sr-only">{title}</span>}
    </span>
  );
}

/** One-line legend for the dots, shown under the Asset Register title. */
export function DeviceDotLegend() {
  const { health, loading } = useMonitoring();
  if (loading || health.kind === "notInstalled") return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
      <span>Sync Status:</span>
      {DEVICE_DOT_LEGEND.map((l) => (
        <span key={l.status} className="inline-flex items-center gap-1">
          <Dot status={l.status} className="w-2 h-2" />
          {l.text}
        </span>
      ))}
    </div>
  );
}
