"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Camera, Wrench, MapPin, Pencil, Ticket as TicketIcon, Fingerprint } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EditableStatusBadge } from "@/components/ui/EditableStatusBadge";
import { RecoveryStatusBadge } from "@/components/recovery/RecoveryBadges";
import { EditAssetModal } from "@/components/assets/EditAssetModal";
import { TicketsCard } from "@/components/assets/TicketsCard";
import { DeviceIdentityCard } from "@/components/assets/DeviceIdentityCard";
import { getAreaLabel, getCause, getRequiredAction, RECOVERY_STAGES, deriveRecoveryStatus, getRecoveryRegion } from "@/lib/recovery";
import { IvmsLookup } from "@/components/recovery/IvmsLookup";
import { canManageMasterData, canLogMaintenance } from "@/lib/rbac";
import type { RecoveryStage } from "@/types/database";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-black/5 dark:border-white/5 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink dark:text-white">{value}</span>
    </div>
  );
}

export const runtime = 'edge';
export default function StoreDetailPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { stores, maintenance, loading, role, updateRecoveryStage } = useAppData();
  const [editing, setEditing] = useState(false);

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;

  const store = stores.find((s) => s.store_code === code);
  if (!store) {
    return (
      <div className="text-sm text-ink-faint">
        Store <span className="font-mono">{code}</span> not found or not visible for your role.
      </div>
    );
  }

  const records = maintenance.filter((r) => r.store_id === store.id);
  const canEditMaster = canManageMasterData(role);
  const canLogWork = canLogMaintenance(role);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand">
          <ArrowLeft size={15} /> Back
        </button>
        {canEditMaster && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
          >
            <Pencil size={13} /> Edit Detail
          </button>
        )}
      </div>

      {editing && <EditAssetModal store={store} onClose={() => setEditing(false)} />}

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="font-display text-lg font-bold text-ink dark:text-white">{store.store_name}</div>
            <div className="font-mono text-xs text-ink-faint">{store.store_code} &middot; {store.province}</div>
            {store.store_group && (
              <div className="text-xs text-ink-soft dark:text-white/60 mt-1">Group: {store.store_group}</div>
            )}
            {store.address && (
              <div className="text-xs text-ink-soft dark:text-white/60 mt-1 max-w-md">{store.address}</div>
            )}
            {store.phone && (
              <div className="text-xs text-ink-soft dark:text-white/60 mt-1">Tel: {store.phone}</div>
            )}
          </div>
          <EditableStatusBadge storeId={store.id} status={store.overall_status} canEdit={canEditMaster} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Fingerprint}>Device Identity</SectionTitle>
        <DeviceIdentityCard store={store} canEdit={canEditMaster} />
      </Card>


      {store.is_recovery50 && (
        <Card className="p-5">
          <SectionTitle icon={MapPin}>Recovery Tracking</SectionTitle>
          <Row label="Region" value={getRecoveryRegion(store.zone)} />
          <Row label="Area" value={getAreaLabel(store.zone)} />
          <Row label="Cause" value={getCause(store) ?? "—"} />
          <Row label="Required Action" value={getRequiredAction(store) ?? "—"} />
          <Row label="Vendor" value={store.supplierName} />
          <Row label="Recovery Status" value={<RecoveryStatusBadge status={deriveRecoveryStatus(store)} />} />
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-ink-faint">Recovery Stage</span>
            {canEditMaster ? (
              <select
                value={store.recovery_stage ?? (deriveRecoveryStatus(store) === "Normal" ? "Verified" : "Waiting Vendor Quote")}
                onChange={(e) => updateRecoveryStage(store.id, e.target.value as RecoveryStage)}
                className="text-xs rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 px-2 py-1 outline-none focus:border-brand"
              >
                {RECOVERY_STAGES.map((stg) => (
                  <option key={stg} value={stg}>
                    {stg}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-ink dark:text-white">{store.recovery_stage ?? "—"}</span>
            )}
          </div>
          <div className="mt-3">
            <IvmsLookup store={store} />
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle icon={Camera}>Cameras</SectionTitle>
        <Row label="Total" value={store.asset?.camera_total} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={TicketIcon}>Repair Tickets</SectionTitle>
        <TicketsCard store={store} canEdit={canLogWork} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Wrench}>Maintenance Timeline ({records.length})</SectionTitle>
        {records.length === 0 && <p className="text-sm text-ink-faint">No repair records for this store.</p>}
        <div className="relative pl-4 space-y-4 mt-2">
          {records.length > 0 && (
            <div className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-black/10 dark:bg-white/10" />
          )}
          {records.map((r) => (
            <div key={r.id} className="relative">
              <span className="absolute -left-4 top-1 w-[7px] h-[7px] rounded-full bg-brand" />
              <div className="bg-surface-muted dark:bg-white/5 rounded-md p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand font-medium">{r.problem}</span>
                  <span className="font-mono text-xs text-ink-faint">{r.issue_date}</span>
                </div>
                <div className="text-xs text-ink-soft dark:text-white/60 mt-1">
                  {r.resolution} &middot; ฿{r.cost.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
