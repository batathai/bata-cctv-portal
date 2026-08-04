"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Wifi, UserCheck2, Wrench, History, Ticket as TicketIcon, GitBranch } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { RecoveryStatusBadge, RecoveryStageBadge } from "@/components/recovery/RecoveryBadges";
import { StageTimeline } from "@/components/recovery/StageTimeline";
import { TicketsCard } from "@/components/assets/TicketsCard";
import { IvmsLookup } from "@/components/recovery/IvmsLookup";
import { getAreaLabel, getCause, getRequiredAction, deriveRecoveryStatus, getRecoveryRegion, getLatestQuotation } from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";

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
  const { stores, vendorQuotations, recoveryStageHistory, loading, role } = useAppData();

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

  const quotation = getLatestQuotation(store.id, vendorQuotations);
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
        <SectionTitle icon={GitBranch}>ใบงานซ่อม (Work Order Progress)</SectionTitle>
        <StageTimeline store={store} history={recoveryStageHistory} canEdit={canLogMaintenance(role)} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={MapPin}>Location</SectionTitle>
          <Row label="Region" value={getRecoveryRegion(store.zone)} />
          <Row label="Area" value={getAreaLabel(store.zone)} />
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Wifi}>Device Status</SectionTitle>
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-ink-faint">Status</span>
            <StatusBadge status={store.overall_status} />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Wrench}>Recovery Info</SectionTitle>
          <Row label="Cause" value={getCause(store) ?? "—"} />
          <Row label="Required Action" value={getRequiredAction(store) ?? "—"} />
          <Row label="Repair Date" value={store.repair_date ?? "—"} />
        </Card>

        {/* Sprint 2 Task 3: Vendor Information — UI + DB structure only, no approval workflow yet. */}
        <Card className="p-5">
          <SectionTitle icon={UserCheck2}>Vendor Information</SectionTitle>
          <Row label="Vendor Name" value={quotation?.vendor_name ?? store.supplierName ?? "—"} />
          <Row label="Quotation Number" value={quotation?.quotation_number ?? "—"} />
          <Row
            label="Estimated Cost"
            value={quotation?.estimated_cost != null ? `฿${quotation.estimated_cost.toLocaleString()}` : "—"}
          />
          <Row label="Quotation Date" value={quotation?.quotation_date ?? "—"} />
          <Row label="Approval Status" value={quotation?.approval_status ?? "—"} />
        </Card>
      </div>

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
