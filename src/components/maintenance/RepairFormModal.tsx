"use client";

import { useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import type { MaintenanceRecord, RepairStatus, StoreWithAssets } from "@/types/database";
import type { MaintenanceFormInput } from "@/lib/maintenanceWrite";

const STATUS_OPTIONS: RepairStatus[] = ["Pending", "In Progress", "Completed"];

interface Props {
  /** If set, the store is fixed (opened from a store's repair history) and can't be changed. */
  fixedStoreId?: string;
  /** If set, edits this existing record instead of creating a new one. */
  editingRecord?: MaintenanceRecord | null;
  onClose: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RepairFormModal({ fixedStoreId, editingRecord, onClose }: Props) {
  const { allStores, maintenance, addMaintenanceRecord, updateMaintenanceRecord } = useAppData();

  const [storeId, setStoreId] = useState(editingRecord?.store_id ?? fixedStoreId ?? "");
  const [status, setStatus] = useState<RepairStatus>(editingRecord?.status ?? "Pending");
  const [issueDate, setIssueDate] = useState(editingRecord?.issue_date ?? todayIso());
  const [startedDate, setStartedDate] = useState(editingRecord?.started_date ?? "");
  const [completedDate, setCompletedDate] = useState(editingRecord?.completed_date ?? "");
  const [vendor, setVendor] = useState(editingRecord?.vendor ?? "");
  const [problem, setProblem] = useState(editingRecord?.problem ?? "");
  const [rootCause, setRootCause] = useState(editingRecord?.root_cause ?? "");
  const [resolution, setResolution] = useState(editingRecord?.resolution ?? "");
  const [cost, setCost] = useState(editingRecord ? String(editingRecord.cost) : "");
  const [technician, setTechnician] = useState(editingRecord?.technician ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeOptions = new Map(allStores.map((s: StoreWithAssets) => [`${s.store_code} — ${s.store_name}`, s.id]));
  const currentStoreLabel = allStores.find((s) => s.id === storeId);
  const [storeLabel, setStoreLabel] = useState(
    currentStoreLabel ? `${currentStoreLabel.store_code} — ${currentStoreLabel.store_name}` : ""
  );

  const vendorSuggestions = Array.from(new Set(maintenance.map((r) => r.vendor).filter(Boolean))) as string[];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      setError("Choose a store.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: MaintenanceFormInput = {
      store_id: storeId,
      status,
      issue_date: issueDate,
      started_date: startedDate || null,
      completed_date: completedDate || null,
      vendor: vendor || null,
      problem: problem || null,
      root_cause: rootCause || null,
      resolution: resolution || null,
      cost: cost ? Number(cost) : 0,
      technician: technician || null,
    };
    try {
      if (editingRecord) {
        await updateMaintenanceRecord(editingRecord.id, input);
      } else {
        await addMaintenanceRecord(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this repair record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-lg bg-white dark:bg-surface-dark rounded-card shadow-card max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
          <div className="font-display font-semibold text-sm text-ink dark:text-white">
            {editingRecord ? "Edit Repair Record" : "Log New Repair"}
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!fixedStoreId && (
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Store *</label>
              <input
                list="store-options"
                value={storeLabel}
                onChange={(e) => {
                  setStoreLabel(e.target.value);
                  const id = storeOptions.get(e.target.value);
                  if (id) setStoreId(id);
                }}
                placeholder="Search store code or name"
                required
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
              <datalist id="store-options">
                {[...storeOptions.keys()].map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Status</label>
            <Select value={status} onChange={(v) => setStatus(v as RepairStatus)} options={STATUS_OPTIONS} placeholder="Status" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Date Reported *</label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-2 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Date Started</label>
              <input
                type="date"
                value={startedDate}
                onChange={(e) => setStartedDate(e.target.value)}
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-2 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Date Completed</label>
              <input
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-2 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Supplier / Vendor</label>
            <input
              list="vendor-options"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Flowbridge"
              className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
            />
            <datalist id="vendor-options">
              {vendorSuggestions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Problem</label>
            <input
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Root Cause</label>
            <input
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Resolution</label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Cost (฿)</label>
              <input
                type="number"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Technician</label>
              <input
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-4 py-2 text-ink-soft dark:text-white/60">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-4 py-2 disabled:opacity-60"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {editingRecord ? "Save Changes" : "Log Repair"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
