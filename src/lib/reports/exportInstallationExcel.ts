import * as XLSX from "xlsx";
import type { StoreWithAssets, InstallationProject, VendorQuotation } from "@/types/database";
import { regionFromZone, zoneCode } from "@/lib/recovery";
import { getStageLabel } from "@/lib/installation";

/**
 * Client-side xlsx (json_to_sheet), matching the app's existing
 * exportExcel.ts pattern — no formulas/conditional formatting, per the
 * approved design decision (DESIGN doc §6, R7: "(ก)"). Values that would
 * be a formula in a spreadsheet-first tool (e.g. days elapsed) are computed
 * in JS before being placed in the cell.
 */
function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function daysBetween(a: string | null, b: string | null): number | "" {
  if (!a || !b) return "";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}

function quotationStatusFor(project: InstallationProject, quotations: VendorQuotation[]): string {
  if (!project.approved_quotation_id) return "";
  return quotations.find((q) => q.id === project.approved_quotation_id)?.approval_status ?? "";
}

export function exportInstallationExcel(
  projects: InstallationProject[],
  storeById: Map<string, StoreWithAssets>,
  quotations: VendorQuotation[],
  filename = "bata-installation-project.xlsx"
) {
  const summaryRows = projects.map((p) => {
    const s = storeById.get(p.store_id);
    return {
      "Store Code": s?.store_code ?? "",
      "Store Name": s?.store_name ?? "",
      Region: s ? regionFromZone(s.zone) : "",
      Zone: s ? zoneCode(s.zone) : "",
      Wave: p.wave,
      Stage: getStageLabel(p.current_stage),
      "Quotation Status": quotationStatusFor(p, quotations),
      "D1 (นัดติดตั้ง)": p.d1_date ?? "",
      "D2 (ติดตั้งจริง)": p.d2_date ?? "",
      "Verify (x/12)": `${p.verify_total}/12`,
      "Completed At": p.completed_at ?? "",
    };
  });

  const timelineRows = projects.map((p) => {
    const s = storeById.get(p.store_id);
    return {
      "Store Code": s?.store_code ?? "",
      "Store Name": s?.store_name ?? "",
      Wave: p.wave,
      "Permit Submitted": p.permit_submitted_at ?? "",
      "D1 (นัดติดตั้ง)": p.d1_date ?? "",
      "D2 (ติดตั้งจริง)": p.d2_date ?? "",
      "Completed At": p.completed_at ?? "",
      "Days D1→D2": daysBetween(p.d1_date, p.d2_date),
      "Days D2→Completed": daysBetween(p.d2_date, p.completed_at),
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timelineRows), "Timeline");
  download(wb, filename);
}
