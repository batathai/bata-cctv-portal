import { Clock, Wrench, CheckCircle2 } from "lucide-react";
import type { RepairStatus } from "@/types/database";

const CONFIG: Record<RepairStatus, { color: string; bg: string; icon: any }> = {
  Pending: { color: "text-status-offline", bg: "bg-status-offline/10 border-status-offline/30", icon: Clock },
  "In Progress": { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: Wrench },
  Completed: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: CheckCircle2 },
};

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  const c = CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {status}
    </span>
  );
}
