"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { HDD_CAPACITIES, HDD_RETENTION_DAYS, getRecoveryRegion, getAreaLabel } from "@/lib/recovery";
import { OPEN_TICKET_STATUSES, ticketsForStore } from "@/lib/tickets";
import { PARTIAL_REASONS, OFFLINE_REASONS, type PartialReason, type OfflineReason } from "@/types/database";
import type { OverallStatus } from "@/types/database";

const OVERALL_OPTIONS: { value: OverallStatus; label: string }[] = [
  { value: "Healthy", label: "Online" },
  { value: "Partial", label: "Partial" },
  { value: "Offline", label: "Offline" },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-faint mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand";

/** Preset options + the field's current value, so switching to a dropdown never hides/loses existing data that isn't in the preset list. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

export const runtime = "edge";
export default function SurveyChecklistPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { stores, audits, tickets, loading, submitSurvey, createTicket } = useAppData();

  const store = stores.find((s) => s.store_code === code);

  // Most recent PRIOR survey for this store — used both to seed the form
  // below (so re-opening a store's checklist shows what was last found,
  // instead of resetting to hardcoded defaults every time — that read as
  // "my answer didn't save" even though it did) and, further down, to
  // decide whether a wrong date this visit is the first sighting or a
  // repeat (see priorDateWasWrong).
  const previousAudit = useMemo(() => {
    if (!store) return null;
    const forStore = audits.filter((a) => a.store_id === store.id);
    if (forStore.length === 0) return null;
    return [...forStore].sort((a, b) => (a.audit_date < b.audit_date ? 1 : -1))[0];
  }, [audits, store]);

  // Fields with a live Asset Register counterpart seed from THAT (the
  // actual current record, kept up to date by every past survey) rather
  // than the audit log, so they always reflect the true current state.
  const [nvrOnline, setNvrOnline] = useState<"Yes" | "No">(() => (store?.asset ? (store.asset.nvr_online ? "Yes" : "No") : "Yes"));
  const [cameraWorking, setCameraWorking] = useState(store?.asset?.camera_working ?? store?.asset?.camera_total ?? 0);
  const [hddCapacity, setHddCapacity] = useState(store?.asset?.hdd_capacity ?? "");
  const [hddStatus, setHddStatus] = useState<"Healthy" | "Warning" | "Failed">(() => store?.asset?.hdd_status ?? "Healthy");
  const [playbackResult, setPlaybackResult] = useState<"Working" | "Not Working">(() => store?.asset?.playback_status ?? "Working");
  // Simple Yes/No against the HDD reference table, rather than asking the
  // surveyor to bisect for the exact cutoff day (tedious in the field,
  // especially early on) — see conversation: jump straight to "N days ago"
  // (N from HDD_RETENTION_DAYS) and just confirm footage is there or not.
  // No live Asset Register field backs this, so it seeds from the last
  // survey's answer instead (retention_days_seen is only ever non-null when
  // that survey answered "Yes" — see the submit handler below).
  const [retentionOk, setRetentionOk] = useState<"Yes" | "No" | "">(() =>
    !previousAudit ? "" : previousAudit.retention_days_seen != null ? "Yes" : "No"
  );
  const [hikconnectResult, setHikconnectResult] = useState<"Working" | "Not Working">(() =>
    store?.hikconnect?.hikconnect_status === "Offline" ? "Not Working" : "Working"
  );
  // A dead clock/CMOS battery makes the DVR's date drift back to wrong on
  // every reboot — correcting it in software alone won't hold. So a single
  // "wrong" sighting just gets corrected on the spot (see the ticket-open
  // logic below); it only opens a repair ticket once it's found wrong on
  // two consecutive surveys, confirming the correction didn't hold.
  const [dateCorrect, setDateCorrect] = useState<"Yes" | "No">("Yes");
  const [overallStatus, setOverallStatus] = useState<"Healthy" | "Partial" | "Offline" | "">("");
  const [partialReason, setPartialReason] = useState<PartialReason | "">("");
  const [offlineReason, setOfflineReason] = useState<OfflineReason | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ticketOpened, setTicketOpened] = useState(false);

  const cameraTotal = store?.asset?.camera_total ?? 0;
  const cameraStatus = cameraWorking <= 0 ? "Not Work" : cameraWorking >= cameraTotal && cameraTotal > 0 ? "OK" : "Partial";

  // Suggested result from what's been answered so far — mirrors
  // deriveOverallStatusFromAsset's logic (src/lib/recovery.ts) but only as a
  // starting point: the surveyor still has to confirm/pick it themselves
  // below, same as EditableStatusBadge everywhere else in the app. Never
  // written anywhere on its own.
  const suggested: OverallStatus = useMemo(() => {
    if (nvrOnline === "No") return "Offline";
    if (cameraStatus !== "OK") return "Partial";
    if (playbackResult !== "Working" || hddStatus !== "Healthy") return "Partial";
    return "Healthy";
  }, [nvrOnline, cameraStatus, playbackResult, hddStatus]);

  const effectiveOverall = overallStatus || suggested;

  // Whether the most recent PRIOR survey also found the date wrong decides
  // whether this visit is the "first sighting, just correct it" case or the
  // "already flagged once, correction didn't hold" case.
  const priorDateWasWrong = previousAudit?.date_correct === false;
  const hasOpenClockTicket = useMemo(
    () => (store ? ticketsForStore(store.id, tickets).some((t) => t.issue_type === "Clock Battery Failure" && OPEN_TICKET_STATUSES.includes(t.status)) : false),
    [store, tickets]
  );
  const willOpenClockTicket = dateCorrect === "No" && priorDateWasWrong && !hasOpenClockTicket;

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;
  if (!store) {
    return (
      <div className="text-sm text-ink-faint">
        Store <span className="font-mono">{code}</span> not found.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (effectiveOverall === "Partial" && !partialReason) {
      setError("Pick a reason for Partial.");
      return;
    }
    if (effectiveOverall === "Offline" && !offlineReason) {
      setError("Pick a reason for Offline.");
      return;
    }
    setSaving(true);
    try {
      // Yes = confirms footage reaches the HDD reference days; No = doesn't
      // (or unanswered) — either way this is just a log entry, not the
      // exact cutoff day, per the simplified Yes/No check above.
      const retentionDaysSeen = retentionOk === "Yes" && hddCapacity ? HDD_RETENTION_DAYS[hddCapacity] ?? null : null;

      await submitSurvey(
        {
          nvr_online: nvrOnline === "Yes",
          camera_working: cameraWorking,
          camera_failed: Math.max(cameraTotal - cameraWorking, 0),
          camera_status: cameraStatus,
          playback_status: playbackResult,
          hdd_status: hddStatus,
          hdd_capacity: hddCapacity || null,
        },
        {
          store_id: store!.id,
          auditor: null,
          overall_status: effectiveOverall,
          playback_result: playbackResult,
          hdd_result: hddStatus,
          camera_result: cameraStatus,
          hikconnect_result: hikconnectResult,
          partial_reason: effectiveOverall === "Partial" ? (partialReason as PartialReason) : null,
          offline_reason: effectiveOverall === "Offline" ? (offlineReason as OfflineReason) : null,
          retention_days_seen: retentionDaysSeen,
          date_correct: dateCorrect === "Yes",
          notes: notes || null,
        }
      );

      if (willOpenClockTicket) {
        await createTicket({
          store_id: store!.id,
          issue_type: "Clock Battery Failure",
          description: "DVR date/time found wrong on two consecutive surveys — correcting it in software didn't hold. Likely a dead clock/CMOS battery; needs a technician to replace it.",
        });
        setTicketOpened(true);
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save survey.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <ClipboardCheck size={28} className="mx-auto text-status-healthy mb-2" />
          <div className="font-display text-lg font-bold text-ink dark:text-white">Saved</div>
          <p className="text-sm text-ink-faint mt-1">
            {store.store_code} — {store.store_name} is now marked <StatusBadge status={effectiveOverall} /> in Asset Register.
          </p>
          {ticketOpened && (
            <p className="text-xs text-brand mt-2">+ Opened a Clock Battery Failure repair ticket (date wrong two visits in a row).</p>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => router.push("/survey")}
              className="text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5"
            >
              Back to Survey list
            </button>
            <button
              onClick={() => {
                setDone(false);
                setTicketOpened(false);
              }}
              className="text-xs font-medium bg-brand text-white rounded-md px-3 py-2 hover:bg-brand-dark"
            >
              Survey another
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand">
        <ArrowLeft size={15} /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="font-display text-lg font-bold text-ink dark:text-white">{store.store_name}</div>
            <div className="font-mono text-xs text-ink-faint">{store.store_code} &middot; {store.province}</div>
            <div className="text-xs text-ink-soft dark:text-white/60 mt-1">
              Region: {getRecoveryRegion(store.zone)} &middot; Area: {getAreaLabel(store.zone)}
            </div>
          </div>
          <StatusBadge status={store.overall_status} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={ClipboardCheck}>Checklist</SectionTitle>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="DVR/NVR online?">
              <Select value={nvrOnline} onChange={(v) => setNvrOnline(v as "Yes" | "No")} options={["Yes", "No"]} placeholder="Online?" variant="full" />
            </Field>
            <Field label={`Cameras working (of ${cameraTotal})`}>
              <input
                type="number"
                min={0}
                max={cameraTotal || undefined}
                value={cameraWorking}
                onChange={(e) => setCameraWorking(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Playback — can you see footage?">
              <Select
                value={playbackResult}
                onChange={(v) => setPlaybackResult(v as "Working" | "Not Working")}
                options={["Working", "Not Working"]}
                placeholder="Playback"
                variant="full"
              />
            </Field>
            <Field label="HDD capacity">
              <Select
                value={hddCapacity}
                onChange={setHddCapacity}
                options={withCurrent(HDD_CAPACITIES, hddCapacity)}
                optionLabel={(v) => (HDD_RETENTION_DAYS[v] ? `${v} (≈ ${HDD_RETENTION_DAYS[v]} days)` : v)}
                placeholder="HDD Capacity"
                variant="full"
              />
            </Field>
            <Field
              label={hddCapacity && HDD_RETENTION_DAYS[hddCapacity] ? `Footage from ~${HDD_RETENTION_DAYS[hddCapacity]} days ago?` : "Footage from expected days ago?"}
              hint="Jump playback to that date instead of hunting for the exact cutoff."
            >
              <Select value={retentionOk} onChange={(v) => setRetentionOk(v as "Yes" | "No")} options={["Yes", "No"]} placeholder="Seen?" variant="full" />
            </Field>
            <Field label="HDD status">
              <Select value={hddStatus} onChange={(v) => setHddStatus(v as "Healthy" | "Warning" | "Failed")} options={["Healthy", "Warning", "Failed"]} placeholder="HDD status" variant="full" />
            </Field>
            <Field label="Hik-Connect / live view">
              <Select
                value={hikconnectResult}
                onChange={(v) => setHikconnectResult(v as "Working" | "Not Working")}
                options={["Working", "Not Working"]}
                placeholder="Hik-Connect"
                variant="full"
              />
            </Field>
            <Field
              label="DVR date/time correct?"
              hint={
                priorDateWasWrong
                  ? "Also wrong last visit — if still wrong, a repair ticket opens automatically for the clock battery."
                  : "If wrong, just correct it now — it only becomes a ticket if it's wrong again next visit."
              }
            >
              <Select value={dateCorrect} onChange={(v) => setDateCorrect(v as "Yes" | "No")} options={["Yes", "No"]} placeholder="Date correct?" variant="full" />
            </Field>
          </div>

          {willOpenClockTicket && (
            <p className="text-xs text-brand bg-brand-50 dark:bg-brand/10 border border-brand/20 rounded-md px-3 py-2">
              Wrong on two visits in a row — saving this will open a Clock Battery Failure repair ticket.
            </p>
          )}

          <div className="border-t border-black/5 dark:border-white/10 pt-4">
            <Field label="Result" hint="Suggested from the answers above — confirm or override.">
              <Select
                value={overallStatus || suggested}
                onChange={(v) => setOverallStatus(v as "Healthy" | "Partial" | "Offline")}
                options={OVERALL_OPTIONS.map((o) => o.value)}
                optionLabel={(v) => OVERALL_OPTIONS.find((o) => o.value === v)?.label ?? v}
                placeholder="Result"
                variant="full"
              />
            </Field>

            {effectiveOverall === "Partial" && (
              <div className="mt-3">
                <Field label="Reason">
                  <Select value={partialReason} onChange={(v) => setPartialReason(v as PartialReason)} options={[...PARTIAL_REASONS]} placeholder="Why Partial?" variant="full" />
                </Field>
              </div>
            )}
            {effectiveOverall === "Offline" && (
              <div className="mt-3">
                <Field label="Reason">
                  <Select value={offlineReason} onChange={(v) => setOfflineReason(v as OfflineReason)} options={[...OFFLINE_REASONS]} placeholder="Why Offline?" variant="full" />
                </Field>
              </div>
            )}
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} placeholder="Anything else worth noting…" />
          </Field>

          {error && <p className="text-xs text-brand">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save Survey
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
