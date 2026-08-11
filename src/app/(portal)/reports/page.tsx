"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileBarChart, FileText, FileSpreadsheet, UploadCloud, WifiOff, ClipboardList, RefreshCw } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { exportExecutivePdf, exportStoreDetailPdf, exportOfflineStoresPdf } from "@/lib/reports/exportPdf";
import { exportExecutiveSummaryToExcel, exportStoresToExcel, exportWorkOrdersToExcel } from "@/lib/reports/exportExcel";
import { canManageMasterData } from "@/lib/rbac";

export default function ReportsPage() {
  const { stores, tickets, maintenance, workOrderBatches, recoveryStageHistory, role, loading, refreshAllData } = useAppData();
  const [selectedCode, setSelectedCode] = useState("");
  // Defaults to the 50-store pilot job specifically — that's the one with a
  // known reference file to cross-check against; other jobs can still be
  // picked from the dropdown same as before.
  const [selectedBatchName, setSelectedBatchName] = useState("Job 1: 50-Store Pilot");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // AppDataProvider fetches once per browser session (see its comment) — a
  // report is meant to be a point-in-time accurate snapshot, so force a
  // fresh pull the moment this page is opened rather than trusting whatever
  // was cached whenever the session started. The manual Refresh button lets
  // the same be done again without leaving the page or reloading the tab.
  useEffect(() => {
    setRefreshing(true);
    refreshAllData().finally(() => {
      setRefreshing(false);
      setLastRefreshed(new Date());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualRefresh() {
    setRefreshing(true);
    await refreshAllData();
    setRefreshing(false);
    setLastRefreshed(new Date());
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading reports…</div>;

  const selectedStore = stores.find((s) => s.store_code === selectedCode);
  const offlineCount = stores.filter((s) => s.overall_status === "Offline" || s.overall_status === "Unknown").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionTitle icon={FileBarChart}>Reports</SectionTitle>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-brand disabled:opacity-60"
            >
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh data"}
            </button>
            {!refreshing && lastRefreshed && (
              <span className="text-[11px] text-ink-faint">
                &middot; as of {lastRefreshed.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
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
            Fleet-wide status breakdown and full store list — for leadership review.
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

        <Card className="p-5 flex flex-col">
          <SectionTitle icon={ClipboardList}>Work Order Summary</SectionTitle>
          <p className="text-xs text-ink-faint mb-3">
            Same layout as the team&apos;s &quot;50 Stores Summary&quot; sheet — Code, Store Name, DM, Status, Online Status, Camera Status,
            Add Device Status, Cause, Remark — computed live from each store&apos;s current Work Order state.
          </p>
          <div className="mb-4">
            <Select value={selectedBatchName} onChange={setSelectedBatchName} options={workOrderBatches.map((b) => b.name)} placeholder="Choose a job" />
          </div>
          <button
            disabled={!selectedBatchName}
            onClick={() => {
              const batch = workOrderBatches.find((b) => b.name === selectedBatchName);
              if (!batch) return;
              const batchStores = stores.filter((s) => s.batch_id === batch.id);
              exportWorkOrdersToExcel(batchStores, tickets, recoveryStageHistory, `${batch.name.replace(/[^\w\- ]+/g, "").trim()}.xlsx`);
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5 disabled:opacity-40"
          >
            <FileSpreadsheet size={13} className="text-status-healthy" /> Export Excel
          </button>
        </Card>
      </div>
    </div>
  );
}
