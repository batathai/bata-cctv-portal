"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Wifi, Wrench, History, Ticket as TicketIcon, GitBranch, Pencil, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { RecoveryStatusBadge, RecoveryStageBadge } from "@/components/recovery/RecoveryBadges";
import { StageTimeline } from "@/components/recovery/StageTimeline";
import { TicketsCard } from "@/components/assets/TicketsCard";
import { IvmsLookup } from "@/components/recovery/IvmsLookup";
import { zoneCode, getCause, getRequiredAction, deriveRecoveryStatus, getRecoveryRegion } from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";
import type { StoreWithAssets, OverallStatus } from "@/types/database";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-black/5 dark:border-white/5 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink dark:text-white text-right">{value}</span>
    </div>
  );
}

/**
 * Sprint 2 - Recovery Center: Store Detail page.
 *
 * Separate from /assets/[code] (Asset Register, hq_admin + supplier only,
 * full NVR/HDD/network technical detail) on purpose — this page is scoped to
 * hq_admin + bkk_manager + country_manager (the Recovery Center audience)
 * and shows only what the Retail IT team needs to track a repair, not the
 * full technical asset record.
 */
export const runtime = 'edge';
export default function RecoveryStoreDetailPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { stores, recoveryStageHistory, loading, role } = useAppData();

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;

  const store = stores.find((s) => s.store_code === code);
  if (!store) {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => router.back()} />
        <div className="text-sm text-ink-faint">
          Store <span className="font-mono">{code}</span> not found or not visible for your role.
        </div>
      </div>
    );
  }

  const status = deriveRecoveryStatus(store);
  const stage = store.recovery_stage ?? (status === "Normal" ? "Verified" : "Waiting Vendor Quote");

  return (
    <div className="space-y-4">
      <BackButton onClick={() => router.back()} />

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="font-display text-lg font-bold text-ink dark:text-white">{store.store_name}</div>
            <div className="font-mono text-xs text-ink-faint">{store.store_code}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <RecoveryStatusBadge status={status} />
            <RecoveryStageBadge stage={stage} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={GitBranch}>Work Order Progress</SectionTitle>
        <StageTimeline store={store} history={recoveryStageHistory} canEdit={canLogMaintenance(role)} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={MapPin}>Location</SectionTitle>
          <Row label="Region" value={getRecoveryRegion(store.zone)} />
          <Row label="Area" value={zoneCode(store.zone)} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Wifi}>Device Status</SectionTitle>
          <DeviceStatusRow store={store} canEdit={canLogMaintenance(role)} />
        </Card>
      </div>

      <RecoveryInfoCard store={store} canEdit={canLogMaintenance(role)} />

      <Card className="p-5">
        <SectionTitle icon={TicketIcon}>Repair Tickets</SectionTitle>
        <TicketsCard store={store} canEdit={canLogMaintenance(role)} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={History}>Record</SectionTitle>
        <Row label="Last Updated" value={new Date(store.updated_at).toLocaleString()} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Wifi}>iVMS Live View</SectionTitle>
        <IvmsLookup store={store} />
      </Card>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand">
      <ArrowLeft size={15} /> Back
    </button>
  );
}

/**
 * Recovery Info — was read-only (nothing in the UI ever wrote to
 * Cause/Required Action/Repair Date, only the bulk import script did).
 * Now editable in place, plus a free-text "Details" field
 * (`stores.recovery_notes`, migration 013) for anything that doesn't fit
 * Cause/Required Action. Vendor Information card was removed per request —
 * this card no longer shows vendor/quotation data.
 */
function RecoveryInfoCard({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { editAssetDetails } = useAppData();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState(getCause(store) ?? "");
  const [requiredAction, setRequiredAction] = useState(getRequiredAction(store) ?? "");
  const [repairDate, setRepairDate] = useState(store.repair_date ?? "");
  const [notes, setNotes] = useState(store.recovery_notes ?? "");

  function startEdit() {
    setCause(getCause(store) ?? "");
    setRequiredAction(getRequiredAction(store) ?? "");
    setRepairDate(store.repair_date ?? "");
    setNotes(store.recovery_notes ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await editAssetDetails(store.id, {
        store: {
          cause: cause || null,
          required_action: requiredAction || null,
          repair_date: repairDate || null,
          recovery_notes: notes || null,
        },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Recovery Info.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Wrench}>Recovery Info</SectionTitle>
          {canEdit && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-xs text-ink-soft dark:text-white/60 hover:text-brand"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        <Row label="Cause" value={getCause(store) ?? "—"} />
        <Row label="Required Action" value={getRequiredAction(store) ?? "—"} />
        <Row label="Repair Date" value={store.repair_date ?? "—"} />
        <Row label="Details" value={store.recovery_notes || "—"} />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <SectionTitle icon={Wrench}>Recovery Info</SectionTitle>
      <div className="space-y-3 mt-1">
        <Field label="Cause" value={cause} onChange={setCause} />
        <Field label="Required Action" value={requiredAction} onChange={setRequiredAction} />
        <div>
          <label className="text-xs text-ink-faint block mb-1">Repair Date</label>
          <input
            type="date"
            value={repairDate}
            onChange={(e) => setRepairDate(e.target.value)}
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="text-xs text-ink-faint block mb-1">Details</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="รายละเอียดเพิ่มเติม..."
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
          />
        </div>
        {error && <p className="text-xs text-brand">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-xs font-medium text-ink-soft dark:text-white/60 rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-ink-faint block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand"
      />
    </div>
  );
}

const OVERALL_STATUS_OPTIONS: { value: OverallStatus; label: string }[] = [
  { value: "Healthy", label: "Online" },
  { value: "Partial", label: "Partial" },
  { value: "View Only", label: "View Only" },
  { value: "Offline", label: "Offline" },
  { value: "Unknown", label: "Unknown" },
];

/**
 * Device Status was read-only — once a repair is actually done, there was
 * no way to flip the badge back to Online from this page (it's normally
 * derived from cctv_assets, which this page's audience can't see/edit —
 * see the file header comment). Lets the status be set directly instead,
 * same write path as everything else on this page (editAssetDetails ->
 * updateStoreDetailsDb on `stores.overall_status`).
 */
function DeviceStatusRow({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { editAssetDetails } = useAppData();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<OverallStatus>(store.overall_status);

  async function save(next: OverallStatus) {
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      await editAssetDetails(store.id, { store: { overall_status: next } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex justify-between items-center py-1.5 text-sm">
        <span className="text-ink-faint">Status</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={store.overall_status} />
          {canEdit && (
            <button
              onClick={() => {
                setValue(store.overall_status);
                setError(null);
                setEditing(true);
              }}
              className="flex items-center gap-1 text-xs text-ink-soft dark:text-white/60 hover:text-brand"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="py-1.5 space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-ink-faint">Status</span>
        <div className="flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => save(e.target.value as OverallStatus)}
            disabled={saving}
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
        </div>
      </div>
      {error && <p className="text-xs text-brand text-right">{error}</p>}
    </div>
  );
}
