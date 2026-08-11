import { ShieldCheck, AlertTriangle, WifiOff, HelpCircle } from "lucide-react";
import type { OverallStatus } from "@/types/database";

const CONFIG: Record<OverallStatus, { color: string; bg: string; icon: any; label: string }> = {
  Healthy: { color: "text-status-healthy", bg: "bg-status-healthy/10 border-status-healthy/30", icon: ShieldCheck, label: "Online" },
  Partial: { color: "text-status-partial", bg: "bg-status-partial/10 border-status-partial/30", icon: AlertTriangle, label: "Partial" },
  Offline: { color: "text-status-offline", bg: "bg-status-offline/10 border-status-offline/30", icon: WifiOff, label: "Offline" },
  Unknown: { color: "text-status-unknown", bg: "bg-status-unknown/10 border-status-unknown/30", icon: HelpCircle, label: "Unknown" },
};

// The rest of the app (reports, exports, anywhere else) should call this
// instead of re-typing "Healthy" -> "Online" itself — CONFIG above is the
// one place that mapping is defined.
export function getStatusLabel(status: OverallStatus): string {
  return CONFIG[status]?.label ?? status;
}

export function StatusBadge({ status }: { status: OverallStatus }) {
  // Defensive fallback: renders Unknown instead of crashing if `status` is
  // ever something CONFIG doesn't recognize — e.g. a store still carrying
  // the retired "View Only" value because migration 015 (which reclassifies
  // it to "Partial") hasn't been run against the live database yet. Without
  // this, CONFIG[status] is undefined and the whole page throws a client-side
  // exception the moment it tries to render that one store's badge.
  const c = CONFIG[status] ?? CONFIG.Unknown;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.color} ${c.bg}`}>
      <Icon size={12} /> {c.label}
    </span>
  );
}
