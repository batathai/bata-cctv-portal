"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitBranch, Pencil, Check, X } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { canLogMaintenance } from "@/lib/rbac";
import type { InstallationProject } from "@/types/database";

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
}

/**
 * Gantt-style timeline: one row per store, 3 phase bars (Permit, Install,
 * Verify→Completed) positioned along a shared day axis. Simple CSS-grid
 * bars — no charting library needed for this scale (Wave 1 = 20 rows).
 */
export default function InstallationTimelinePage() {
  const { stores, installationProjects, loading, role, updateInstallationDates } = useAppData();
  const canManage = canLogMaintenance(role);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const [wave, setWave] = useState("");
  const waves = useMemo(() => Array.from(new Set(installationProjects.map((p) => p.wave))).sort(), [installationProjects]);
  const unsortedProjects = installationProjects.filter((p) => !wave || p.wave === wave);

  // Earliest date first, full stop — whichever of D1/D2/permit/completed is
  // chronologically soonest puts that row at the top, including dates
  // already in the past (so an overdue/forgotten row surfaces immediately
  // instead of hiding at the bottom). Undated rows sort last.
  const projects = useMemo(() => {
    function earliestRef(p: (typeof unsortedProjects)[number]): number {
      const candidates = [p.d1_date, p.d2_date, p.permit_submitted_at, p.completed_at]
        .filter((d): d is string => !!d)
        .map((d) => new Date(d + "T00:00:00").getTime());
      return candidates.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...candidates);
    }
    return [...unsortedProjects].sort((a, b) => earliestRef(a) - earliestRef(b));
  }, [unsortedProjects]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftD1, setDraftD1] = useState("");
  const [draftD2, setDraftD2] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(p: InstallationProject) {
    setEditingId(p.id);
    setDraftD1(p.d1_date ?? "");
    setDraftD2(p.d2_date ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(p: InstallationProject) {
    setSaving(true);
    try {
      await updateInstallationDates(p, { d1_date: draftD1 || null, d2_date: draftD2 || null });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

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

  // Axis ticks roughly every 2 days (e.g. 1-3-5-7-9-11…) instead of a fixed
  // 6-tick spread, so the date reference is granular across the whole range.
  const tickCount = Math.max(2, Math.min(30, Math.round(totalDays / 2) + 1));
  const todayPct = pct(new Date().toISOString().slice(0, 10));

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
        <div className="min-w-[640px] relative">
          {/* Vertical "today" marker — spans the axis + every row so opening the
              page shows at a glance what's happening right now. Positioned with
              calc() against the same w-32/gap-3/w-28 column widths used below,
              so it lines up with the bars even though the axis row has no
              trailing date column of its own (a matching spacer is added there). */}
          {todayPct != null && (
            <div
              className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-brand/70 z-10 pointer-events-none"
              style={{ left: `calc(8.75rem + (100% - 16.5rem) * ${todayPct / 100})` }}
            >
              <span className="absolute -top-0.5 left-1 -translate-y-full text-[10px] font-medium text-brand whitespace-nowrap">
                วันนี้
              </span>
            </div>
          )}
          {/* Date axis — ticks roughly every 2 days across the min/max day range so the bars below have a date reference. */}
          <div className="flex items-center gap-3 pb-1.5 mb-1 border-b border-black/10 dark:border-white/10">
            <div className="w-32 shrink-0" />
            <div className="relative flex-1 h-4">
              {Array.from({ length: tickCount }, (_, i) => {
                const t = minDay + (i / (tickCount - 1)) * (maxDay - minDay);
                return (
                  <span
                    key={i}
                    className="absolute text-[10px] text-ink-faint -translate-x-1/2"
                    style={{ left: `${(i / (tickCount - 1)) * 100}%` }}
                  >
                    {new Date(t).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })}
                  </span>
                );
              })}
            </div>
            <div className="w-28 shrink-0" />
          </div>
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
                {editingId === p.id ? (
                  <div className="w-44 shrink-0 flex items-center gap-1">
                    <input
                      type="date"
                      value={draftD1}
                      onChange={(e) => setDraftD1(e.target.value)}
                      className="w-[88px] text-[10px] border border-black/10 dark:border-white/10 rounded px-1 py-0.5 bg-white dark:bg-white/5"
                      aria-label="วันนัดติดตั้ง (D1)"
                    />
                    <input
                      type="date"
                      value={draftD2}
                      onChange={(e) => setDraftD2(e.target.value)}
                      className="w-[88px] text-[10px] border border-black/10 dark:border-white/10 rounded px-1 py-0.5 bg-white dark:bg-white/5"
                      aria-label="วันติดตั้งจริง (D2)"
                    />
                    <button
                      onClick={() => saveEdit(p)}
                      disabled={saving}
                      className="text-status-healthy hover:opacity-70 disabled:opacity-40 shrink-0"
                      title="บันทึก"
                    >
                      <Check size={14} />
                    </button>
                    <button onClick={cancelEdit} disabled={saving} className="text-ink-faint hover:opacity-70 disabled:opacity-40 shrink-0" title="ยกเลิก">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="w-28 shrink-0 flex items-center justify-end gap-1 text-[10px] text-ink-faint group">
                    <span className="text-right">
                      {(p.d1_date || p.d2_date) && (
                        <>
                          {p.d1_date && <>นัด {formatShortDate(p.d1_date)}</>}
                          {p.d1_date && p.d2_date && " · "}
                          {p.d2_date && <>{formatShortDate(p.d2_date)}</>}
                        </>
                      )}
                    </span>
                    {canManage && (
                      <button
                        onClick={() => startEdit(p)}
                        className="text-ink-faint hover:text-brand opacity-0 group-hover:opacity-100 transition shrink-0"
                        title="แก้ไขวันที่"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {projects.length === 0 && <p className="text-sm text-ink-faint py-3">ไม่มีข้อมูลในตัวกรองนี้</p>}
        </div>
      </Card>
    </div>
  );
}
