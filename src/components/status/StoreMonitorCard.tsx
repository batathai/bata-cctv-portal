"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Wifi, BellOff, Bell, Loader2 } from "lucide-react";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { MonitorStatusPill } from "@/components/status/MonitorStatusPill";
import { MuteDialog } from "@/components/status/MuteDialog";
import { BusinessHoursEditor } from "@/components/status/BusinessHoursEditor";
import { fetchOutages } from "@/lib/data";
import { displayStatus, formatDuration, formatSeen, isMuted, minutesBetween, outageMinutes } from "@/lib/monitoring";
import type { DeviceOutage, StoreWithAssets } from "@/types/database";

/** Store Detail: live iVMS status, business hours, mute and the last 10 outages for one store (R7, R8, R12). */
export function StoreMonitorCard({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { monitorByStore, stale, latestRun, settings, unmuteStore, lastLoadedAt } = useMonitoring();
  const m = monitorByStore.get(store.id) ?? null;
  const status = displayStatus(m, stale);
  const muted = isMuted(m);
  const [outages, setOutages] = useState<DeviceOutage[]>([]);
  const [loadingOutages, setLoadingOutages] = useState(true);
  const [showMute, setShowMute] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-fetch history whenever the live snapshot refreshes (every 60 s).
  useEffect(() => {
    let cancelled = false;
    fetchOutages({ storeId: store.id, limit: 10 }).then((r) => {
      if (cancelled) return;
      setOutages(r.outages);
      setLoadingOutages(false);
    });
    return () => {
      cancelled = true;
    };
  }, [store.id, lastLoadedAt]);

  const current = m?.current_outage_id ? outages.find((o) => o.id === m.current_outage_id) : undefined;
  const offlineMins = m?.monitored && m.state === "Offline" ? minutesBetween(m.last_seen_at ?? m.state_since, new Date()) : null;

  async function unmute() {
    if (!window.confirm("ปลด Mute? จะกลับมาส่งเมลแจ้งเตือนตามปกติ")) return;
    setBusy(true);
    try {
      await unmuteStore(store.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "ปลด Mute ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const tile = (label: string, value: React.ReactNode, tone?: "bad") => (
    <div className={clsx("rounded-md px-4 py-3", tone === "bad" ? "bg-status-offline/10" : "bg-surface-muted dark:bg-white/5")}>
      <div className="text-xs text-ink-soft dark:text-white/60 mb-1">{label}</div>
      <div className={clsx("text-base font-semibold", tone === "bad" ? "text-status-offline" : "text-ink dark:text-white")}>{value}</div>
    </div>
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionTitle icon={Wifi}>Device Status (iVMS)</SectionTitle>
        <span className="text-xs text-ink-faint">ตรวจล่าสุด {latestRun ? formatSeen(latestRun.ran_at) : "—"}</span>
      </div>

      {!m?.monitored ? (
        <p className="text-sm text-ink-soft dark:text-white/60">
          สาขานี้ยังไม่อยู่ใน iVMS-4200 ที่ HQ จึงยังไม่ได้เฝ้าสถานะ — เพิ่มเครื่องเข้า iVMS แล้วติ๊กในหน้า{" "}
          <Link href="/status?tab=rollout" className="text-brand hover:underline">
            Device Status › Rollout
          </Link>
        </p>
      ) : (
        <>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            {tile("สถานะตอนนี้", <MonitorStatusPill status={status} />, status === "Offline" ? "bad" : undefined)}
            {tile("Last seen", <span className="font-mono">{formatSeen(m.last_seen_at)}</span>)}
            {tile("หลุดมานาน", offlineMins != null ? formatDuration(offlineMins) : "—", offlineMins != null && !muted ? "bad" : undefined)}
            {tile(
              "เมลแจ้งเตือน",
              muted ? "ปิดอยู่ (Mute)" : current?.alert_sent_at ? `ส่งแล้ว ${formatSeen(current.alert_sent_at)}` : current ? (current.during_business_hours ? "รอส่ง" : "อยู่ในสรุปเช้า") : "—"
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <div>
              <dt className="text-ink-faint text-xs">ชื่อเครื่องใน iVMS</dt>
              <dd className="font-mono text-xs mt-0.5">{m.ivms_device_name ?? "— (จะรู้เมื่อสคริปต์เห็นเครื่องนี้)"}</dd>
            </div>
            <div>
              <dt className="text-ink-faint text-xs">อยู่ใน iVMS ตั้งแต่</dt>
              <dd className="mt-0.5">{m.first_seen_at ? formatSeen(m.first_seen_at) : "—"}</dd>
            </div>
            {current && (
              <div>
                <dt className="text-ink-faint text-xs">ตรวจพบหลุด</dt>
                <dd className="mt-0.5">
                  {formatSeen(current.detected_at)} (ยืนยัน {settings.confirm_cycles} รอบ)
                </dd>
              </div>
            )}
            {muted && (
              <div>
                <dt className="text-ink-faint text-xs">Mute ถึง</dt>
                <dd className="mt-0.5">
                  {formatSeen(m.muted_until)} — {m.mute_reason}
                </dd>
              </div>
            )}
          </dl>
        </>
      )}

      <div className="border-t border-black/5 dark:border-white/10 pt-4 flex flex-wrap gap-x-8 gap-y-4">
        <BusinessHoursEditor storeId={store.id} monitor={m} canEdit={canEdit} />
        {m?.monitored && canEdit && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-ink dark:text-white">ปิดเตือนชั่วคราว</div>
            <p className="text-xs text-ink-faint">ยังบันทึกประวัติการหลุด แต่ไม่ส่งเมล</p>
            {muted ? (
              <button onClick={unmute} disabled={busy} className="h-10 px-4 rounded-md border border-black/10 dark:border-white/15 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} ปลด Mute
              </button>
            ) : (
              <button onClick={() => setShowMute(true)} className="h-10 px-4 rounded-md border border-black/10 dark:border-white/15 text-sm font-semibold inline-flex items-center gap-2">
                <BellOff size={14} /> Mute สาขานี้…
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-black/5 dark:border-white/10 pt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink dark:text-white">ประวัติการหลุด 10 ครั้งล่าสุด</h3>
          <Link href={`/status?tab=history&q=${encodeURIComponent(store.store_code)}`} className="text-sm text-brand hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint border-b border-black/5 dark:border-white/10">
                <th className="py-2 pr-2 font-semibold">เริ่มหลุด</th>
                <th className="py-2 pr-2 font-semibold">กลับมา</th>
                <th className="py-2 pr-2 font-semibold">นาน</th>
                <th className="py-2 pr-2 font-semibold">ช่วง</th>
                <th className="py-2 font-semibold">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {outages.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">{formatSeen(o.started_at)}</td>
                  <td className={clsx("py-2 pr-2 font-mono text-xs whitespace-nowrap", !o.ended_at && "text-status-offline font-semibold")}>{o.ended_at ? formatSeen(o.ended_at) : "ยังไม่กลับ"}</td>
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatDuration(outageMinutes(o))}</td>
                  <td className="py-2 pr-2">
                    <span className={clsx("inline-flex h-5 px-2 items-center rounded-full text-[11px] font-semibold whitespace-nowrap", o.during_business_hours ? "bg-status-offline/10 text-brand-dark dark:text-brand-light" : "bg-black/5 text-ink-soft dark:bg-white/10 dark:text-white/70")}>
                      {o.during_business_hours ? "ในเวลาทำการ" : "นอกเวลาทำการ"}
                    </span>
                    {o.muted && <span className="ml-1 text-[11px] text-ink-faint">Muted</span>}
                  </td>
                  <td className="py-2 text-xs text-ink-soft dark:text-white/60">{o.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loadingOutages && outages.length === 0 && <p className="text-sm text-ink-faint py-4">ยังไม่มีประวัติการหลุด</p>}
        </div>
      </div>

      {showMute && <MuteDialog store={store} onClose={() => setShowMute(false)} />}
    </Card>
  );
}
