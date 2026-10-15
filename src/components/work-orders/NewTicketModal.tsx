"use client";

import { useMemo, useState } from "react";
import { Search, Loader2, AlertCircle, X } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import { TICKET_ISSUE_TYPES } from "@/lib/tickets";
import { needsRepair } from "@/lib/recovery";
import type { StoreWithAssets, TicketIssueType } from "@/types/database";

/**
 * Sprint 5 - lets a manager open a Work Order directly from a Job's page,
 * instead of having to open each store's Asset Register detail page first.
 * Under the hood this creates an incident_ticket exactly like TicketsCard
 * does (see src/components/assets/TicketsCard.tsx) — the store then shows
 * up on the job's page automatically via needsRepair(), no separate "work
 * order" row to create.
 *
 * `assignToBatchId`, when set, also assigns the picked store into that job
 * (store.batch_id) alongside creating the ticket — this is literally how a
 * store gets added to a job. Search is intentionally NOT restricted to
 * current job members (a fresh job has none yet); it searches every store,
 * with a warning if the picked one already belongs to a different active job.
 */
export function NewTicketModal({ onClose, assignToBatchId }: { onClose: () => void; assignToBatchId?: string }) {
  const { stores, tickets, workOrderBatches, createTicket, assignStoreToBatch } = useAppData();
  const [query, setQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<StoreWithAssets | null>(null);
  const [issueType, setIssueType] = useState<TicketIssueType>("Camera Failure");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedFor, setJustCreatedFor] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    // Match every word typed, in any order, against "code name" — so
    // "54044", "robinson", "54044 - Robinson Chachoengsao" (the same
    // "code - name" text the list shows) and "chachoengsao 54044" all find
    // the store. Separators like "-" or "·" are ignored.
    const words = query.toLowerCase().split(/[^a-z0-9\u0E00-\u0E7F]+/).filter(Boolean);
    if (words.length === 0) return [];
    return stores
      .filter((s) => {
        const hay = `${s.store_code} ${s.store_name}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [stores, query]);

  // If the picked store already belongs to a different ACTIVE job, flag it —
  // creating the ticket here will move it into this job instead.
  const conflictBatch =
    assignToBatchId && selectedStore?.batch_id && selectedStore.batch_id !== assignToBatchId
      ? workOrderBatches.find((b) => b.id === selectedStore.batch_id && b.status === "Active")
      : null;

  function pickStore(s: StoreWithAssets) {
    setSelectedStore(s);
    setQuery("");
    setError(null);
  }

  function resetForNext() {
    setSelectedStore(null);
    setQuery("");
    setIssueType("Camera Failure");
    setDescription("");
    setJustCreatedFor(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStore) {
      setError("Pick a store from the list first.");
      return;
    }
    if (!issueType) {
      setError("Pick an issue type.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTicket({ store_id: selectedStore.id, issue_type: issueType, description: description || null });
      if (assignToBatchId) await assignStoreToBatch(selectedStore.id, assignToBatchId);
      // Onboarding a batch of stores is the main use case here, so stay open
      // and ready for the next store instead of closing after every single one.
      setJustCreatedFor(selectedStore.store_name);
      setSelectedStore(null);
      setIssueType("Camera Failure");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-surface-dark rounded-card shadow-card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-bold text-ink dark:text-white">Open Work Order</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        {justCreatedFor && (
          <p className="text-xs text-status-healthy font-medium bg-status-healthy/10 border border-status-healthy/30 rounded-md px-3 py-2 mb-3">
            Work order opened for {justCreatedFor}. Pick the next store below, or close this dialog.
          </p>
        )}

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-faint mb-1 block">Store</label>
            {selectedStore ? (
              <div>
                <div className="flex items-center justify-between text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2">
                  <div>
                    <div className="font-medium text-ink dark:text-white">{selectedStore.store_name}</div>
                    <div className="font-mono text-[11px] text-ink-faint">{selectedStore.store_code}</div>
                  </div>
                  <button type="button" onClick={() => setSelectedStore(null)} className="text-xs text-brand font-medium shrink-0">
                    Change
                  </button>
                </div>
                {conflictBatch && (
                  <p className="text-[11px] text-status-partial mt-1.5">
                    Currently in &quot;{conflictBatch.name}&quot; — opening this ticket will move it into this job instead.
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search store name / store code"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
                />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-md shadow-card max-h-56 overflow-y-auto">
                    {matches.map((s) => {
                      const alreadyOpen = needsRepair(s, tickets);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => pickStore(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted dark:hover:bg-white/5 flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-mono text-[11px] text-ink-faint">{s.store_code}</span>{" "}
                            <span className="text-ink dark:text-white">{s.store_name}</span>
                          </span>
                          {alreadyOpen && <span className="text-[10px] text-status-partial shrink-0">already open</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {query.trim() && matches.length === 0 && <p className="text-xs text-ink-faint mt-1.5">No store matches &quot;{query}&quot;. Try just the store code, e.g. 54044.</p>}
                {matches.length > 0 && <p className="text-[11px] text-ink-faint mt-1.5">Click a store in the list to select it.</p>}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-ink-faint mb-1 block">Issue Type</label>
            <Select value={issueType} onChange={(v) => setIssueType(v as TicketIssueType)} options={TICKET_ISSUE_TYPES} placeholder="— Pick an issue type —" variant="full" />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-faint mb-1 block">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What's wrong, and any context worth logging"
              className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs font-medium text-ink-soft dark:text-white/60 px-3 py-1.5">
              Done
            </button>
            <button
              type="submit"
              disabled={saving || !selectedStore || !issueType}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Open Work Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
