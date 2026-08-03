import { CheckCircle2, Camera, Server, UserX, Clock, FileCheck2, Wrench, PackageSearch, BadgeCheck } from "lucide-react";
import type { RecoveryStatus, RecoveryStage } from "@/types/database";

const STATUS_CONFIG: Record<RecoveryStatus, { color: string; bg: string; icon: any }> = {
  Normal: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: CheckCircle2 },
  "Camera Issue": { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: Camera },
  "DVR Failure": { color: "text-status-offline", bg: "bg-status-offline/10 border-status-offline/30", icon: Server },
  "Device Not Registered": { color: "text-status-unknown", bg: "bg-status-unknown/10 border-status-unknown/30", icon: UserX },
};

export function RecoveryStatusBadge({ status }: { status: RecoveryStatus }) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {status}
    </span>
  );
}

const STAGE_CONFIG: Record<RecoveryStage, { color: string; bg: string; icon: any }> = {
  "Waiting Vendor Quote": { color: "text-status-unknown", bg: "bg-status-unknown/10 border-status-unknown/30", icon: Clock },
  "Waiting Approval": { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: FileCheck2 },
  "Waiting Repair": { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: PackageSearch },
  Repairing: { color: "text-brand", bg: "bg-brand-50 border-brand/30", icon: Wrench },
  Completed: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: CheckCircle2 },
  Verified: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: BadgeCheck },
};

export function RecoveryStageBadge({ stage }: { stage: RecoveryStage }) {
  const c = STAGE_CONFIG[stage];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {stage}
    </span>
  );
}
