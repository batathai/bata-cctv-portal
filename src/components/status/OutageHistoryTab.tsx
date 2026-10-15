"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Download, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card } from "@/components/ui/Card";
import { fetchOutages } from "@/lib/data";
import {
  filterOutages, formatDuration, formatSeen, outageMinutes, outageTotals, summarizeByStore, ZONES_BY_REGION,
  type OutageFilter, type RegionKey,
} from "@/lib/monitoring";
import { exportOutagesToExcel } from "@/lib/reports/exportOutagesExcel";
import type { DeviceOutage } from "@/types/database";

function bangkokDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Tab 2 of /status: outage history with filters and Excel export (R4, R10, R12). */
export function OutageHistoryTab({ initialQuery = "" }: { initialQuery?: string }) {
  const { stores } = useAppData();
  const today = bangkokDate(new Date());
  const [from, setFrom] = useState(() => bangkokDate(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(today);
  const [f, setF] = useState<OutageFilter>({ region: "", zone: "", query: initialQuery, afterHoursOnly: false, includeMuted: false });
  const [outages, setOutages] = useState<DeviceOutage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fromD = new Date(`${from}T00:00:00+07:00`);
    const toD = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000); // inclusive end date
    fetchOutages({ from: fromD, to: toD }).then((r) => {
      if (cancelled) return;
      setOutages(r.outages);
      setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const filtered = useMemo(() => filterOutages(outages, storesById, f), [outages, storesById, f]);
  const totals = useMemo(() => outageTotals(filtered), [filtered]);
  const repeatOffenders = useMemo(
    () => summarizeByStore(filtered.filter((o) => !o.during_business_hours), storesById).sort((a, b) => b.afterHoursNights - a.afterHoursNights).slice(0, 8),
    [filtered, storesById]
  );
  const maxNights = repeatOffenders[0]?.afterHoursNights ?? 1;
  const zoneOptions = f.region ? ZONES_BY_REGION[f.region] : [...ZONES_BY_REGION.BKK, ...ZONES_BY_REGION.UPC];

  const input = "h-9 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2 text-sm";

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-soft dark:text-white/60">
          จากวันที่
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft dark:text-white/60">
          ถึงวันที่
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft dark:text-white/60">
          ภาค
          <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value as "" | RegionKey, zone: "" })} className={input}>
            <option value="">ทั้งหมด</option>
            <option value="BKK">BKK</option>
            <option value="UPC">UPC</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft dark:text-white/60">
          เขต
          <select value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} className={input}>
            <option value="">ทั้งหมด</option>
            {zoneOptions.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft dark:text-white/60 flex-1 min-w-[160px]">
          สาขา
          <input value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} placeholder="รหัส / ชื่อสาขา" className={input} />
        </label>
        <label className="flex items-center gap-2 h-9 text-sm">
          <input type="checkbox" checked={f.afterHoursOnly} onChange={(e) => setF({ ...f, afterHoursOnly: e.target.checked })} className="w-4 h-4 accent-brand" />
          เฉพาะนอกเวลาทำการ
        </label>
        <label className="flex items-center gap-2 h-9 text-sm">
          <input type="checkbox" checked={f.includeMuted} onChange={(e) => setF({ ...f, includeMuted: e.target.checked })} className="w-4 h-4 accent-brand" />
          รวมสาขาที่ Mute
        </label>
        <button
          onClick={() => exportOutagesToExcel(filtered, storesById, { from, to })}
          disabled={loading || filtered.length === 0}
          className="ml-auto h-10 px-4 rounded-md bg-brand hover:bg-brand-dark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Download size={14} /> Export Excel
        </button>
      </Card>

      {error && <div className="text-sm text-status-offline">โหลดประวัติไม่สำเร็จ: {error}</div>}

      <div className="flex flex-wrap gap-3">
        {[
          { label: "จำนวนครั้ง", value: String(totals.count), hint: totals.stillOpen ? `ยังไม่กลับ ${totals.stillOpen}` : "", color: "text-ink dark:text-white" },
          { label: "รวมเวลาหลุด", value: formatDuration(totals.totalMinutes), hint: totals.count ? `เฉลี่ย ${formatDuration(totals.totalMinutes / totals.count)}/ครั้ง` : "", color: "text-ink dark:text-white" },
          { label: "ในเวลาทำการ", value: String(totals.inHours), hint: "เมลทันที", color: "text-status-offline" },
          { label: "นอกเวลาทำการ", value: String(totals.afterHours), hint: "อยู่ในเมลสรุปเช้า", color: "text-ink-soft dark:text-white/70" },
        ].map((k) => (
          <Card key={k.label} className="flex-1 min-w-[150px] p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint mb-2">{k.label}</div>
            <div className={clsx("font-display text-2xl font-bold", k.color)}>{loading ? "…" : k.value}</div>
            <div className="text-[11px] text-ink-faint mt-1">{k.hint}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[3_1_620px] min-w-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 font-display font-semibold text-sm">การหลุดทั้งหมด ({filtered.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint bg-surface-muted/60 dark:bg-white/[0.02]">
                  <th className="px-4 py-2.5 font-semibold">สาขา</th>
                  <th className="px-2 py-2.5 font-semibold">เริ่มหลุด</th>
                  <th className="px-2 py-2.5 font-semibold">ตรวจพบ</th>
                  <th className="px-2 py-2.5 font-semibold">กลับมา</th>
                  <th className="px-2 py-2.5 font-semibold">นาน</th>
                  <th className="px-2 py-2.5 font-semibold">ช่วง</th>
                  <th className="px-4 py-2.5 font-semibold">เมล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filtered.map((o) => {
                  const s = storesById.get(o.store_id)!;
                  const mail = o.muted
                    ? "ไม่ส่ง (Mute)"
                    : [o.alert_sent_at && "ทันที", o.recovery_alert_sent_at && "กลับมา", o.summary_sent_at && "สรุปเช้า", o.late_open_alert_sent_at && "เปิดร้าน"]
                        .filter(Boolean)
                        .join(" · ") || "—";
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-ink-soft dark:text-white/60 mr-1.5">{s.store_code}</span>
                        <span className="font-medium text-ink dark:text-white">{s.store_name}</span>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs whitespace-nowrap">{formatSeen(o.started_at)}</td>
                      <td className="px-2 py-2.5 font-mono text-xs text-ink-faint whitespace-nowrap">{formatSeen(o.detected_at)}</td>
                      <td className={clsx("px-2 py-2.5 font-mono text-xs whitespace-nowrap", !o.ended_at && "text-status-offline font-semibold")}>{o.ended_at ? formatSeen(o.ended_at) : "ยังไม่กลับ"}</td>
                      <td className="px-2 py-2.5 text-xs whitespace-nowrap">{formatDuration(outageMinutes(o))}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={clsx(
                            "inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap",
                            o.muted ? "bg-black/5 text-ink-faint" : o.during_business_hours ? "bg-status-offline/10 text-brand-dark dark:text-brand-light" : "bg-black/5 text-ink-soft dark:bg-white/10 dark:text-white/70"
                          )}
                        >
                          {o.muted ? "Muted" : o.during_business_hours ? "ในเวลาทำการ" : "นอกเวลาทำการ"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-soft dark:text-white/60 whitespace-nowrap">{mail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && (
              <p className="text-sm text-ink-faint py-6 text-center inline-flex w-full justify-center items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> กำลังโหลด…
              </p>
            )}
            {!loading && filtered.length === 0 && <p className="text-sm text-ink-faint py-8 text-center">ไม่มีการหลุดในช่วงนี้</p>}
          </div>
        </Card>

        <Card className="flex-[1_1_280px] min-w-0 p-4 space-y-3">
          <div>
            <h2 className="font-display font-semibold text-sm text-ink dark:text-white">ปิด DVR นอกเวลาทำการบ่อย</h2>
            <p className="text-[11px] text-ink-faint mt-0.5">ผิดนโยบายเปิด 24 ชม. — นับจำนวนคืนในช่วงวันที่เลือก</p>
          </div>
          {repeatOffenders.length === 0 && <p className="text-xs text-ink-faint">ไม่มี</p>}
          {repeatOffenders.map((x) => (
            <div key={x.store.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-ink-soft dark:text-white/60 w-12">{x.store.store_code}</span>
              <span className="flex-1 min-w-0 truncate">{x.store.store_name}</span>
              <span className="w-16 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <span className="block h-full bg-ink-soft" style={{ width: `${Math.round((x.afterHoursNights / maxNights) * 100)}%` }} />
              </span>
              <span className="w-14 text-right font-semibold">{x.afterHoursNights} คืน</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
