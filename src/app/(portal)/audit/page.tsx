"use client";

import { ClipboardCheck } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";

function ResultPill({ ok }: { ok: boolean }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ok ? "bg-status-healthy/10 text-status-healthy" : "bg-status-offline/10 text-status-offline"}`}>
      {ok ? "Pass" : "Fail"}
    </span>
  );
}

export default function AuditPage() {
  const { audits, stores, loading } = useAppData();
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const visible = audits.filter((a) => storeMap.has(a.store_id));

  if (loading) return <div className="text-sm text-ink-faint">Loading audit history…</div>;

  return (
    <Card className="p-4">
      <SectionTitle icon={ClipboardCheck}>Store Audit Records ({visible.length})</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-black/5 dark:border-white/10">
              <th className="py-2 pr-3">Store</th>
              <th className="py-2 pr-3">Audit Date</th>
              <th className="py-2 pr-3">Auditor</th>
              <th className="py-2 pr-3">Playback</th>
              <th className="py-2 pr-3">HDD</th>
              <th className="py-2 pr-3">Camera</th>
              <th className="py-2 pr-3">Hik-Connect</th>
              <th className="py-2 pr-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const store = storeMap.get(a.store_id);
              return (
                <tr key={a.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-3">
                    <div>{store?.store_name}</div>
                    <div className="font-mono text-[11px] text-ink-faint">{store?.store_code}</div>
                  </td>
                  <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{a.audit_date}</td>
                  <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{a.auditor}</td>
                  <td className="py-2 pr-3"><ResultPill ok={a.playback_result === "Pass"} /></td>
                  <td className="py-2 pr-3"><ResultPill ok={a.hdd_result === "Pass"} /></td>
                  <td className="py-2 pr-3"><ResultPill ok={a.camera_result === "Pass"} /></td>
                  <td className="py-2 pr-3"><ResultPill ok={a.hikconnect_result === "Pass"} /></td>
                  <td className="py-2 pr-3 font-mono font-semibold">{a.audit_score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
