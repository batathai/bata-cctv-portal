"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Activity, MapPin, ListChecks, Search, FileText, Radio } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/Badge";
import { ZONES } from "@/lib/mockData";
import { hasOpenTicket } from "@/lib/tickets";
import {
  RECOVERY_STAGES,
  deriveRecoveryStatus,
  getRecoveryRegion,
  isStoreChecked,
  isHealthy,
  isRepairCompleted,
  isRepairPending,
} from "@/lib/recovery";
import type { StoreWithAssets } from "@/types/database";

// Retail/Operations-friendly labels per the FINAL REQUIREMENT doc — avoid
// IT jargon like "Healthy" / "Pending" / "Asset Health".
const BUCKET_COLORS: Record<string, string> = {
  Normal: "#1E9E5A",
  "Under Repair": "#E2A400",
  Completed: "#333333",
  Other: "#8A8A8A",
};

type Bucket = "all" | "checked" | "Healthy" | "Partial" | "Offline" | "Unknown" | "repair";

function bucketMatches(bucket: Bucket, s: StoreWithAssets, audits: any[], tickets: any[]): boolean {
  switch (bucket) {
    case "checked":
      return isStoreChecked(s, audits);
    case "repair":
      return hasOpenTicket(s.id, tickets);
    case "all":
      return true;
    default:
      return s.overall_status === bucket;
  }
}

export default function DashboardPage() {
  const { stores, audits, tickets, loading } = useAppData();
  const [bucket, setBucket] = useState<Bucket>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const checked = stores.filter((s) => isStoreChecked(s, audits)).length;
    const repair = stores.filter((s) => hasOpenTicket(s.id, tickets)).length;
    const c: Record<string, number> = { Healthy: 0, Partial: 0, "View Only": 0, Offline: 0, Unknown: 0 };
    stores.forEach((s) => (c[s.overall_status] = (c[s.overall_status] ?? 0) + 1));
    return {
      checked,
      repair,
      Healthy: c.Healthy,
      Partial: c.Partial,
      Offline: c.Offline,
      Unknown: c.Unknown,
    };
  }, [stores, audits, tickets]);

  const donut = useMemo(() => {
    let normal = 0,
      underRepair = 0,
      completed = 0,
      other = 0;
    stores.forEach((s) => {
      if (isHealthy(s, tickets)) normal++;
      else if (isRepairPending(s, tickets)) underRepair++;
      else if (isRepairCompleted(s, tickets)) completed++;
      else other++;
    });
    return [
      { name: "Normal", value: normal },
      { name: "Under Repair", value: underRepair },
      { name: "Completed", value: completed },
      { name: "Other", value: other },
    ].filter((d) => d.value > 0);
  }, [stores, tickets]);

  const byRegion = (["BKK", "Country"] as const).map((r) => ({
    name: r,
    value: stores.filter((s) => getRecoveryRegion(s.zone) === r).length,
  }));

  const byStage = RECOVERY_STAGES.map((stage) => ({
    name: stage,
    value: stores.filter((s) => (s.recovery_stage ?? (deriveRecoveryStatus(s) === "Normal" ? "Verified" : "Waiting Vendor Quote")) === stage).length,
  }));

  const filtered = useMemo(
    () => stores.filter((s) => bucketMatches(bucket, s, audits, tickets) && (s.store_name + s.store_code).toLowerCase().includes(q.toLowerCase())),
    [stores, audits, tickets, bucket, q]
  );
  const sorted = useMemo(() => [...filtered].sort((a, b) => a.store_code.localeCompare(b.store_code)), [filtered]);

  if (loading) return <div className="text-sm text-ink-faint">Loading store data…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <StatCard label="Stores Checked" value={counts.checked} onClick={() => setBucket("checked")} active={bucket === "checked"} />
        <StatCard label="Online" value={counts.Healthy ?? 0} colorClass="text-status-healthy" onClick={() => setBucket("Healthy")} active={bucket === "Healthy"} />
        <StatCard label="Partial" value={counts.Partial ?? 0} colorClass="text-status-partial" onClick={() => setBucket("Partial")} active={bucket === "Partial"} />
        <StatCard label="Offline" value={counts.Offline ?? 0} colorClass="text-status-offline" onClick={() => setBucket("Offline")} active={bucket === "Offline"} />
        <StatCard label="Unknown" value={counts.Unknown ?? 0} colorClass="text-status-unknown" onClick={() => setBucket("Unknown")} active={bucket === "Unknown"} />
        <StatCard label="Repair" value={counts.repair} colorClass="text-brand" onClick={() => setBucket("repair")} active={bucket === "repair"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-4">
          <SectionTitle icon={Activity}>Repair Status</SectionTitle>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3}>
                {donut.map((d) => (
                  <Cell key={d.name} fill={BUCKET_COLORS[d.name]} stroke="none" />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-3 flex-wrap mt-1 text-xs text-ink-soft dark:text-white/60">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: BUCKET_COLORS[d.name] }} />
                {d.name}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle icon={MapPin}>Stores by Region (BKK / Country)</SectionTitle>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={byRegion} layout="vertical" margin={{ left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#333333" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={ZONES.map((z) => ({ name: z.code, value: stores.filter((s) => s.zone === z.code).length })).filter((z) => z.value > 0)}
              margin={{ left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#D71920" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={ListChecks}>Store Distribution</SectionTitle>
            <Link href="/work-orders" className="text-xs font-medium text-brand hover:underline shrink-0 mb-3">
              ดูใบงานทั้งหมด →
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byStage} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={26}>
                {byStage.map((b, i) => (
                  <Cell key={b.name} fill={["#8A8A8A", "#E2A400", "#E2A400", "#D71920", "#333333", "#1E9E5A"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <SectionTitle icon={Radio}>Store List ({sorted.length})</SectionTitle>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสาขา / รหัสสาขา"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/5">
          {sorted.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink dark:text-white truncate">{s.store_name}</div>
                <div className="font-mono text-[11px] text-ink-faint">
                  {s.store_code} &middot; {getRecoveryRegion(s.zone)}
                </div>
              </div>
              <StatusBadge status={s.overall_status} />
              <Link
                href={`/recovery/${s.store_code}`}
                className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5 shrink-0"
              >
                <FileText size={13} /> รายละเอียด
              </Link>
            </div>
          ))}
          {sorted.length === 0 && <p className="text-sm text-ink-faint py-4">ไม่พบสาขาที่ตรงกับตัวกรอง</p>}
        </div>
      </Card>
    </div>
  );
}
