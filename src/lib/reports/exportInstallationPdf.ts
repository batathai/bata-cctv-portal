import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StoreWithAssets, InstallationProject } from "@/types/database";
import { zoneCode, getAreaLabel } from "@/lib/recovery";
import { INSTALLATION_STAGES, getStageLabel } from "@/lib/installation";

const BRAND_RED = "#D71920";

function header(doc: jsPDF, title: string) {
  doc.setFillColor(BRAND_RED);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 20, "F");
  doc.setTextColor("#FFFFFF");
  doc.setFontSize(14);
  doc.text("BATA CCTV Command Center", 14, 13);
  doc.setFontSize(10);
  doc.text(title, doc.internal.pageSize.getWidth() - 14, 13, { align: "right" });
  doc.setTextColor("#333333");
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor("#8A8A8A");
    doc.text(`Generated ${new Date().toLocaleDateString()} · Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.getHeight() - 8);
  }
}

/** Executive Summary (R8): 1 page — count per stage + count per zone. */
export function exportInstallationExecSummaryPdf(projects: InstallationProject[], storeById: Map<string, StoreWithAssets>) {
  const doc = new jsPDF();
  header(doc, "Installation Project — Executive Summary");

  doc.setFontSize(11);
  doc.text(`Total stores in view: ${projects.length}`, 14, 30);

  const countsByStage = INSTALLATION_STAGES.map((stage) => ({
    stage,
    count: projects.filter((p) => p.current_stage === stage).length,
  }));

  autoTable(doc, {
    startY: 36,
    head: [["Stage", "Count"]],
    body: countsByStage.map((c) => [getStageLabel(c.stage), String(c.count)]),
    headStyles: { fillColor: [215, 25, 32] },
  });

  const zoneCounts = new Map<string, number>();
  projects.forEach((p) => {
    const s = storeById.get(p.store_id);
    if (!s) return;
    const z = zoneCode(s.zone);
    zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: y,
    head: [["Zone", "Area", "Count"]],
    body: Array.from(zoneCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([z, count]) => [z, getAreaLabel(z), String(count)]),
    headStyles: { fillColor: [51, 51, 51] },
  });

  footer(doc);
  doc.save("bata-installation-executive-summary.pdf");
}

/** Per-store handover sheet (R8) — one page, printed at Verify sign-off. */
export function exportInstallationHandoverPdf(project: InstallationProject, store: StoreWithAssets) {
  const doc = new jsPDF();
  header(doc, `ใบส่งมอบงาน — ${store.store_code}`);

  doc.setFontSize(11);
  doc.text(`สาขา: ${store.store_name} (${store.store_code})`, 14, 30);
  doc.text(`Wave: ${project.wave}`, 14, 37);
  doc.text(`สถานะ: ${getStageLabel(project.current_stage)}`, 14, 44);

  autoTable(doc, {
    startY: 52,
    head: [["รายการ", "วันที่"]],
    body: [
      ["ยื่นขออนุญาต", project.permit_submitted_at ?? "-"],
      ["นัดติดตั้ง (D1)", project.d1_date ?? "-"],
      ["ติดตั้งจริง (D2)", project.d2_date ?? "-"],
      ["Verify Checklist", `${project.verify_total}/12`],
      ["ปิดงาน (Completed)", project.completed_at ?? "-"],
    ],
    headStyles: { fillColor: [215, 25, 32] },
  });

  footer(doc);
  doc.save(`bata-installation-handover-${store.store_code}.pdf`);
}
