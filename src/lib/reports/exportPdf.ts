import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StoreWithAssets, MaintenanceRecord } from "@/types/database";
import { regionFromZone, zoneCode } from "@/lib/recovery";

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
    doc.text(
      `Generated ${new Date().toLocaleDateString()} · Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }
}

export function exportExecutivePdf(stores: StoreWithAssets[]) {
  const doc = new jsPDF();
  header(doc, "Executive Report");

  const counts = { Healthy: 0, Partial: 0, Offline: 0, Unknown: 0 } as Record<string, number>;
  stores.forEach((s) => (counts[s.overall_status] = (counts[s.overall_status] ?? 0) + 1));
  const avg = stores.length ? Math.round(stores.reduce((a, s) => a + s.healthScore, 0) / stores.length) : 0;

  doc.setFontSize(11);
  doc.text(`Total stores: ${stores.length}    Average health score: ${avg}`, 14, 30);

  autoTable(doc, {
    startY: 36,
    head: [["Status", "Count"]],
    body: (["Healthy", "Partial", "Offline", "Unknown"] as const).map((k) => [k, String(counts[k] ?? 0)]),
    headStyles: { fillColor: [51, 51, 51] },
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: y,
    head: [["Store Code", "Store Name", "Zone", "Status", "Score"]],
    body: [...stores]
      .sort((a, b) => b.healthScore - a.healthScore)
      .map((s) => [s.store_code, s.store_name, zoneCode(s.zone), s.overall_status, String(s.healthScore)]),
    headStyles: { fillColor: [215, 25, 32] },
    styles: { fontSize: 8 },
  });

  footer(doc);
  doc.save("bata-executive-report.pdf");
}

export function exportStoreDetailPdf(store: StoreWithAssets, records: MaintenanceRecord[]) {
  const doc = new jsPDF();
  header(doc, `Store Detail — ${store.store_code}`);

  doc.setFontSize(12);
  doc.text(`${store.store_name} (${store.store_code})`, 14, 30);
  doc.setFontSize(9);
  doc.text(`${regionFromZone(store.zone)} / Zone ${zoneCode(store.zone)} — ${store.province ?? ""}`, 14, 36);
  doc.text(`Overall Status: ${store.overall_status}    Health Score: ${store.healthScore}`, 14, 42);

  autoTable(doc, {
    startY: 48,
    head: [["NVR", "Camera", "Storage", "Network"]],
    body: [[
      `${store.asset?.nvr_brand ?? ""} ${store.asset?.nvr_model ?? ""}\nSN ${store.asset?.nvr_serial ?? ""}`,
      `${store.asset?.camera_working ?? 0}/${store.asset?.camera_total ?? 0} working`,
      `${store.asset?.hdd_capacity ?? ""} (${store.asset?.hdd_status ?? ""})`,
      `${store.asset?.isp ?? ""} / ${store.asset?.internet_type ?? ""}`,
    ]],
    styles: { fontSize: 8, cellWidth: "wrap" },
    headStyles: { fillColor: [215, 25, 32] },
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text("Maintenance History", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Problem", "Resolution", "Cost (THB)", "Technician"]],
    body: records.map((r) => [r.issue_date, r.problem ?? "", r.resolution ?? "", r.cost.toLocaleString(), r.technician ?? ""]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [51, 51, 51] },
  });

  footer(doc);
  doc.save(`bata-store-${store.store_code}.pdf`);
}

export function exportOfflineStoresPdf(stores: StoreWithAssets[]) {
  const doc = new jsPDF();
  header(doc, "Offline Store Report");

  const offline = stores.filter((s) => s.overall_status === "Offline" || s.overall_status === "Unknown");
  doc.setFontSize(11);
  doc.text(`${offline.length} store(s) offline or unknown`, 14, 30);

  autoTable(doc, {
    startY: 36,
    head: [["Store Code", "Store Name", "Zone", "Status", "Supplier", "NVR Online", "Last Verified"]],
    body: offline.map((s) => [
      s.store_code,
      s.store_name,
      zoneCode(s.zone),
      s.overall_status,
      s.supplierName,
      s.asset?.nvr_online ? "Yes" : "No",
      s.hikconnect?.last_verified_date ?? "—",
    ]),
    headStyles: { fillColor: [215, 25, 32] },
    styles: { fontSize: 8 },
  });

  footer(doc);
  doc.save("bata-offline-stores.pdf");
}
