"use client";

import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { StatusBadge } from "@/components/ui/Badge";
import type { OverallStatus } from "@/types/database";

const OVERALL_STATUS_OPTIONS: { value: OverallStatus; label: string }[] = [
  { value: "Healthy", label: "Online" },
  { value: "Partial", label: "Partial" },
  { value: "Offline", label: "Offline" },
  { value: "Unknown", label: "Unknown" },
];

/**
 * StatusBadge + an inline edit control. Status was read-only everywhere it
 * was shown — e.g. Asset Register had no way to flip a store from "Partial"
 * to "Online"/"Complete" even after the device was actually fixed. Writes
 * via the same path as everything else (editAssetDetails ->
 * updateStoreDetailsDb on `stores.overall_status`).
 */
export function EditableStatusBadge({ storeId, status, canEdit }: { storeId: string; status: OverallStatus; canEdit: boolean }) {
  const { editAssetDetails } = useAppData();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: OverallStatus) {
    setSaving(true);
    setError(null);
    try {
      await editAssetDetails(storeId, { store: { overall_status: next } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            title="Edit status"
            className="text-ink-faint hover:text-brand"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={status}
        onChange={(e) => save(e.target.value as OverallStatus)}
        disabled={saving}
        autoFocus
        className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1 bg-white dark:bg-surface-dark outline-none focus:border-brand disabled:opacity-60"
      >
        {OVERALL_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {saving && <Loader2 size={12} className="animate-spin text-ink-faint" />}
      <button onClick={() => setEditing(false)} className="text-xs text-ink-soft dark:text-white/60 hover:text-brand">
        Done
      </button>
      {error && <span className="text-xs text-brand">{error}</span>}
    </div>
  );
}
