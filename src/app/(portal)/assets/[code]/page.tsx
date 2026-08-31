"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Camera, Pencil, Ticket as TicketIcon, Fingerprint } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { EditableStatusBadge } from "@/components/ui/EditableStatusBadge";
import { EditAssetModal } from "@/components/assets/EditAssetModal";
import { TicketsCard } from "@/components/assets/TicketsCard";
import { DeviceIdentityCard } from "@/components/assets/DeviceIdentityCard";
import { getAreaLabel, getRecoveryRegion } from "@/lib/recovery";
import { canManageMasterData, canLogMaintenance } from "@/lib/rbac";

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
  const { stores, loading, role } = useAppData();
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
            <div className="text-xs text-ink-soft dark:text-white/60 mt-1">
              Region: {getRecoveryRegion(store.zone)} &middot; Area: {getAreaLabel(store.zone)}
            </div>
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

      <Card className="p-5">
        <SectionTitle icon={Camera}>Cameras</SectionTitle>
        <Row label="Total" value={store.asset?.camera_total} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={TicketIcon}>Repair Tickets</SectionTitle>
        <TicketsCard store={store} canEdit={canLogWork} />
      </Card>
    </div>
  );
}
