"use client";

import { useState } from "react";
import Link from "next/link";
import { FileBarChart, FileText, FileSpreadsheet, UploadCloud, WifiOff } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { exportExecutivePdf, exportStoreDetailPdf, exportOfflineStoresPdf } from "@/lib/reports/exportPdf";
import { exportExecutiveSummaryToExcel, exportStoresToExcel } from "@/lib/reports/exportExcel";
import { canManageMasterData } from "@/lib/rbac";

export default function ReportsPage() {
  const { stores, maintenance, role, loading } = useAppData();
  const [selectedCode, setSelectedCode] = useState("");

  if (loading) return <div className="text-sm text-ink-faint">Loading reports…</div>;

  const selectedStore = stores.find((s) => s.store_code === selectedCode);
  const offlineCount = stores.filter((s) => s.overall_status === "Offline" || s.overall_status === "Unknown").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle icon={FileBarChart}>Reports</SectionTitle>
        {canManageMasterData(role) && (
          <Link
            href="/reports/import"
            className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-2 hover:bg-brand-dark"
          >
            <UploadCloud size={13} /> Import Excel / CSV
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 flex flex-col">
          <SectionTitle icon={FileBarChart}>Executive Report</SectionTitle>
          <p className="text-xs text-ink-faint flex-1 mb-4">
            Fleet-wide status breakdown, average health score, and full store ranking — for leadership review.
          </p>
          <div className="flex gap-2">
            <button onClick={() => exportExecutivePdf(stores)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5">
              <FileText size={13} className="text-brand" /> PDF
            </button>
            <button onClick={() => exportExecutiveSummaryToExcel(stores)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5">
              <FileSpreadsheet size={13} className="text-status-healthy" /> Excel
            </button>
          </div>
        </Card>

        <Card className="p-5 flex flex-col">
          <SectionTitle icon={FileText}>Store Detail Report</SectionTitle>
          <p className="text-xs text-ink-faint mb-3">Full asset, health, and maintenance detail for one store.</p>
          <div className="mb-4">
            <Select
              value={selectedCode}
              onChange={setSelectedCode}
              options={stores.map((s) => `${s.store_code} — ${s.store_name}`)}
              placeholder="Choose a store"
            />
          </div>
          <button
            disabled={!selectedCode}
            onClick={() => {
              const code = selectedCode.split(" — ")[0];
              const store = stores.find((s) => s.store_code === code);
              if (store) exportStoreDetailPdf(store, maintenance.filter((r) => r.store_id === store.id));
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5 disabled:opacity-40"
          >
            <FileText size={13} className="text-brand" /> Generate PDF
          </button>
        </Card>

        <Card className="p-5 flex flex-col">
          <SectionTitle icon={WifiOff}>Offline Store Report</SectionTitle>
          <p className="text-xs text-ink-faint flex-1 mb-4">
            All stores currently Offline or Unknown ({offlineCount}) — for supplier escalation.
          </p>
          <div className="flex gap-2">
            <button onClick={() => exportOfflineStoresPdf(stores)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5">
              <FileText size={13} className="text-brand" /> PDF
            </button>
            <button
              onClick={() => exportStoresToExcel(stores.filter((s) => s.overall_status === "Offline" || s.overall_status === "Unknown"), "bata-offline-stores.xlsx")}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5"
            >
              <FileSpreadsheet size={13} className="text-status-healthy" /> Excel
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
