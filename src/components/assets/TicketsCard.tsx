"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Loader2, AlertCircle, Clock, UserCheck, Wrench, PackageSearch, CheckCircle2, Lock } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import { TICKET_ISSUE_TYPES, TICKET_STATUSES, ticketsForStore } from "@/lib/tickets";
import type { StoreWithAssets, TicketIssueType, TicketStatus } from "@/types/database";

const STATUS_CONFIG: Record<TicketStatus, { color: string; bg: string; icon: any }> = {
  Open: { color: "text-status-unknown", bg: "bg-status-unknown/10 border-status-unknown/30", icon: Clock },
  Assigned: { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: UserCheck },
  "In Progress": { color: "text-brand", bg: "bg-brand-50 border-brand/30", icon: Wrench },
  "Waiting Parts": { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: PackageSearch },
  Completed: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: CheckCircle2 },
  Closed: { color: "text-ink-faint", bg: "bg-black/5 border-black/10 dark:bg-white/5 dark:border-white/10", icon: Lock },
};

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {status}
    </span>
  );
}

export function TicketsCard({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { tickets, createTicket, updateTicketStatus } = useAppData();
  const storeTickets = ticketsForStore(store.id, tickets);

  const [showForm, setShowForm] = useState(false);
  const [issueType, setIssueType] = useState<TicketIssueType>("Camera Failure");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Device Status's wrench links here with ?newTicket=<issue type>&note=<text>:
  // open the form pre-filled. Nothing is saved until the user presses Create.
  const searchParams = useSearchParams();
  useEffect(() => {
    const preset = searchParams.get("newTicket");
    if (!canEdit || !preset || !TICKET_ISSUE_TYPES.includes(preset as TicketIssueType)) return;
    setIssueType(preset as TicketIssueType);
    setDescription(searchParams.get("note") ?? "");
    setShowForm(true);
    // The #tickets jump happens before this card renders, so scroll here.
    window.setTimeout(() => document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [searchParams, canEdit]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createTicket({ store_id: store.id, issue_type: issueType, description: description || null });
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
        >
          <Plus size={13} /> New Ticket
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface-muted dark:bg-white/5 rounded-md p-3 space-y-2">
          <Select value={issueType} onChange={(v) => setIssueType(v as TicketIssueType)} options={TICKET_ISSUE_TYPES} placeholder="Issue Type" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
          />
          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs font-medium text-ink-soft dark:text-white/60 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Create Ticket
            </button>
          </div>
        </form>
      )}

      {storeTickets.length === 0 ? (
        <p className="text-sm text-ink-faint">No tickets for this store.</p>
      ) : (
        <div className="space-y-2">
          {storeTickets.map((t) => (
            <div key={t.id} className="bg-surface-muted dark:bg-white/5 rounded-md p-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-brand font-medium">{t.issue_type ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-faint">{t.opened_at}</span>
                  {canEdit ? (
                    <select
                      value={t.status}
                      onChange={(e) => updateTicketStatus(t.id, e.target.value as TicketStatus)}
                      className="text-xs rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-surface-dark px-2 py-1 outline-none focus:border-brand"
                    >
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <TicketStatusBadge status={t.status} />
                  )}
                </div>
              </div>
              {t.description && <div className="text-xs text-ink-soft dark:text-white/60 mt-1">{t.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
