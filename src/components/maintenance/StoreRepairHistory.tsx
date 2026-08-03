"use client";

import { useState } from "react";
import { X, Plus, Pencil, Calendar, User, Wrench, Trash2, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { RepairStatusBadge } from "./RepairStatusBadge";
import { RepairFormModal } from "./RepairFormModal";
import { formatBaht, daysBetween } from "@/lib/format";
import type { MaintenanceRecord } from "@/types/database";

export function StoreRepairHistory({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const { allStores, maintenance, deleteMaintenanceRecord } = useAppData();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const store = allStores.find((s) => s.id === storeId);
  const records = [...maintenance]
    .filter((r) => r.store_id === storeId)
    .sort((a, b) => (a.issue_date < b.issue_date ? -1 : 1));

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteMaintenanceRecord(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-xl bg-white dark:bg-surface-dark h-full overflow-y-auto border-l border-black/10 dark:border-white/10">
        <div className="sticky top-0 bg-white dark:bg-surface-dark z-10 flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
          <div>
            <div className="font-display font-semibold text-sm text-ink dark:text-white">{store?.store_name ?? "Store"}</div>
            <div className="font-mono text-[11px] text-ink-faint">{store?.store_code}</div>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-2 mb-4"
          >
            <Plus size={13} /> Add Repair Visit
          </button>

          {records.length === 0 && <p className="text-sm text-ink-faint">No repair visits logged yet for this store.</p>}

          <div className="space-y-3">
            {records.map((r, idx) => {
              const duration = daysBetween(r.started_date || r.issue_date, r.completed_date || undefined);
              return (
                <div key={r.id} className="border border-black/10 dark:border-white/10 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold text-ink dark:text-white">Visit #{idx + 1}</div>
                    <div className="flex items-center gap-2">
                      <RepairStatusBadge status={r.status} />
                      <button
                        onClick={() => {
                          setEditing(r);
                          setShowForm(true);
                        }}
                        className="text-ink-faint hover:text-brand"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-ink-faint hover:text-brand disabled:opacity-40"
                        title="Delete"
                      >
                        {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>

                  {r.problem && <div className="text-sm text-brand font-medium mb-1">{r.problem}</div>}
                  {r.root_cause && <div className="text-xs text-ink-soft dark:text-white/60 mb-1">Root cause: {r.root_cause}</div>}
                  {r.resolution && <div className="text-xs text-ink-soft dark:text-white/60 mb-2">Resolution: {r.resolution}</div>}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                    <span className="flex items-center gap-1"><Calendar size={11} /> Reported {r.issue_date}</span>
                    {r.started_date && <span className="flex items-center gap-1"><Calendar size={11} /> Started {r.started_date}</span>}
                    {r.completed_date && <span className="flex items-center gap-1"><Calendar size={11} /> Completed {r.completed_date}</span>}
                    {duration !== null && <span>({duration} day{duration === 1 ? "" : "s"})</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-soft dark:text-white/60 mt-1.5">
                    {r.vendor && <span className="flex items-center gap-1"><Wrench size={11} /> {r.vendor}</span>}
                    {r.technician && <span className="flex items-center gap-1"><User size={11} /> {r.technician}</span>}
                    <span className="font-mono font-semibold text-status-healthy">{formatBaht(r.cost)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showForm && (
        <RepairFormModal
          fixedStoreId={storeId}
          editingRecord={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
