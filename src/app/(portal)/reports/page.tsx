"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileBarChart, FileText, FileSpreadsheet, UploadCloud, WifiOff, ClipboardList, ClipboardCheck, RefreshCw } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { exportExecutivePdf, exportStoreDetailPdf, exportOfflineStoresPdf } from "@/lib/reports/exportPdf";
import { exportExecutiveSummaryToExcel, exportStoresToExcel, exportWorkOrdersToExcel, exportSurveyToExcel } from "@/lib/reports/exportExcel";
import { canManageMasterData } from "@/lib/rbac";
import { zoneCode } from "@/lib/recovery";
import { ZONES } from "@/lib/mockData";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { buildLiveRows, countLiveStatuses, formatDateTime } from "@/lib/monitoring";

export default function ReportsPage() {
  const { stores, audits, tickets, maintenance, workOrderBatches, recoveryStageHistory, role, loading, refreshAllData } = useAppData();
  const [selectedCode, setSelectedCode] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedSurveyZone, setSelectedSurveyZone] = useState("");
  // Defaults to the 50-store pilot job specifically — that's the one with a
  // known reference file to cross-check against; other jobs can still be
  // picked from the dropdown same as before.
  const [selectedBatchName, setSelectedBatchName] = useState("Job 1: 50-Store Pilot");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  // Executive Report uses the same iVMS sync status as Device Status.
  const { monitors, settings, stale, latestRun, refresh: refreshMonitoring } = useMonitoring();
  const liveRows = useMemo(() => buildLiveRows(stores, monitors, settings, stale), [stores, monitors, settings, stale]);
  const liveCounts = useMemo(() => countLiveStatuses(liveRows), [liveRows]);
  const lastSyncIso = latestRun?.ran_at ?? null;

  // AppDataProvider fetches once per browser session (see its comment) — a
  // report is meant to be a point-in-time accurate snapshot, so force a
  // fresh pull the moment this page is opened rather than trusting whatever
  // was cached whenever the session started. The manual Refresh button lets
  // the same be done again without leaving the page or reloading the tab.
  useEffect(() => {
    setRefreshing(true);
    Promise.all([refreshAllData(), refreshMonitoring()]).finally(() => {
      setRefreshing(false);
      setLastRefreshed(new Date());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualRefresh() {
    setRefreshing(true);
    await Promise.all([refreshAllData(), refreshMonitoring()]);
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
          <p className="text-xs text-ink-faint mb-3">
            DVR status of every store from the Hik-Partner Pro sync (same as Device Status): Online, Partial (camera repair),
            Offline with how long, and when each store was last updated. Excel also includes Work Order status, Cause
            and Remark.
          </p>
          <div className="text-xs text-ink-soft dark:text-white/70 flex-1 mb-4 space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-status-healthy font-medium">Online {liveCounts.Online}</span>
              <span className="text-[#8A5A00] dark:text-status-partial font-medium">Partial {liveCounts.CameraIssue}</span>
              <span className="text-status-offline font-medium">Offline {liveCounts.Offline}</span>
              <span className="text-ink-faint">Not monitored {liveCounts.NotMonitored}</span>
            </div>
            <div className="text-[11px] text-ink-faint">sync ล่าสุด: {formatDateTime(lastSyncIso) || "ยังไม่เคย sync"}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportExecutivePdf(liveRows, lastSyncIso)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5">
              <FileText size={13} className="text-brand" /> PDF
            </button>
            <button onClick={() => exportExecutiveSummaryToExcel(liveRows, lastSyncIso, tickets, recoveryStageHistory)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5">
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

          <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
            <p className="text-xs text-ink-faint mb-3">
              Or export every store in one zone — same columns as Work Order Summary (Code, Store Name, DM, Status, Online
              Status, Camera Status, Cause, Remark).
            </p>
            <div className="mb-3">
              <Select value={selectedZone} onChange={setSelectedZone} options={ZONES.map((z) => z.code)} placeholder="Choose a zone" />
            </div>
            <button
              disabled={!selectedZone}
              onClick={() => {
                const zoneStores = stores.filter((s) => zoneCode(s.zone) === selectedZone);
                exportWorkOrdersToExcel(zoneStores, tickets, recoveryStageHistory, `zone-${selectedZone}-store-detail.xlsx`);
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5 disabled:opacity-40"
            >
              <FileSpreadsheet size={13} className="text-status-healthy" /> Export Zone (Excel)
            </button>
          </div>
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
            Cause, Remark — computed live from each store&apos;s current Work Order state.
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

        <Card className="p-5 flex flex-col">
          <SectionTitle icon={ClipboardCheck}>Survey Report</SectionTitle>
          <p className="text-xs text-ink-faint mb-3">
            Every store&apos;s latest Survey checklist — DVR/camera/playback/HDD state, footage retention check,
            Hik-Connect, DVR date/time, and any Partial/Offline reason. Leave zone blank for all stores.
          </p>
          <div className="mb-4">
            <Select value={selectedSurveyZone} onChange={setSelectedSurveyZone} options={ZONES.map((z) => z.code)} placeholder="All zones" />
          </div>
          <button
            onClick={() => {
              const surveyStores = selectedSurveyZone ? stores.filter((s) => zoneCode(s.zone) === selectedSurveyZone) : stores;
              const filename = selectedSurveyZone ? `bata-survey-report-zone-${selectedSurveyZone}.xlsx` : "bata-survey-report.xlsx";
              exportSurveyToExcel(surveyStores, audits, filename);
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md py-2 hover:bg-surface-muted dark:hover:bg-white/5"
          >
            <FileSpreadsheet size={13} className="text-status-healthy" /> Export Excel
          </button>
        </Card>
      </div>
    </div>
  );
}
