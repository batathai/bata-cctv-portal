"use client";

import { useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { RECOVERY_STAGES } from "@/lib/recovery";
import type { RecoveryStage, RecoveryStageHistoryEntry, StoreWithAssets } from "@/types/database";

/**
 * Sprint 4 - Work Orders: renders the 6-step recovery pipeline as a stepper
 * (Waiting Vendor Quote -> ... -> Verified), a form to advance the store to
 * its next stage with an optional note, and the full timestamped history
 * log underneath. Used on the Work Order detail page (/recovery/[code]).
 */
export function StageTimeline({
  store,
  history,
  canEdit,
}: {
  store: StoreWithAssets;
  history: RecoveryStageHistoryEntry[];
  canEdit: boolean;
}) {
  const { updateRecoveryStage } = useAppData();
  const currentStage: RecoveryStage = store.recovery_stage ?? "Waiting Vendor Quote";
  const currentIdx = RECOVERY_STAGES.indexOf(currentStage);

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStage = RECOVERY_STAGES[currentIdx + 1];
  const storeHistory = [...history]
    .filter((h) => h.store_id === store.id)
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));

  async function advance(stage: RecoveryStage) {
    setSaving(true);
    setError(null);
    try {
      await updateRecoveryStage(store.id, stage, note || undefined);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update stage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-start">
        {RECOVERY_STAGES.map((stage, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={stage} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div
                  className={`absolute top-3 right-1/2 w-full h-0.5 ${
                    i <= currentIdx ? "bg-brand" : "bg-black/10 dark:bg-white/10"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                  isCurrent
                    ? "bg-brand border-brand text-white"
                    : reached
                    ? "bg-brand-50 border-brand text-brand"
                    : "bg-white dark:bg-surface-dark border-black/15 dark:border-white/15 text-ink-faint"
                }`}
              >
                {reached && !isCurrent ? <Check size={12} /> : i + 1}
              </div>
              <div
                className={`mt-2 text-[10px] text-center leading-tight px-1 ${
                  isCurrent ? "text-brand font-semibold" : reached ? "text-ink dark:text-white" : "text-ink-faint"
                }`}
              >
                {stage}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advance-stage form */}
      {canEdit && nextStage && (
        <div className="bg-surface-muted dark:bg-white/5 rounded-md p-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Add a note (optional) before moving to "${nextStage}"`}
            rows={2}
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
          />
          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => advance(nextStage)}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Move to &quot;{nextStage}&quot;
            </button>
          </div>
        </div>
      )}
      {canEdit && !nextStage && <p className="text-xs text-status-healthy font-medium">This work order is fully complete (Verified)</p>}

      {/* History log */}
      <div>
        <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Update History</div>
        {storeHistory.length === 0 ? (
          <p className="text-sm text-ink-faint">No status changes yet</p>
        ) : (
          <div className="space-y-2">
            {storeHistory.map((h) => (
              <div key={h.id} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-[11px] text-ink-faint shrink-0 w-32">
                  {new Date(h.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <div>
                  <span className="text-ink dark:text-white">
                    {h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Opened: ${h.to_stage}`}
                  </span>
                  {h.note && <div className="text-xs text-ink-soft dark:text-white/60 mt-0.5">{h.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
