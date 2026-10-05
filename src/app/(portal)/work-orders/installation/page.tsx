"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KanbanSquare, FileDown, FileText, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { WorkOrdersTabs } from "@/components/work-orders/WorkOrdersTabs";
import { canLogMaintenance } from "@/lib/rbac";
import { regionFromZone, getAreaLabel } from "@/lib/recovery";
import { INSTALLATION_STAGES, getStageLabel, canAdvanceStage } from "@/lib/installation";
import type { InstallationProject, InstallationStage } from "@/types/database";
import { exportInstallationExcel } from "@/lib/reports/exportInstallationExcel";
import { exportInstallationExecSummaryPdf } from "@/lib/reports/exportInstallationPdf";

/**
 * Installation Project — Kanban board. 8 stages, one column each, cards
 * move between columns via native HTML5 drag & drop (mirrors the approved
 * Canvas mockup's board). Blocked moves (e.g. leaving "Quotation" without
 * an approved, linked quotation — R3) show an inline message instead of
 * silently allowing the drop.
 */
export default function InstallationBoardPage() {
  const { stores, installationProjects, vendorQuotations, advanceInstallationStage, loading, role } = useAppData();
  const canManage = canLogMaintenance(role);

  const [wave, setWave] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const waves = useMemo(() => Array.from(new Set(installationProjects.map((p) => p.wave))).sort(), [installationProjects]);

  const filtered = useMemo(() => {
    return installationProjects.filter((p) => {
      const store = storeById.get(p.store_id);
      if (!store) return false;
      if (wave && p.wave !== wave) return false;
      if (region && regionFromZone(store.zone) !== region) return false;
      if (zone && store.zone !== zone) return false;
      return true;
    });
  }, [installationProjects, storeById, wave, region, zone]);

  const byStage = useMemo(() => {
    const m = new Map<InstallationStage, InstallationProject[]>();
    INSTALLATION_STAGES.forEach((s) => m.set(s, []));
    filtered.forEach((p) => m.get(p.current_stage)?.push(p));
    return m;
  }, [filtered]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((p) => p.current_stage === "Completed").length;
    const inProgress = total - completed;
    const blockedOnQuote = filtered.filter((p) => p.current_stage === "Quotation" && !canAdvanceStage(p, vendorQuotations)).length;
    return { total, completed, inProgress, blockedOnQuote };
  }, [filtered, vendorQuotations]);

  async function handleDrop(project: InstallationProject, toStage: InstallationStage) {
    setBlockedMsg(null);
    if (toStage === project.current_stage) return;
    const toIdx = INSTALLATION_STAGES.indexOf(toStage);
    const fromIdx = INSTALLATION_STAGES.indexOf(project.current_stage);
    // Only allow moving one step forward or any step back (Kanban card drags
    // are usually forward; backward correction should always be possible).
    if (toIdx === fromIdx + 1 && !canAdvanceStage(project, vendorQuotations)) {
      setBlockedMsg(`ย้ายไม่ได้: ต้องมีใบเสนอราคาที่ Approved และผูกกับโปรเจกต์นี้ก่อน (R3) — สาขา ${storeById.get(project.store_id)?.store_code ?? ""}`);
      return;
    }
    const extra: Record<string, unknown> = {};
    if (toStage === "Permit") extra.permit_submitted_at = new Date().toISOString().slice(0, 10);
    if (toStage === "Scheduled" && !project.d1_date) extra.d1_date = new Date().toISOString().slice(0, 10);
    if (toStage === "Installing" && !project.d2_date) extra.d2_date = new Date().toISOString().slice(0, 10);
    await advanceInstallationStage(project, toStage, extra);
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading installation projects…</div>;

  return (
    <div className="space-y-5">
      <WorkOrdersTabs />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-lg font-bold text-ink dark:text-white">Installation Project</h1>
          <p className="text-sm text-ink-faint mt-0.5">ติดตามความคืบหน้าการติดตั้งกล้อง CCTV ใหม่รายสาขา — {kpi.total} สาขาในตัวกรองนี้</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/work-orders/installation/timeline" className="text-xs font-medium text-ink-soft dark:text-white/70 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5">
            Timeline
          </Link>
          <Link href="/work-orders/installation/rollout" className="text-xs font-medium text-ink-soft dark:text-white/70 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5">
            Rollout 194
          </Link>
          <button
            onClick={() => exportInstallationExcel(filtered, storeById, vendorQuotations)}
            className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5"
          >
            <FileDown size={14} /> Export Excel
          </button>
          <button
            onClick={() => exportInstallationExecSummaryPdf(filtered, storeById)}
            className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5"
          >
            <FileText size={14} /> Export PDF
          </button>
        </div>
      </div>

      {blockedMsg && (
        <div className="flex items-start gap-2 text-xs text-brand bg-brand-50 dark:bg-brand/10 border border-brand/20 rounded-md px-3 py-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {blockedMsg}
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Kpi label="Total" value={kpi.total} />
          <Kpi label="In Progress" value={kpi.inProgress} />
          <Kpi label="Completed" value={kpi.completed} accent />
          <Kpi label="รอใบเสนอราคา Approved" value={kpi.blockedOnQuote} warn />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={wave} onChange={(e) => setWave(e.target.value)} className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-white dark:bg-white/5">
            <option value="">ทุก Wave</option>
            {waves.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-white dark:bg-white/5">
            <option value="">ทุกภาค</option>
            <option value="BKK">BKK</option>
            <option value="Upcountry">Upcountry</option>
          </select>
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-white dark:bg-white/5">
            <option value="">ทุกเขต</option>
            {["511", "512", "513", "550", "520", "530", "540", "560"].map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
      </Card>

      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-2">
          {INSTALLATION_STAGES.map((stage) => {
            const cards = byStage.get(stage) ?? [];
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const p = filtered.find((x) => x.id === dragProjectId);
                  if (p) handleDrop(p, stage);
                  setDragProjectId(null);
                }}
                className="w-64 shrink-0 bg-surface-muted dark:bg-white/[0.02] rounded-lg p-2.5"
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-ink dark:text-white">{getStageLabel(stage)}</span>
                  <span className="text-[11px] text-ink-faint bg-white dark:bg-white/10 rounded-full px-1.5 py-0.5">{cards.length}</span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {cards.map((p) => {
                    const store = storeById.get(p.store_id);
                    if (!store) return null;
                    return (
                      <Link
                        key={p.id}
                        href={`/work-orders/installation/${store.store_code}`}
                        draggable={canManage}
                        onDragStart={() => setDragProjectId(p.id)}
                        className="block bg-white dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-md p-3 hover:border-brand hover:shadow-sm transition cursor-grab"
                      >
                        <div className="text-xs font-semibold text-ink dark:text-white">{store.store_code}</div>
                        <div className="text-[11px] text-ink-faint truncate">{store.store_name}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-ink-faint">{getAreaLabel(store.zone)}</span>
                          {stage === "Verify" && <span className="text-[10px] font-medium text-brand">{p.verify_total}/12</span>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {installationProjects.length === 0 && canManage && (
        <Card className="p-4">
          <SectionTitle icon={KanbanSquare}>เริ่มเปิดโปรเจกต์แรก</SectionTitle>
          <p className="text-sm text-ink-faint">ยังไม่มี Installation Project — เปิดจากหน้า Rollout 194 หรือ Asset Register ของสาขานั้น ๆ</p>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className={`font-display text-xl font-bold ${warn ? "text-status-partial" : accent ? "text-status-healthy" : "text-ink dark:text-white"}`}>{value}</div>
      <div className="text-[11px] text-ink-faint uppercase tracking-wide">{label}</div>
    </div>
  );
}
