"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Server, Camera, HardDrive, Wifi, Router, Wrench, ShieldCheck, MapPin, Pencil, Paperclip, Ticket as TicketIcon, Fingerprint,
} from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { RecoveryStatusBadge } from "@/components/recovery/RecoveryBadges";
import { EditAssetModal } from "@/components/assets/EditAssetModal";
import { AttachmentsCard } from "@/components/assets/AttachmentsCard";
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

/** Thin horizontal bar showing a health-score component's point contribution — no chart library, just the breakdown. */
function ScoreBar({ label, points, max, met }: { label: string; points: number; max: number; met: boolean }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-ink-faint">{label}</span>
        <span className={met ? "text-status-healthy font-medium" : "text-status-offline font-medium"}>
          {met ? points : 0}/{max}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: met ? "100%" : "0%", background: met ? "#1E9E5A" : "#D71920" }}
        />
      </div>
    </div>
  );
}

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

  const cameraOk = store.asset?.camera_status ? store.asset.camera_status === "OK" : store.asset?.camera_failed === 0;

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
          <StatusBadge status={store.overall_status} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={ShieldCheck}>Health Score — {store.healthScore}</SectionTitle>
          <ScoreBar label="NVR Online" points={30} max={30} met={!!store.asset?.nvr_online} />
          <ScoreBar label="Playback Working" points={30} max={30} met={store.asset?.playback_status === "Working"} />
          <ScoreBar label="HDD Healthy" points={20} max={20} met={store.asset?.hdd_status === "Healthy"} />
          <ScoreBar label="Camera Complete" points={20} max={20} met={!!cameraOk} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Server}>NVR</SectionTitle>
          <Row label="Brand / Model" value={`${store.asset?.nvr_brand ?? ""} ${store.asset?.nvr_model ?? ""}`} />
          <Row label="Serial" value={<span className="font-mono text-xs">{store.asset?.nvr_serial}</span>} />
          <Row label="Firmware" value={<span className="font-mono text-xs">{store.asset?.nvr_firmware}</span>} />
          <Row label="MAC" value={<span className="font-mono text-xs">{store.asset?.nvr_mac}</span>} />
          <Row label="Install Date" value={store.asset?.nvr_install_date} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Camera}>Cameras</SectionTitle>
          <Row label="Total" value={store.asset?.camera_total} />
          <Row label="Working" value={store.asset?.camera_working} />
          <Row label="Failed" value={store.asset?.camera_failed} />
          {store.asset?.camera_status && <Row label="Status" value={store.asset.camera_status} />}
        </Card>

        <Card className="p-5">
          <SectionTitle icon={HardDrive}>Storage</SectionTitle>
          <Row label="Capacity" value={store.asset?.hdd_capacity} />
          <Row label="Status" value={store.asset?.hdd_status} />
          <Row label="Install Date" value={store.asset?.hdd_install_date} />
          <Row label="Playback" value={store.asset?.playback_status} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Wifi}>Network</SectionTitle>
          <Row label="ISP" value={store.asset?.isp} />
          <Row label="Router" value={store.asset?.router_model} />
          <Row label="Internet Type" value={store.asset?.internet_type} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Router}>Hik-Connect</SectionTitle>
          <Row label="Device Name" value={<span className="font-mono text-xs">{store.hikconnect?.device_name}</span>} />
          <Row label="Status" value={store.hikconnect?.hikconnect_status} />
          <Row label="Owner Account" value={store.hikconnect?.owner_account} />
          <Row label="Shared Accounts" value={store.hikconnect?.shared_accounts.length} />
          <Row label="Last Verified" value={store.hikconnect?.last_verified_date} />
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle icon={Paperclip}>Documents &amp; Photos</SectionTitle>
        <AttachmentsCard store={store} canEdit={canLogWork} />
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
