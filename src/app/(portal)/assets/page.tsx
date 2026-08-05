"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Server, FileText } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { ExportButtons } from "@/components/reports/ExportButtons";

export default function AssetRegisterPage() {
  const { stores, loading } = useAppData();
  const [q, setQ] = useState("");

  const filtered = stores.filter((s) =>
    (s.store_name + s.store_code + (s.province ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  if (loading) return <div className="text-sm text-ink-faint">Loading asset register…</div>;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionTitle icon={Server}>Asset Register ({filtered.length})</SectionTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store, code, province"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
          <ExportButtons stores={filtered} reportType="asset-register" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-black/5 dark:border-white/10">
              <th className="py-2 pr-3">Store Code</th>
              <th className="py-2 pr-3">Store Name</th>
              <th className="py-2 pr-3">Region / Zone</th>
              <th className="py-2 pr-3">Province</th>
              <th className="py-2 pr-3">NVR Model</th>
              <th className="py-2 pr-3">Cameras</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-black/5 dark:border-white/5 hover:bg-surface-muted dark:hover:bg-white/5">
                <td className="py-2 pr-3">
                  <Link href={`/assets/${s.store_code}`} className="font-mono text-xs text-brand hover:underline">
                    {s.store_code}
                  </Link>
                </td>
                <td className="py-2 pr-3">{s.store_name}</td>
                <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{s.region} &middot; {s.zone}</td>
                <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{s.province}</td>
                <td className="py-2 pr-3 font-mono text-xs text-ink-soft dark:text-white/60">{s.asset?.nvr_model}</td>
                <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{s.asset?.camera_working}/{s.asset?.camera_total}</td>
                <td className="py-2 pr-3"><StatusBadge status={s.overall_status} /></td>
                <td className="py-2 pr-3 text-right">
                  <Link
                    href={`/assets/${s.store_code}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
                  >
                    <FileText size={13} /> Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
