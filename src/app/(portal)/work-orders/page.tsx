"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Plus, Search, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card } from "@/components/ui/Card";
import { WorkOrdersTabs } from "@/components/work-orders/WorkOrdersTabs";
import {
  RECOVERY_STAGES,
  needsRepair,
  getEffectiveRecoveryStage,
  getLatestRemark,
  zoneCode,
} from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";
import type { RecoveryStage, StoreWithAssets, WorkOrderBatch } from "@/types/database";

/**
 * Work Orders "Jobs" — a round of work orders (e.g. "Job 1: 50-Store
 * Pilot") is its own batch (migration 017), not a single hardcoded scope
 * like the old is_recovery50 flag. This page lists every batch as one dense
 * row (redesign 2026-11-03: the old 3-per-row cards stopped being scannable
 * once many stores each got their own job); opening one
 * (/work-orders/[batchId]) shows just its stores. Closing a batch moves it to
 * History (the "รวมงานที่ปิดแล้ว" toggle) without touching any of the
 * underlying store/ticket/stage data.
 */

// Stages a job can be stuck at, in the order they're worked through.
const OPEN_STAGES: RecoveryStage[] = RECOVERY_STAGES.filter((s) => s !== "Completed" && s !== "Verified");

// Same hues as the Dashboard's Work Order Pipeline chart.
const STAGE_DOT: Record<RecoveryStage, string> = {
  "Waiting Vendor Quote": "#E2A400",
  "Waiting Approval": "#F0B429",
  "Waiting Repair": "#F04952",
  Repairing: "#D71920",
  Completed: "#5CB88B",
  Verified: "#1E9E5A",
};

// A job open this many days or longer is flagged in red.
const STALE_DAYS = 14;

const GRID =
  "grid grid-cols-[minmax(220px,1.6fr)_80px_190px_100px_84px_minmax(160px,1.2fr)_20px] gap-x-3 items-center px-4";

type SortKey = "age" | "name";

interface JobRow {
  batch: WorkOrderBatch;
  total: number;
  open: number;
  worstStage: RecoveryStage | null;
  zones: string[];
  remark: string | null;
  ageDays: number;
  hay: string;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function WorkOrdersBatchListPage() {
  const { stores, tickets, workOrderBatches, recoveryStageHistory, loading, role } = useAppData();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [stageFilter, setStageFilter] = useState<RecoveryStage | "all">("all");
  const [zoneFilter, setZoneFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("age");
  const [q, setQ] = useState("");
  const canManage = canLogMaintenance(role);

  const jobs = useMemo<JobRow[]>(() => {
    const byBatch = new Map<string, StoreWithAssets[]>();
    stores.forEach((s) => {
      if (!s.batch_id) return;
      const list = byBatch.get(s.batch_id) ?? [];
      list.push(s);
      byBatch.set(s.batch_id, list);
    });

    return workOrderBatches.map((batch) => {
      const members = byBatch.get(batch.id) ?? [];
      const work = members.filter((s) => needsRepair(s, tickets));
      const stageOf = (s: StoreWithAssets) => getEffectiveRecoveryStage(s, tickets);
      const open = work.filter((s) => {
        const st = stageOf(s);
        return st !== "Completed" && st !== "Verified";
      }).length;
      // The least advanced store is what is holding the whole job up.
      const worstIdx = work.length ? Math.min(...work.map((s) => RECOVERY_STAGES.indexOf(stageOf(s)))) : -1;
      const zones = Array.from(new Set(members.map((s) => zoneCode(s.zone)))).sort();
      const remark = members.map((s) => getLatestRemark(s, recoveryStageHistory)).find((r) => !!r) ?? null;
      return {
        batch,
        total: members.length,
        open,
        worstStage: worstIdx >= 0 ? RECOVERY_STAGES[worstIdx] : null,
        zones,
        remark,
        ageDays: daysSince(batch.created_at),
        hay: [batch.name, ...members.map((s) => `${s.store_code} ${s.store_name}`)].join(" ").toLowerCase(),
      };
    });
  }, [stores, tickets, workOrderBatches, recoveryStageHistory]);

  const activeCount = jobs.filter((j) => j.batch.status === "Active").length;
  const closedCount = jobs.length - activeCount;

  // Everything except the stage chip, so the chip counts stay meaningful while searching.
  const base = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return jobs.filter((j) => {
      if (!showClosed && j.batch.status === "Closed") return false;
      if (zoneFilter && !j.zones.includes(zoneFilter)) return false;
      return words.every((w) => j.hay.includes(w));
    });
  }, [jobs, showClosed, zoneFilter, q]);

  const stageCounts = useMemo(() => {
    const c = new Map<RecoveryStage, number>();
    base.forEach((j) => {
      if (j.batch.status === "Active" && j.worstStage) c.set(j.worstStage, (c.get(j.worstStage) ?? 0) + 1);
    });
    return c;
  }, [base]);

  const rows = useMemo(() => {
    const filtered = stageFilter === "all" ? base : base.filter((j) => j.batch.status === "Active" && j.worstStage === stageFilter);
    return [...filtered].sort((a, b) => {
      // Closed jobs always sink to the bottom.
      const ac = a.batch.status === "Closed" ? 1 : 0;
      const bc = b.batch.status === "Closed" ? 1 : 0;
      if (ac !== bc) return ac - bc;
      if (sort === "name") return a.batch.name.localeCompare(b.batch.name);
      // Longest-running jobs that still have open work first; finished/empty ones after.
      const ao = a.open > 0 ? 0 : 1;
      const bo = b.open > 0 ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.ageDays - a.ageDays;
    });
  }, [base, stageFilter, sort]);

  const zoneOptions = useMemo(() => Array.from(new Set(jobs.flatMap((j) => j.zones))).sort(), [jobs]);

  if (loading) return <div className="text-sm text-ink-faint">Loading work orders…</div>;

  return (
    <div className="space-y-4">
      <WorkOrdersTabs />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-lg font-bold text-ink dark:text-white">Work Orders</h1>
          <p className="text-sm text-ink-faint mt-0.5">
            งานซ่อมทุก Job ในหน้าเดียว · Active {activeCount} · ปิดแล้ว {closedCount} — กดแถวเพื่อเปิดรายละเอียด
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowNewBatch(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-2 shrink-0 hover:opacity-90"
          >
            <Plus size={14} /> New Job
          </button>
        )}
      </div>

      {showNewBatch && <NewBatchModal onClose={() => setShowNewBatch(false)} />}

      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตาม Stage">
        <StageChip active={stageFilter === "all"} onClick={() => setStageFilter("all")} label="ทั้งหมด" count={base.length} />
        {OPEN_STAGES.map((st) => (
          <StageChip
            key={st}
            active={stageFilter === st}
            onClick={() => setStageFilter(stageFilter === st ? "all" : st)}
            label={st}
            count={stageCounts.get(st) ?? 0}
            dot={STAGE_DOT[st]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-ink-faint" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหา Job หรือสาขา"
            placeholder="ค้นหา Job / สาขา / รหัสสาขา"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-brand"
          />
        </div>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          aria-label="กรองตามเขต"
          className="h-9 px-3 text-sm rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-brand"
        >
          <option value="">เขต: ทั้งหมด</option>
          {zoneOptions.map((z) => (
            <option key={z} value={z}>
              เขต {z}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="เรียงลำดับ"
          className="h-9 px-3 text-sm rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:border-brand"
        >
          <option value="age">เรียง: เปิดนานสุด</option>
          <option value="name">เรียง: ชื่อ Job</option>
        </select>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-ink-soft dark:text-white/70 cursor-pointer">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          รวมงานที่ปิดแล้ว (History)
        </label>
      </div>

      <Card className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className={clsx(GRID, "h-9 bg-surface-muted dark:bg-white/5 border-b border-black/5 dark:border-white/10 text-xs font-semibold text-ink-faint")}>
            <div>Job</div>
            <div>เขต</div>
            <div>ขั้นตอน (Stage)</div>
            <div>เปิดมาแล้ว</div>
            <div>Open / ทั้งหมด</div>
            <div>หมายเหตุ</div>
            <div />
          </div>

          {rows.length === 0 && (
            <p className="text-sm text-ink-faint px-4 py-6">
              {jobs.length === 0 ? "ยังไม่มี Job — กด New Job เพื่อเริ่มติดตามงานซ่อม" : "ไม่พบ Job ที่ตรงกับตัวกรอง"}
            </p>
          )}

          {rows.map((j) => (
            <JobTableRow key={j.batch.id} job={j} />
          ))}

          <div className="h-10 flex items-center px-4 text-xs text-ink-faint">
            แสดง {rows.length} จาก {jobs.length} Job
          </div>
        </div>
      </Card>
    </div>
  );
}

function StageChip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center gap-2 h-8 px-3 rounded-full border text-xs transition-colors",
        active
          ? "bg-ink text-white border-ink dark:bg-white dark:text-ink dark:border-white"
          : "bg-white dark:bg-white/5 text-ink dark:text-white border-black/10 dark:border-white/10 hover:border-brand"
      )}
    >
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} aria-hidden="true" />}
      <span>{label}</span>
      <span className="font-bold">{count}</span>
    </button>
  );
}

function JobTableRow({ job }: { job: JobRow }) {
  const { batch, total, open, worstStage, zones, remark, ageDays } = job;
  const closed = batch.status === "Closed";
  const stale = !closed && open > 0 && ageDays >= STALE_DAYS;
  return (
    <Link
      href={`/work-orders/${batch.id}`}
      className={clsx(
        GRID,
        "h-10 text-sm border-b border-black/5 dark:border-white/5 hover:bg-surface-muted dark:hover:bg-white/5",
        closed && "text-ink-faint"
      )}
    >
      <div className="truncate font-medium text-ink dark:text-white" title={batch.name}>
        {batch.name}
      </div>
      <div className="text-ink-soft dark:text-white/60 truncate">{zones.length === 0 ? "—" : zones.length === 1 ? zones[0] : `${zones[0]} +${zones.length - 1}`}</div>
      <div>
        {closed ? (
          <span className="inline-flex items-center h-6 px-2.5 rounded-full text-xs bg-black/5 dark:bg-white/10 text-ink-soft dark:text-white/70">ปิดแล้ว</span>
        ) : worstStage ? (
          <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium bg-black/[0.04] dark:bg-white/10 text-ink dark:text-white">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_DOT[worstStage] }} aria-hidden="true" />
            {worstStage}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">{total === 0 ? "ยังไม่มีสาขา" : "—"}</span>
        )}
      </div>
      <div className={clsx("text-xs", stale ? "font-semibold text-brand" : "text-ink-soft dark:text-white/60")}>
        {closed && batch.closed_at ? `ปิด ${new Date(batch.closed_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}` : `${ageDays} วัน`}
      </div>
      <div className="text-ink-soft dark:text-white/60">
        <span className="font-bold text-ink dark:text-white">{open}</span> / {total}
      </div>
      <div className="truncate text-xs text-ink-soft dark:text-white/60" title={remark ?? undefined}>
        {remark ?? "—"}
      </div>
      <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" />
    </Link>
  );
}

function NewBatchModal({ onClose }: { onClose: () => void }) {
  const { createWorkOrderBatch } = useAppData();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const batch = await createWorkOrderBatch(name.trim());
      window.location.href = `/work-orders/${batch.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create job.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-surface-dark rounded-lg shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-ink dark:text-white mb-3">New Job</h2>
        <label className="text-xs text-ink-faint block mb-1">Job name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Job 2: Q3 Round"'
          className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
        />
        {error && (
          <p className="text-xs text-brand flex items-start gap-1.5 mt-2">
            <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={saving} className="text-xs font-medium text-ink-soft dark:text-white/60 rounded-md px-3 py-1.5 disabled:opacity-60">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Create &amp; open
          </button>
        </div>
      </div>
    </div>
  );
}
