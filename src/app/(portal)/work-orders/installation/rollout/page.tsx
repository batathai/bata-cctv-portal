"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { zoneCode, getAreaLabel } from "@/lib/recovery";
import { INSTALLATION_STAGES, getStageLabel } from "@/lib/installation";
import type { InstallationStage } from "@/types/database";

/** Total planned rollout size (R9) — the 194-store target the plan is scoped to. */
const ROLLOUT_TARGET = 194;

const STAGE_DOT: Record<InstallationStage, string> = {
  Quotation: "bg-status-partial/60",
  Permit: "bg-status-partial",
  Scheduled: "bg-brand/50",
  Installing: "bg-brand",
  Verify: "bg-status-healthy/60",
  Completed: "bg-status-healthy",
};

export default function InstallationRolloutPage() {
  const { stores, installationProjects, createInstallationProject, role, loading } = useAppData();
  const [wave, setWave] = useState("Wave 1: Top 20");
  const [opening, setOpening] = useState<string | null>(null);

  const projectByStore = useMemo(() => new Map(installationProjects.map((p) => [p.store_id, p])), [installationProjects]);
  const waves = useMemo(() => Array.from(new Set(installationProjects.map((p) => p.wave))).sort(), [installationProjects]);

  const byZone = useMemo(() => {
    const m = new Map<string, number>();
    installationProjects.forEach((p) => {
      const store = stores.find((s) => s.id === p.store_id);
      if (!store) return;
      const z = zoneCode(store.zone);
      m.set(z, (m.get(z) ?? 0) + 1);
    });
    return m;
  }, [installationProjects, stores]);

  const byStage = useMemo(() => {
    const m = new Map<InstallationStage, number>();
    INSTALLATION_STAGES.forEach((s) => m.set(s, 0));
    installationProjects.forEach((p) => m.set(p.current_stage, (m.get(p.current_stage) ?? 0) + 1));
    return m;
  }, [installationProjects]);

  const canOpen = role === "hq_admin";

  async function openProject(storeId: string) {
    setOpening(storeId);
    try {
      await createInstallationProject(storeId, wave || "Wave 1: Top 20");
    } finally {
      setOpening(null);
    }
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link href="/work-orders/installation" className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand w-fit">
        <ArrowLeft size={15} /> Back to board
      </Link>

      <div>
        <h1 className="font-display text-lg font-bold text-ink dark:text-white">Rollout Overview</h1>
        <p className="text-sm text-ink-faint mt-0.5">
          เปิดแล้ว {installationProjects.length} / {ROLLOUT_TARGET} สาขา (แผนทั้งหมด)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle icon={LayoutGrid}>สรุปตามขั้นตอน</SectionTitle>
          <div className="space-y-1.5">
            {INSTALLATION_STAGES.map((s) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink-soft dark:text-white/70">
                  <span className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT[s]}`} /> {getStageLabel(s)}
                </span>
                <span className="font-medium text-ink dark:text-white">{byStage.get(s) ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle icon={LayoutGrid}>สรุปตามเขต</SectionTitle>
          <div className="space-y-1.5">
            {["511", "512", "513", "550", "520", "530", "540", "560"].map((z) => (
              <div key={z} className="flex items-center justify-between text-sm">
                <span className="text-ink-soft dark:text-white/70">{z} — {getAreaLabel(z)}</span>
                <span className="font-medium text-ink dark:text-white">{byZone.get(z) ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <SectionTitle icon={LayoutGrid}>รายสาขา ({stores.length})</SectionTitle>
          {canOpen && (
            <select value={wave} onChange={(e) => setWave(e.target.value)} className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-white dark:bg-white/5">
              {["Wave 1: Top 20", ...waves.filter((w) => w !== "Wave 1: Top 20")].map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
              <option value="__new__">+ Wave ใหม่ (ตั้งชื่อในโปรเจกต์)</option>
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {[...stores].sort((a, b) => a.store_code.localeCompare(b.store_code)).map((s) => {
            const project = projectByStore.get(s.id);
            return (
              <div
                key={s.id}
                className="relative rounded-md border border-black/10 dark:border-white/10 p-2 text-center"
                title={`${s.store_code} — ${s.store_name}${project ? ` — ${getStageLabel(project.current_stage)}` : " — ยังไม่เปิด"}`}
              >
                {project ? (
                  <Link href={`/work-orders/installation/${s.store_code}`} className="block">
                    <span className={`inline-block w-2 h-2 rounded-full ${STAGE_DOT[project.current_stage]} mb-1`} />
                    <div className="text-[10px] font-mono text-ink dark:text-white truncate">{s.store_code}</div>
                  </Link>
                ) : (
                  <button
                    onClick={() => canOpen && openProject(s.id)}
                    disabled={!canOpen || opening === s.id}
                    className="block w-full disabled:opacity-60"
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-black/10 dark:bg-white/10 mb-1" />
                    <div className="text-[10px] font-mono text-ink-faint truncate">{s.store_code}</div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-faint mt-3">
          จุดเทา = ยังไม่เปิด Installation Project — คลิกเพื่อเปิดใน Wave ที่เลือก (เฉพาะ hq_admin) &middot; รายชื่อสาขาด้านบนคือสาขาที่มีอยู่ในระบบตอนนี้ ยังไม่ครบ {ROLLOUT_TARGET} ตามแผน
        </p>
      </Card>
    </div>
  );
}
