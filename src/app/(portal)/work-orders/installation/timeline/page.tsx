"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { GitBranch } from "lucide-react";

/**
 * Gantt-style timeline: one row per store, 3 phase bars (Permit, Install,
 * Verify→Completed) positioned along a shared day axis. Simple CSS-grid
 * bars — no charting library needed for this scale (Wave 1 = 20 rows).
 */
export default function InstallationTimelinePage() {
  const { stores, installationProjects, loading } = useAppData();
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const [wave, setWave] = useState("");
  const waves = useMemo(() => Array.from(new Set(installationProjects.map((p) => p.wave))).sort(), [installationProjects]);
  const projects = installationProjects.filter((p) => !wave || p.wave === wave);

  const { minDay, maxDay } = useMemo(() => {
    const dates: number[] = [];
    projects.forEach((p) => {
      [p.permit_submitted_at, p.d1_date, p.d2_date, p.completed_at, p.created_at].forEach((d) => {
        if (d) dates.push(new Date(d).getTime());
      });
    });
    if (dates.length === 0) {
      const now = Date.now();
      return { minDay: now, maxDay: now + 90 * 86400000 };
    }
    return { minDay: Math.min(...dates), maxDay: Math.max(...dates) + 14 * 86400000 };
  }, [projects]);

  const totalDays = Math.max(1, Math.round((maxDay - minDay) / 86400000));

  function pct(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const t = new Date(dateStr).getTime();
    return Math.min(100, Math.max(0, ((t - minDay) / (maxDay - minDay)) * 100));
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link href="/work-orders/installation" className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand w-fit">
        <ArrowLeft size={15} /> Back to board
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-lg font-bold text-ink dark:text-white">Installation Timeline</h1>
          <p className="text-sm text-ink-faint mt-0.5">มุมมอง {totalDays} วัน — {projects.length} สาขา</p>
        </div>
        <select value={wave} onChange={(e) => setWave(e.target.value)} className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-white dark:bg-white/5">
          <option value="">ทุก Wave</option>
          {waves.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <Card className="p-4 overflow-x-auto">
        <SectionTitle icon={GitBranch}>แถบเวลา — ยื่นขออนุญาต / นัด-ติดตั้ง / Verify→Completed</SectionTitle>
        <div className="min-w-[640px]">
          {projects.map((p) => {
            const store = storeById.get(p.store_id);
            if (!store) return null;
            const permitPct = pct(p.permit_submitted_at);
            const d1Pct = pct(p.d1_date);
            const d2Pct = pct(p.d2_date);
            const completedPct = pct(p.completed_at);
            return (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-black/5 dark:border-white/5 last:border-0">
                <Link href={`/work-orders/installation/${store.store_code}`} className="w-32 shrink-0 text-xs font-medium text-ink dark:text-white hover:text-brand truncate">
                  {store.store_code}
                </Link>
                <div className="relative flex-1 h-5 bg-surface-muted dark:bg-white/5 rounded">
                  {permitPct != null && d1Pct != null && (
                    <div
                      className="absolute h-full bg-status-partial/60 rounded-l"
                      style={{ left: `${permitPct}%`, width: `${Math.max(1, d1Pct - permitPct)}%` }}
                      title="Permit → Scheduled"
                    />
                  )}
                  {d1Pct != null && d2Pct != null && (
                    <div
                      className="absolute h-full bg-brand/60"
                      style={{ left: `${d1Pct}%`, width: `${Math.max(1, d2Pct - d1Pct)}%` }}
                      title="Scheduled → Installing"
                    />
                  )}
                  {d2Pct != null && (
                    <div
                      className="absolute h-full bg-status-healthy/70 rounded-r"
                      style={{ left: `${d2Pct}%`, width: `${Math.max(1, (completedPct ?? d2Pct + 5) - d2Pct)}%` }}
                      title="Installing → Verify/Completed"
                    />
                  )}
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <p className="text-sm text-ink-faint py-3">ไม่มีข้อมูลในตัวกรองนี้</p>}
        </div>
      </Card>
    </div>
  );
}
