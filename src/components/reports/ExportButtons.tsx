"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { exportStoresToExcel, exportMaintenanceToExcel } from "@/lib/reports/exportExcel";
import { exportExecutivePdf, exportOfflineStoresPdf } from "@/lib/reports/exportPdf";
import type { StoreWithAssets } from "@/types/database";

export function ExportButtons({
  stores,
  reportType,
}: {
  stores: StoreWithAssets[];
  reportType: "asset-register" | "executive" | "offline" | "maintenance";
}) {
  const { maintenance } = useAppData();
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  function handleExcel() {
    if (reportType === "maintenance") {
      exportMaintenanceToExcel(maintenance.filter((r) => storeMap.has(r.store_id)), storeMap);
    } else {
      exportStoresToExcel(stores);
    }
  }

  function handlePdf() {
    if (reportType === "offline") exportOfflineStoresPdf(stores);
    else exportExecutivePdf(stores);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleExcel}
        className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
      >
        <FileSpreadsheet size={13} className="text-status-healthy" /> Excel
      </button>
      <button
        onClick={handlePdf}
        className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
      >
        <FileText size={13} className="text-brand" /> PDF
      </button>
    </div>
  );
}
