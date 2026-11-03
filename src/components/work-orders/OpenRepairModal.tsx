"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { TICKET_ISSUE_TYPES } from "@/lib/tickets";
import type { RepairReason } from "@/components/status/RepairLink";
import type { StoreWithAssets, TicketIssueType } from "@/types/database";

const field =
  "w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand";

/**
 * Opens a repair work order straight from Device Status, the Asset Register or
 * the Dashboard (redesign 2026-11-03). One submit does everything the Job page
 * used to need several screens for: creates the incident ticket, then puts the
 * store into a Job (a new one named after the store, or an existing active one)
 * so it shows up in Work Orders right away — before, a ticket opened from the
 * store page was not in any Job until someone added it by hand.
 *
 * `reason` pre-fills the issue and note from the DVR status; null = the person
 * opened it from a store that has no suggestion (e.g. an Online store).
 */
export function OpenRepairModal({ store, reason, onClose }: { store: StoreWithAssets; reason: RepairReason | null; onClose: () => void }) {
  const { workOrderBatches, createTicket, createWorkOrderBatch, assignStoreToBatch } = useAppData();

  const activeBatches = useMemo(
    () => workOrderBatches.filter((b) => b.status === "Active").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [workOrderBatches]
  );
  // A store that already sits in an active job defaults to staying there.
  const currentBatch = store.batch_id ? activeBatches.find((b) => b.id === store.batch_id) : undefined;

  const [issue, setIssue] = useState<TicketIssueType>(reason?.issue ?? "Camera Failure");
  const [note, setNote] = useState(reason?.note ?? "");
  const [mode, setMode] = useState<"new" | "existing">(currentBatch ? "existing" : "new");
  const [batchId, setBatchId] = useState(currentBatch?.id ?? activeBatches[0]?.id ?? "");
  const [newName, setNewName] = useState(`${store.store_code} ${store.store_name}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remember what already succeeded so a retry after a partial failure
  // doesn't create a second ticket or a second job.
  const [ticketDone, setTicketDone] = useState(false);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [doneJobId, setDoneJobId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const pickedBatch = activeBatches.find((b) => b.id === batchId);
  const movingFrom =
    mode === "existing" && store.batch_id && store.batch_id !== batchId ? activeBatches.find((b) => b.id === store.batch_id) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "new" && !newName.trim()) {
      setError("ใส่ชื่อ Job ก่อน");
      return;
    }
    if (mode === "existing" && !batchId) {
      setError("เลือก Job ก่อน");
      return;
    }
    setSaving(true);
    setError(null);
    // `ticketDone` is state, so it is stale inside this call — keep a local copy for the error message.
    let ticketOk = ticketDone;
    try {
      if (!ticketOk) {
        await createTicket({ store_id: store.id, issue_type: issue, description: note.trim() || null });
        ticketOk = true;
        setTicketDone(true);
      }
      let target = batchId;
      if (mode === "new") {
        if (!createdBatchId) {
          const created = await createWorkOrderBatch(newName);
          setCreatedBatchId(created.id);
          target = created.id;
        } else {
          target = createdBatchId;
        }
      }
      await assignStoreToBatch(store.id, target);
      setDoneJobId(target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ";
      setError(ticketOk ? `เปิด Ticket แล้ว แต่ยังใส่ Job ไม่สำเร็จ: ${msg} — กดอีกครั้งเพื่อลองใหม่` : msg);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !saving && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`เปิดงานซ่อม ${store.store_code}`}
        className="bg-white dark:bg-surface-dark rounded-card shadow-card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-ink dark:text-white">เปิดงานซ่อม</h2>
            <p className="text-xs text-ink-faint mt-0.5 truncate">
              {store.store_code} · {store.store_name}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="ปิด" className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        {doneJobId ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-ink dark:text-white">
              <CheckCircle2 size={16} className="text-status-healthy shrink-0 mt-0.5" />
              เปิดงานซ่อมแล้ว — สาขานี้อยู่ใน Work Orders แล้ว
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="text-xs font-medium text-ink-soft dark:text-white/60 rounded-md px-3 py-1.5">
                ปิด
              </button>
              <Link href={`/work-orders/${doneJobId}`} className="text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 hover:opacity-90">
                ไปที่ Job
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="repair-issue" className="text-xs font-medium text-ink-soft dark:text-white/70 block mb-1">
                ปัญหา
              </label>
              <select id="repair-issue" value={issue} onChange={(e) => setIssue(e.target.value as TicketIssueType)} disabled={ticketDone} className={field}>
                {TICKET_ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="repair-note" className="text-xs font-medium text-ink-soft dark:text-white/70 block mb-1">
                หมายเหตุ{reason ? " (เติมให้จากสถานะ DVR)" : ""}
              </label>
              <textarea id="repair-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={ticketDone} className={field} />
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-ink-soft dark:text-white/70 mb-1.5">ใส่ใน Job</legend>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md border text-sm cursor-pointer ${
                    mode === "new" ? "border-brand bg-brand/5" : "border-black/10 dark:border-white/10"
                  }`}
                >
                  <input type="radio" name="repair-job-mode" checked={mode === "new"} onChange={() => setMode("new")} />
                  สร้าง Job ใหม่
                </label>
                {mode === "new" && (
                  <input aria-label="ชื่อ Job ใหม่" value={newName} onChange={(e) => setNewName(e.target.value)} className={field} />
                )}

                <label
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md border text-sm ${
                    activeBatches.length === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  } ${mode === "existing" ? "border-brand bg-brand/5" : "border-black/10 dark:border-white/10"}`}
                >
                  <input
                    type="radio"
                    name="repair-job-mode"
                    checked={mode === "existing"}
                    disabled={activeBatches.length === 0}
                    onChange={() => setMode("existing")}
                  />
                  เพิ่มใน Job ที่มีอยู่
                </label>
                {mode === "existing" && (
                  <select aria-label="เลือก Job" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={field}>
                    {activeBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                {movingFrom && pickedBatch && (
                  <p className="text-xs text-[#8A5A00] dark:text-status-partial">
                    สาขานี้อยู่ใน “{movingFrom.name}” อยู่แล้ว — จะย้ายมาที่ “{pickedBatch.name}”
                  </p>
                )}
              </div>
            </fieldset>

            {error && (
              <p className="text-xs text-brand flex items-start gap-1.5">
                <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="text-xs font-medium text-ink-soft dark:text-white/60 rounded-md px-3 py-1.5 disabled:opacity-60">
                ยกเลิก
              </button>
              <button type="submit" disabled={saving} className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60">
                {saving && <Loader2 size={12} className="animate-spin" />}
                เปิดงานซ่อม
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
