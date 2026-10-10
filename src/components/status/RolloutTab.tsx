"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { Card } from "@/components/ui/Card";
import { formatSeen, regionKey, TOTAL_STORES_TARGET, ZONES_BY_REGION } from "@/lib/monitoring";
import { zoneCode } from "@/lib/recovery";
import { canManageMasterData } from "@/lib/rbac";

/** Tab 3 of /status: how many of the 194 stores are monitored, and what needs checking (R1, R9). */
export function RolloutTab() {
  const { stores, role } = useAppData();
  const { monitorByStore, latestRun, health, setMonitored } = useMonitoring();
  const canEdit = canManageMasterData(role);
  const [view, setView] = useState<"pending" | "monitored">("pending");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monitoredCount = stores.filter((s) => monitorByStore.get(s.id)?.monitored).length;
  const pct = Math.round((monitoredCount / TOTAL_STORES_TARGET) * 100);
  const weekAgo = Date.now() - 7 * 86400000;
  const addedThisWeek = stores.filter((s) => {
    const m = monitorByStore.get(s.id);
    return m?.monitored && m.first_seen_at && new Date(m.first_seen_at).getTime() >= weekAgo;
  }).length;

  const byZone = useMemo(() => {
    return [...ZONES_BY_REGION.BKK, ...ZONES_BY_REGION.UPC].map((z) => {
      const inZone = stores.filter((s) => zoneCode(s.zone) === z);
      const mon = inZone.filter((s) => monitorByStore.get(s.id)?.monitored).length;
      return { zone: z, region: regionKey(z), total: inZone.length, monitored: mon };
    });
  }, [stores, monitorByStore]);

  const ql = q.trim().toLowerCase();
  const list = stores
    .filter((s) => (view === "monitored") === !!monitorByStore.get(s.id)?.monitored)
    .filter((s) => !ql || (s.store_code + " " + s.store_name).toLowerCase().includes(ql))
    .sort((a, b) => a.store_code.localeCompare(b.store_code));

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      await setMonitored(Array.from(picked), view === "pending");
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const unmatched = latestRun?.unmatched ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Card className="flex-[1_1_300px] p-5 space-y-3">
          <div className="text-sm text-ink-soft dark:text-white/60">สาขาที่เฝ้าอยู่</div>
          <div className="font-display text-4xl font-bold text-ink dark:text-white">
            {monitoredCount}
            <span className="text-lg font-medium text-ink-faint"> / {TOTAL_STORES_TARGET}</span>
          </div>
          <div className="h-2.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="text-xs text-ink-faint">{pct}% · เพิ่มสาขาโดยเพิ่มเครื่องเข้า iVMS-4200 ที่ HQ แล้วสคริปต์จะเห็นเองในรอบถัดไป</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-ink-faint text-xs">iVMS Total (รอบล่าสุด)</dt>
              <dd className="font-semibold">{latestRun?.ivms_total ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-faint text-xs">ติ๊ก monitored</dt>
              <dd className={clsx("font-semibold", health.kind === "mismatch" && "text-[#8A5A00] dark:text-status-partial")}>{monitoredCount}</dd>
            </div>
            <div>
              <dt className="text-ink-faint text-xs">เพิ่ม 7 วันล่าสุด</dt>
              <dd className="font-semibold">+{addedThisWeek}</dd>
            </div>
            <div>
              <dt className="text-ink-faint text-xs">รอบตรวจล่าสุด</dt>
              <dd className="font-semibold">{latestRun ? formatSeen(latestRun.ran_at) : "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="flex-[2_1_460px] p-5 space-y-2.5">
          <h2 className="font-display font-semibold text-sm text-ink dark:text-white mb-1">แยกตามเขต</h2>
          {byZone.map((z) => (
            <div key={z.zone} className="grid grid-cols-[80px_1fr_64px] gap-3 items-center text-sm">
              <span className="text-ink-soft dark:text-white/60">
                {z.region} {z.zone}
              </span>
              <span className="h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <span className="block h-full bg-ink dark:bg-white/70 rounded-full" style={{ width: z.total ? `${Math.round((z.monitored / z.total) * 100)}%` : "0%" }} />
              </span>
              <span className="text-right font-mono text-xs">
                {z.monitored} / {z.total}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[1_1_320px] min-w-0 p-4 space-y-3">
          <h2 className="font-display font-semibold text-sm text-ink dark:text-white">ต้องตรวจ</h2>
          {health.kind === "mismatch" && (
            <div className="rounded-md bg-status-partial/10 px-3 py-2.5 text-sm text-[#6E4700] dark:text-status-partial">
              iVMS มี {latestRun?.ivms_total} เครื่อง แต่ติ๊กไว้ {monitoredCount} สาขา — สาขาที่อยู่ใน iVMS แต่ยังไม่เคยหลุด สคริปต์มองไม่เห็นชื่อ ต้องติ๊กเอง
            </div>
          )}
          {unmatched.length > 0 ? (
            <div className="rounded-md bg-status-partial/10 px-3 py-2.5 space-y-1">
              <div className="text-sm font-semibold text-[#6E4700] dark:text-status-partial">อ่านได้จาก iVMS แต่ไม่ตรงกับสาขาใด</div>
              {unmatched.map((u) => (
                <div key={u} className="font-mono text-xs">
                  {u}
                </div>
              ))}
              <div className="text-xs text-ink-soft dark:text-white/60">แก้ชื่อเครื่องใน iVMS ให้ขึ้นต้นด้วยรหัสสาขาที่ถูกต้อง หรือแก้รหัสสาขาใน portal</div>
            </div>
          ) : (
            health.kind !== "mismatch" && <p className="text-sm text-ink-faint">ไม่มีรายการที่ต้องตรวจ</p>
          )}
        </Card>

        <Card className="flex-[2_1_520px] min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-black/5 dark:border-white/10">
            {(
              [
                ["pending", `ยังไม่ monitored (${stores.length - monitoredCount})`],
                ["monitored", `monitored (${monitoredCount})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setView(k);
                  setPicked(new Set());
                }}
                aria-pressed={view === k}
                className={clsx("h-9 px-3 rounded-full border text-sm", view === k ? "bg-ink text-white border-ink dark:bg-white dark:text-ink" : "border-black/10 dark:border-white/15")}
              >
                {label}
              </button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา" aria-label="ค้นหาสาขา" className="h-9 px-3 rounded-md border border-black/10 dark:border-white/15 bg-surface-muted dark:bg-white/5 text-sm w-40" />
            {canEdit && (
              <button
                onClick={apply}
                disabled={picked.size === 0 || saving}
                className="ml-auto h-9 px-3 rounded-md border border-black/10 dark:border-white/15 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {view === "pending" ? `ติ๊กเป็น monitored (${picked.size})` : `เอาออกจาก monitored (${picked.size})`}
              </button>
            )}
          </div>
          {error && <p className="px-4 py-2 text-sm text-status-offline">{error}</p>}
          <div className="max-h-[480px] overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
            {list.map((s) => {
              const m = monitorByStore.get(s.id);
              return (
                <label key={s.id} className="grid grid-cols-[28px_64px_1fr_48px_150px] gap-2 items-center px-4 min-h-[44px] text-sm cursor-pointer hover:bg-surface-muted/50 dark:hover:bg-white/[0.02]">
                  <input type="checkbox" disabled={!canEdit} checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4 accent-brand" />
                  <span className="font-mono text-xs text-ink-soft dark:text-white/60">{s.store_code}</span>
                  <span className="truncate">{s.store_name}</span>
                  <span className="font-mono text-xs text-ink-soft dark:text-white/60">{zoneCode(s.zone)}</span>
                  <span className="text-xs text-ink-faint truncate">
                    {view === "monitored"
                      ? m?.first_seen_at
                        ? `เห็นใน iVMS ตั้งแต่ ${formatSeen(m.first_seen_at)}`
                        : "ติ๊กเอง ยังไม่เคยเห็นใน iVMS"
                      : s.hikconnect?.ivms_account
                      ? "มี iVMS account แล้ว"
                      : ""}
                  </span>
                </label>
              );
            })}
            {list.length === 0 && <p className="text-sm text-ink-faint py-6 text-center">ไม่มีสาขา</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
