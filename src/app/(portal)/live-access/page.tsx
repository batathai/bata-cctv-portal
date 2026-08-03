"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Search } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { IvmsLookup } from "@/components/recovery/IvmsLookup";

export default function LiveAccessPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-faint">Loading live access center…</div>}>
      <LiveAccessInner />
    </Suspense>
  );
}

function LiveAccessInner() {
  const { stores, loading } = useAppData();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const filtered = stores.filter((s) => (s.store_name + s.store_code).toLowerCase().includes(q.toLowerCase()));

  if (loading) return <div className="text-sm text-ink-faint">Loading live access center…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle icon={Eye}>Live Access Center</SectionTitle>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search store"
            className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-56"
          />
        </div>
      </div>
      <p className="text-xs text-ink-faint -mt-2">
        เปิดโปรแกรม iVMS-4200 ในเครื่องแล้วค้นหาด้วยเลขด้านล่าง — การดูผ่านแอป Hik-Connect (แชร์อุปกรณ์ตามเขต)
        เป็นการตั้งค่าฝั่ง Hikvision โดยตรงบนมือถือ ไม่ผ่านหน้านี้
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-medium text-sm text-ink dark:text-white">{s.store_name}</div>
                <div className="font-mono text-[11px] text-ink-faint">{s.store_code}</div>
              </div>
              <StatusBadge status={s.overall_status} />
            </div>
            <div className="text-xs text-ink-soft dark:text-white/60 space-y-1 mb-3">
              <div>Device: <span className="font-mono">{s.hikconnect?.device_name}</span></div>
              <div>Owner: {s.hikconnect?.owner_account}</div>
              <div>Shared users: {s.hikconnect?.shared_accounts.length}</div>
            </div>
            <IvmsLookup store={s} />
          </Card>
        ))}
      </div>
    </div>
  );
}
