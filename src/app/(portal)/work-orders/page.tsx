"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Archive, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { needsRepair, getEffectiveRecoveryStage } from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";

/**
 * Work Orders "Jobs" — a round of work orders (e.g. "Job 1: 50-Store
 * Pilot") is its own batch (migration 017), not a single hardcoded scope
 * like the old is_recovery50 flag. This page lists every batch; opening one
 * (/work-orders/[batchId]) shows just its stores — what used to be this
 * entire page. Closing a batch here moves it to History without touching
 * any of the underlying store/ticket/stage data.
 */
export default function WorkOrdersBatchListPage() {
  const { stores, tickets, workOrderBatches, loading, role } = useAppData();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const canManage = canLogMaintenance(role);

  const countsByBatch = useMemo(() => {
    const m = new Map<string, { total: number; open: number }>();
    stores.forEach((s) => {
      if (!s.batch_id) return;
      const entry = m.get(s.batch_id) ?? { total: 0, open: 0 };
      entry.total += 1;
      const stage = getEffectiveRecoveryStage(s, tickets);
      if (needsRepair(s, tickets) && stage !== "Completed" && stage !== "Verified") entry.open += 1;
      m.set(s.batch_id, entry);
    });
    return m;
  }, [stores, tickets]);

  const active = workOrderBatches.filter((b) => b.status === "Active").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const closed = workOrderBatches.filter((b) => b.status === "Closed").sort((a, b) => ((a.closed_at ?? "") < (b.closed_at ?? "") ? 1 : -1));

  if (loading) return <div className="text-sm text-ink-faint">Loading work orders…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-lg font-bold text-ink dark:text-white">Work Orders</h1>
          <p className="text-sm text-ink-faint mt-0.5">Each round of work is its own job — open one to track and update its stores.</p>
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

      <Card className="p-4">
        <SectionTitle icon={ClipboardList}>Active Jobs ({active.length})</SectionTitle>
        {active.length === 0 && <p className="text-sm text-ink-faint py-3">No active jobs. Create one to start tracking work orders.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {active.map((b) => {
            const c = countsByBatch.get(b.id) ?? { total: 0, open: 0 };
            return (
              <Link
                key={b.id}
                href={`/work-orders/${b.id}`}
                className="block rounded-md border border-black/10 dark:border-white/10 p-4 hover:border-brand hover:shadow-sm transition"
              >
                <div className="text-sm font-medium text-ink dark:text-white">{b.name}</div>
                <div className="text-xs text-ink-faint mt-1">
                  Opened {new Date(b.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div>
                    <div className="font-display text-xl font-bold text-brand">{c.open}</div>
                    <div className="text-[11px] text-ink-faint uppercase tracking-wide">Open</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold text-ink dark:text-white">{c.total}</div>
                    <div className="text-[11px] text-ink-faint uppercase tracking-wide">Total</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-2 w-full">
          <Archive size={15} className="text-ink-faint" />
          <span className="text-sm font-semibold text-ink dark:text-white">History — Closed Jobs ({closed.length})</span>
        </button>
        {showHistory && (
          <div className="mt-3 divide-y divide-black/5 dark:divide-white/5">
            {closed.length === 0 && <p className="text-sm text-ink-faint py-3">No closed jobs yet.</p>}
            {closed.map((b) => {
              const c = countsByBatch.get(b.id) ?? { total: 0, open: 0 };
              return (
                <Link
                  key={b.id}
                  href={`/work-orders/${b.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-surface-muted dark:hover:bg-white/5 -mx-2 px-2 rounded-md"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 size={15} className="text-status-healthy shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink dark:text-white truncate">{b.name}</div>
                      <div className="text-xs text-ink-faint">
                        Closed {b.closed_at ? new Date(b.closed_at).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "—"}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-ink-faint shrink-0">{c.total} store(s)</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
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
