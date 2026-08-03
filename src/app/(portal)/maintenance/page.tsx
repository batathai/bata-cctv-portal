"use client";

import { useMemo, useState } from "react";
import { Wrench, Search, Calendar, User, Plus } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { RepairStatusBadge } from "@/components/maintenance/RepairStatusBadge";
import { RepairFormModal } from "@/components/maintenance/RepairFormModal";
import { StoreRepairHistory } from "@/components/maintenance/StoreRepairHistory";
import { formatBaht } from "@/lib/format";

export default function MaintenancePage() {
  const { maintenance, stores, loading } = useAppData();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openStoreId, setOpenStoreId] = useState<string | null>(null);

  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const visible = maintenance.filter((r) => storeMap.has(r.store_id));
  const filtered = visible.filter((r) => {
    const store = storeMap.get(r.store_id);
    return (`${store?.store_name} ${store?.store_code} ${r.vendor} ${r.problem}`).toLowerCase().includes(q.toLowerCase());
  });

  // Visit # is per-store, based on chronological order across ALL of that
  // store's records (not just the filtered/searched subset).
  const visitNumber = useMemo(() => {
    const byStore = new Map<string, string[]>();
    [...visible]
      .sort((a, b) => (a.issue_date < b.issue_date ? -1 : 1))
      .forEach((r) => {
        const list = byStore.get(r.store_id) ?? [];
        list.push(r.id);
        byStore.set(r.store_id, list);
      });
    const map = new Map<string, number>();
    byStore.forEach((ids) => ids.forEach((id, i) => map.set(id, i + 1)));
    return map;
  }, [visible]);

  const totalCost = filtered.reduce((a, r) => a + r.cost, 0);
  const completedCount = filtered.filter((r) => r.status === "Completed").length;
  const pendingCount = filtered.filter((r) => r.status === "Pending").length;
  const inProgressCount = filtered.filter((r) => r.status === "In Progress").length;

  if (loading) return <div className="text-sm text-ink-faint">Loading maintenance history…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-3 flex-1">
          <StatCard label="Total Repairs" value={filtered.length} colorClass="text-brand" />
          <StatCard label="Total Cost" value={formatBaht(totalCost)} />
          <StatCard label="Completed" value={completedCount} colorClass="text-status-healthy" />
          <StatCard label="Pending" value={pendingCount} colorClass="text-status-offline" />
          <StatCard label="In Progress" value={inProgressCount} colorClass="text-status-partial" />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-2.5 h-fit"
        >
          <Plus size={13} /> Log New Repair
        </button>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <SectionTitle icon={Wrench}>Maintenance History</SectionTitle>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store, vendor, issue"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
        </div>

        <div className="space-y-2 max-h-[620px] overflow-y-auto">
          {filtered.length === 0 && <p className="text-sm text-ink-faint">No repair records match.</p>}
          {[...filtered]
            .sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1))
            .map((r) => {
              const store = storeMap.get(r.store_id);
              return (
                <button
                  key={r.id}
                  onClick={() => setOpenStoreId(r.store_id)}
                  className="w-full flex flex-col sm:flex-row gap-3 p-3 rounded-md bg-surface-muted dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-sm text-left transition-colors"
                >
                  <div className="sm:w-28 shrink-0">
                    <div className="text-[11px] font-medium text-ink-faint">Visit #{visitNumber.get(r.id) ?? "—"}</div>
                    <div className="flex items-center gap-1 text-[11px] text-ink-soft dark:text-white/60 mt-1">
                      <Calendar size={11} /> {r.issue_date}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-ink dark:text-white">
                        {store?.store_name} <span className="font-mono text-[11px] text-ink-faint">({store?.store_code})</span>
                      </div>
                      <RepairStatusBadge status={r.status} />
                    </div>
                    <div className="text-brand text-xs mt-0.5">{r.problem}</div>
                    {r.root_cause && <div className="text-xs text-ink-soft dark:text-white/60 mt-0.5">Root cause: {r.root_cause}</div>}
                    {r.resolution && <div className="text-xs text-ink-soft dark:text-white/60">Resolution: {r.resolution}</div>}
                  </div>
                  <div className="sm:w-36 shrink-0 sm:text-right">
                    <div className="flex sm:justify-end items-center gap-1 text-xs text-ink-soft dark:text-white/60">
                      <User size={11} /> {r.technician || "—"}
                    </div>
                    <div className="text-xs text-ink-soft dark:text-white/60 mt-1">{r.vendor || "—"}</div>
                    <div className="font-mono text-sm text-status-healthy font-semibold mt-1">{formatBaht(r.cost)}</div>
                  </div>
                </button>
              );
            })}
        </div>
      </Card>

      {showForm && <RepairFormModal onClose={() => setShowForm(false)} />}
      {openStoreId && <StoreRepairHistory storeId={openStoreId} onClose={() => setOpenStoreId(null)} />}
    </div>
  );
}
