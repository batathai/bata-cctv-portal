import { ShieldCheck, AlertTriangle, WifiOff, HelpCircle } from "lucide-react";
import type { OverallStatus } from "@/types/database";

const CONFIG: Record<OverallStatus, { color: string; bg: string; icon: any; label: string }> = {
  Healthy: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: ShieldCheck, label: "Online" },
  Partial: { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: AlertTriangle, label: "Partial" },
  Offline: { color: "text-status-offline", bg: "bg-status-offline/10 border-status-offline/30", icon: WifiOff, label: "Offline" },
  Unknown: { color: "text-status-unknown", bg: "bg-status-unknown/10 border-status-unknown/30", icon: HelpCircle, label: "Unknown" },
};

export function StatusBadge({ status }: { status: OverallStatus }) {
  const c = CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {c.label}
    </span>
  );
}
