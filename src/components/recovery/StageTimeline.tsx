"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertCircle, Trash2 } from "lucide-react";
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
  const { updateRecoveryStage, addRecoveryRemark, deleteRecoveryRemark } = useAppData();
  const currentStage: RecoveryStage = store.recovery_stage ?? "Waiting Vendor Quote";
  const currentIdx = RECOVERY_STAGES.indexOf(currentStage);

  const [note, setNote] = useState("");
  // Which stage the remark is filed against — defaults to the current stage,
  // but any already-reached stage can be picked (e.g. going back to add a
  // note on "Repairing" after the job has since moved on to "Verified").
  const [remarkStage, setRemarkStage] = useState<RecoveryStage>(currentStage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const nextStage = RECOVERY_STAGES[currentIdx + 1];
  const prevStage = currentIdx > 0 ? RECOVERY_STAGES[currentIdx - 1] : undefined;
  const reachedStages = RECOVERY_STAGES.slice(0, currentIdx + 1);
  const storeHistory = [...history]
    .filter((h) => h.store_id === store.id)
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));

  // Keep the remark-stage picker's default in sync with the current stage
  // as the store advances, rather than freezing at whatever it was on mount.
  useEffect(() => {
    setRemarkStage(currentStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage]);

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

  // Logs a remark against `remarkStage` (current or a past stage) without
  // moving the work order forward or changing its recovery_stage — e.g.
  // "รอ vendor นัดวันเข้างาน" while still "Repairing", or adding a note to
  // "Repairing" after the job has already moved on to "Verified".
  async function addRemark() {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addRecoveryRemark(store.id, remarkStage, note);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save remark.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRemark(historyId: string) {
    if (!confirm("Delete this remark? This can't be undone.")) return;
    setDeletingId(historyId);
    setError(null);
    try {
      await deleteRecoveryRemark(historyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete remark.");
    } finally {
      setDeletingId(null);
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

      {/* Remark + advance-stage form — a remark can be filed against any
          already-reached stage (not just the current one), so a forgotten
          note on e.g. "Repairing" can still be added after the job has
          since moved on. */}
      {canEdit && (
        <div className="bg-surface-muted dark:bg-white/5 rounded-md p-3 space-y-2">
          {reachedStages.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-faint shrink-0">Remark for stage</label>
              <select
                value={remarkStage}
                onChange={(e) => setRemarkStage(e.target.value as RecoveryStage)}
                className="text-xs border border-black/10 dark:border-white/10 rounded-md px-2 py-1 bg-white dark:bg-surface-dark outline-none focus:border-brand"
              >
                {reachedStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {s === currentStage ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              nextStage
                ? `Add a remark for "${remarkStage}", or move to "${nextStage}"`
                : `Add a remark for "${remarkStage}"`
            }
            rows={2}
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
          />
          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {prevStage && (
              <button
                onClick={() => advance(prevStage)}
                disabled={saving}
                title={`Move back to "${prevStage}" — use this to undo an accidental click`}
                className="flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-white/60 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 disabled:opacity-60"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                ← Back to &quot;{prevStage}&quot;
              </button>
            )}
            <button
              onClick={addRemark}
              disabled={saving || !note.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-white/60 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Add Remark
            </button>
            {nextStage && (
              <button
                onClick={() => advance(nextStage)}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                Move to &quot;{nextStage}&quot;
              </button>
            )}
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
            {storeHistory.map((h) => {
              const isRemark = h.from_stage === h.to_stage;
              return (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-[11px] text-ink-faint shrink-0 w-32">
                    {new Date(h.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <div className="flex-1">
                    <span className="text-ink dark:text-white">
                      {isRemark ? `Remark — ${h.to_stage}` : h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Opened: ${h.to_stage}`}
                    </span>
                    {h.note && <div className="text-xs text-ink-soft dark:text-white/60 mt-0.5">{h.note}</div>}
                  </div>
                  {canEdit && isRemark && (
                    <button
                      onClick={() => removeRemark(h.id)}
                      disabled={deletingId === h.id}
                      title="Delete this remark"
                      className="shrink-0 text-ink-faint hover:text-brand disabled:opacity-60"
                    >
                      {deletingId === h.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
