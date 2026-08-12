"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, WifiOff, Radio, FileText } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { getLatestRemark } from "@/lib/recovery";

/**
 * Lightweight status view: just the stores, and whether each one is
 * Online/Offline right now. Deliberately leaves out Health Score, cost,
 * NVR/HDD technical detail, and repair history — those stay on the full
 * Dashboard / Asset Register.
 */
export default function DeviceStatusPage() {
  const { stores, recoveryStageHistory, loading } = useAppData();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filtered = useMemo(
    () =>
      stores
        .filter((s) => (s.store_name + s.store_code).toLowerCase().includes(q.toLowerCase()))
        .filter((s) => !statusFilter || s.overall_status === statusFilter),
    [stores, q, statusFilter]
  );

  const counts = useMemo(() => {
    const c = { Healthy: 0, Partial: 0, Offline: 0, Unknown: 0 } as Record<string, number>;
    stores.forEach((s) => (c[s.overall_status] = (c[s.overall_status] ?? 0) + 1));
    return c;
  }, [stores]);

  const offlineCount = counts.Offline ?? 0;

  if (loading) return <div className="text-sm text-ink-faint">Loading device status…</div>;

  return (
    <div className="space-y-4">
      {offlineCount > 0 && (
        <div className="flex items-center gap-2 bg-status-offline/10 border border-status-offline/30 text-status-offline text-sm font-medium rounded-md px-4 py-3">
          <WifiOff size={16} />
          {offlineCount} store(s) in your area are currently offline
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <StatCard label="Total Stores" value={stores.length} onClick={() => setStatusFilter("")} active={statusFilter === ""} />
        <StatCard label="Online" value={counts.Healthy ?? 0} colorClass="text-status-healthy" onClick={() => setStatusFilter("Healthy")} active={statusFilter === "Healthy"} />
        <StatCard label="Partial" value={counts.Partial ?? 0} colorClass="text-status-partial" onClick={() => setStatusFilter("Partial")} active={statusFilter === "Partial"} />
        <StatCard label="Offline" value={offlineCount} colorClass="text-status-offline" onClick={() => setStatusFilter("Offline")} active={statusFilter === "Offline"} />
        <StatCard label="Unknown" value={counts.Unknown ?? 0} colorClass="text-status-unknown" onClick={() => setStatusFilter("Unknown")} active={statusFilter === "Unknown"} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <SectionTitle icon={Radio}>Device Status by Store ({filtered.length})</SectionTitle>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store / store code"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/5">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink dark:text-white truncate">{s.store_name}</div>
                <div className="font-mono text-[11px] text-ink-faint">{s.store_code} &middot; {s.province}</div>
                {(() => {
                  const remark = getLatestRemark(s, recoveryStageHistory);
                  return remark ? (
                    <div className="text-[11px] text-status-partial mt-0.5 truncate" title={remark}>
                      Remark: {remark}
                    </div>
                  ) : null;
                })()}
              </div>
              <StatusBadge status={s.overall_status} />
              <Link
                href={`/recovery/${s.store_code}`}
                className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5 shrink-0"
              >
                <FileText size={13} /> Details
              </Link>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-ink-faint py-4">No stores match your search</p>}
        </div>
      </Card>
    </div>
  );
}
