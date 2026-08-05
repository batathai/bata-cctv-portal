"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Search, FileText, Plus } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/Badge";
import { RecoveryStageBadge } from "@/components/recovery/RecoveryBadges";
import { NewTicketModal } from "@/components/work-orders/NewTicketModal";
import { RECOVERY_STAGES, needsRepair, getEffectiveRecoveryStage, getRecoveryRegion, getAreaLabel } from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";
import type { RecoveryStage, StoreWithAssets } from "@/types/database";

/**
 * Sprint 4 - Work Orders: a dedicated, actionable list of every
 * store currently in the repair pipeline — separate from the general
 * Store List, which mixes in every store regardless of repair status.
 * Clicking a row opens /recovery/[code], which now has the stage timeline
 * + update form (see StageTimeline.tsx).
 */
export default function WorkOrdersPage() {
  const { stores, tickets, recoveryStageHistory, loading, role } = useAppData();
  const [stageFilter, setStageFilter] = useState<RecoveryStage | "">("");
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState("");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const canOpenTicket = canLogMaintenance(role);

  const workOrderStores = useMemo(() => stores.filter((s) => needsRepair(s, tickets)), [stores, tickets]);

  // Every count on this page is derived from the same per-store bucket
  // (getEffectiveRecoveryStage) so they can never drift apart again: the
  // stage-breakdown cards sum to workOrderStores.length by construction, and
  // "Total Open" is that same total (every work order ever opened for a
  // store, regardless of how far along it is — including Completed/Verified).
  const stageCounts = useMemo(() => {
    const c: Record<RecoveryStage, number> = {
      "Waiting Vendor Quote": 0,
      "Waiting Approval": 0,
      "Waiting Repair": 0,
      Repairing: 0,
      Completed: 0,
      Verified: 0,
    };
    workOrderStores.forEach((s) => {
      const stage = getEffectiveRecoveryStage(s, tickets);
      c[stage] = (c[stage] ?? 0) + 1;
    });
    return c;
  }, [workOrderStores, tickets]);

  const openCount = useMemo(() => RECOVERY_STAGES.reduce((sum, stage) => sum + stageCounts[stage], 0), [stageCounts]);

  const earliestChangeByStore = useMemo(() => {
    const m = new Map<string, string>();
    recoveryStageHistory.forEach((h) => {
      const existing = m.get(h.store_id);
      if (!existing || h.changed_at < existing) m.set(h.store_id, h.changed_at);
    });
    return m;
  }, [recoveryStageHistory]);

  function daysOpen(store: StoreWithAssets): number | null {
    const opened = earliestChangeByStore.get(store.id);
    if (!opened) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(opened).getTime()) / 86400000));
  }

  const filtered = useMemo(() => {
    return workOrderStores.filter((s) => {
      const stage = getEffectiveRecoveryStage(s, tickets);
      if (!showDone && (stage === "Completed" || stage === "Verified")) return false;
      if (stageFilter && stage !== stageFilter) return false;
      if (q && !(s.store_name + s.store_code).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [workOrderStores, tickets, showDone, stageFilter, q]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ai = RECOVERY_STAGES.indexOf(getEffectiveRecoveryStage(a, tickets));
        const bi = RECOVERY_STAGES.indexOf(getEffectiveRecoveryStage(b, tickets));
        if (ai !== bi) return ai - bi;
        return a.store_code.localeCompare(b.store_code);
      }),
    [filtered, tickets]
  );

  if (loading) return <div className="text-sm text-ink-faint">Loading work orders…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-lg font-bold text-ink dark:text-white">Work Orders</h1>
          <p className="text-sm text-ink-faint mt-0.5">
            {openCount} store(s) tracked in the work order system &middot; click a row to view details and update its status step by step
          </p>
        </div>
        {canOpenTicket && (
          <button
            onClick={() => setShowNewTicket(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-2 shrink-0 hover:opacity-90"
          >
            <Plus size={14} /> New Ticket
          </button>
        )}
      </div>

      {showNewTicket && <NewTicketModal onClose={() => setShowNewTicket(false)} />}

      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Total Open"
          value={openCount}
          colorClass="text-brand"
          onClick={() => {
            setStageFilter("");
            setShowDone(true);
          }}
          active={!stageFilter && showDone}
        />
        {RECOVERY_STAGES.map((stage) => (
          <StatCard
            key={stage}
            label={stage}
            value={stageCounts[stage]}
            onClick={() => {
              setStageFilter(stage);
              setShowDone(stage === "Completed" || stage === "Verified");
            }}
            active={stageFilter === stage}
          />
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <SectionTitle icon={ClipboardList}>Work Orders ({sorted.length})</SectionTitle>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-soft dark:text-white/60">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Show completed too
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search store / store code"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/5">
          {sorted.map((s) => {
            const days = daysOpen(s);
            return (
              <Link
                key={s.id}
                href={`/recovery/${s.store_code}`}
                className="flex items-center gap-3 py-3 flex-wrap hover:bg-surface-muted dark:hover:bg-white/5 -mx-2 px-2 rounded-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink dark:text-white truncate">{s.store_name}</div>
                  <div className="font-mono text-[11px] text-ink-faint">
                    {s.store_code} &middot; {getRecoveryRegion(s.zone)} &middot; {getAreaLabel(s.zone)}
                  </div>
                </div>
                {days != null && <span className="text-xs text-ink-faint shrink-0 hidden sm:inline">{days} days</span>}
                <StatusBadge status={s.overall_status} />
                <RecoveryStageBadge stage={getEffectiveRecoveryStage(s, tickets)} />
                <span className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 shrink-0">
                  <FileText size={13} /> View Order
                </span>
              </Link>
            );
          })}
          {sorted.length === 0 && <p className="text-sm text-ink-faint py-4">No work orders match the current filter</p>}
        </div>
      </Card>
    </div>
  );
}
