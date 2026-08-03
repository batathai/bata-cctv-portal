"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { UploadCloud, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Sheet, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { TARGET_FIELDS, type TargetTable, type ImportBatch } from "@/lib/importHistory";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";

type Step = "upload" | "map" | "preview" | "done";
type Source = "file" | "google-sheet";

export function ImportWizard() {
  const { runImport } = useAppData();
  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<Source>("file");
  const [targetTable, setTargetTable] = useState<TargetTable>("stores");
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [resultBatch, setResultBatch] = useState<ImportBatch | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function resetAll() {
    setStep("upload");
    setFileName("");
    setColumns([]);
    setRows([]);
    setMapping({});
    setResultBatch(null);
    setSheetUrl("");
    setSheetError(null);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
        finishParse(json);
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => finishParse(res.data),
      });
    }
  }

  async function handleGoogleSheet() {
    if (!sheetUrl.trim()) return;
    setSheetLoading(true);
    setSheetError(null);
    try {
      const res = await fetch("/api/import/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetUrl.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSheetError(body.error ?? "Could not import this sheet.");
        return;
      }
      setFileName(`Google Sheet (${body.sheetId.slice(0, 8)}…)`);
      Papa.parse<Record<string, string>>(body.csv, {
        header: true,
        skipEmptyLines: true,
        complete: (parsed) => finishParse(parsed.data),
      });
    } catch {
      setSheetError("Network error while contacting the server. Please try again.");
    } finally {
      setSheetLoading(false);
    }
  }

  function finishParse(data: Record<string, string>[]) {
    if (!data.length) return;
    const cols = Object.keys(data[0]);
    setColumns(cols);
    setRows(data);
    // Auto-map by comparing word sets, so column order in the header doesn't
    // matter (e.g. sheet's "Total Camera" still matches field "Camera Total").
    const wordsOf = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
    const auto: Record<string, string> = {};
    const fields = TARGET_FIELDS[targetTable];
    cols.forEach((c) => {
      const sourceWords = wordsOf(c);
      const match = fields.find((f) => {
        const fieldWords = wordsOf(f.label.replace(/\(.*?\)/g, "")); // ignore "(match key)" etc.
        if (fieldWords.size === 0) return false;
        const overlap = [...fieldWords].filter((w) => sourceWords.has(w)).length;
        return overlap === fieldWords.size || overlap / fieldWords.size >= 0.6;
      });
      if (match) auto[c] = match.key;
    });
    setMapping(auto);
    setStep("map");
  }

  const requiredMapped = TARGET_FIELDS[targetTable]
    .filter((f) => f.required)
    .every((f) => Object.values(mapping).includes(f.key));

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function confirmImport() {
    setImporting(true);
    setImportError(null);
    try {
      const batch = await runImport(targetTable, mapping, rows, fileName);
      setResultBatch(batch);
      setStep("done");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle icon={UploadCloud}>Bulk Import — {step === "upload" ? "1. Upload" : step === "map" ? "2. Map Columns" : step === "preview" ? "3. Preview" : "4. Complete"}</SectionTitle>

      {step === "upload" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">Target table</label>
            <Select value={targetTable} onChange={(v) => setTargetTable(v as TargetTable)} options={["stores", "cctv_assets", "maintenance_history"]} placeholder="Choose target" />
          </div>

          <div className="flex gap-1 border-b border-black/10 dark:border-white/10">
            {([
              { key: "file", label: "Upload File" },
              { key: "google-sheet", label: "From Google Sheet" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setSource(t.key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
                  source === t.key ? "border-brand text-brand" : "border-transparent text-ink-faint hover:text-ink dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {source === "file" ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-black/15 dark:border-white/15 rounded-lg py-10 text-center cursor-pointer hover:border-brand transition-colors"
            >
              <UploadCloud size={26} className="mx-auto mb-2 text-ink-faint" />
              <p className="text-sm text-ink dark:text-white">Drop a .csv or .xlsx file here, or click to browse</p>
              <p className="text-xs text-ink-faint mt-1">First row must contain column headers.</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-xs text-ink-faint bg-surface-muted dark:bg-white/5 rounded-md p-3">
                <Sheet size={14} className="shrink-0 mt-0.5 text-brand" />
                <span>
                  Paste the sheet&apos;s share link. The sheet must be shared as <strong>&quot;Anyone with the link&quot; → Viewer</strong>.
                  The first row of the sheet (or the active tab, if it has a <span className="font-mono">gid</span> in the URL) must contain
                  column headers.
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                  className="flex-1 text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
                />
                <button
                  onClick={handleGoogleSheet}
                  disabled={!sheetUrl.trim() || sheetLoading}
                  className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-4 py-2 disabled:opacity-40 shrink-0"
                >
                  {sheetLoading ? <Loader2 size={13} className="animate-spin" /> : <Sheet size={13} />} Fetch
                </button>
              </div>
              {sheetError && (
                <p className="text-xs text-brand flex items-start gap-1.5">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" /> {sheetError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-xs text-ink-faint">
            {fileName} &middot; {rows.length} rows detected. Map each source column to a field on{" "}
            <span className="font-mono">{targetTable}</span>.
          </p>
          <div className="flex items-start gap-2 text-xs text-brand bg-brand-50 rounded-md p-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Auto-mapping is a best guess based on column names — <strong>check every row below</strong>, not just
              the required one. Any column left on &quot;Ignore this column&quot; will not be imported.
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {columns.map((c) => (
              <div key={c} className="flex items-center gap-3">
                <div className="w-40 shrink-0 text-sm font-mono truncate text-ink dark:text-white">{c}</div>
                <ArrowRight size={13} className="text-ink-faint shrink-0" />
                <select
                  value={mapping[c] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [c]: e.target.value })}
                  className="flex-1 text-sm border border-black/10 dark:border-white/10 rounded-md px-2 py-1.5 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand"
                >
                  <option value="">— Ignore this column —</option>
                  {TARGET_FIELDS[targetTable].map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!requiredMapped && (
            <p className="text-xs text-brand flex items-center gap-1.5">
              <AlertCircle size={12} /> Map the required Store Code column to continue.
            </p>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={resetAll} className="flex items-center gap-1.5 text-xs text-ink-soft dark:text-white/60 hover:text-brand">
              <ArrowLeft size={13} /> Start over
            </button>
            <button
              disabled={!requiredMapped}
              onClick={() => setStep("preview")}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-4 py-2 disabled:opacity-40"
            >
              Preview <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <PreviewStep
          targetTable={targetTable}
          mapping={mapping}
          rows={rows}
          onBack={() => setStep("map")}
          onConfirm={confirmImport}
          importing={importing}
          importError={importError}
        />
      )}

      {step === "done" && resultBatch && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-status-healthy text-sm font-medium">
            <CheckCircle2 size={16} /> Import complete
          </div>
          <p className="text-xs text-ink-faint">
            {targetTable === "maintenance_history" ? (
              <>
                {resultBatch.rows.filter((r) => r.operation === "insert").length} repair record(s) added, and{" "}
                {resultBatch.rows.filter((r) => r.operation === "not_found").length} row(s) skipped (store code not
                found).
              </>
            ) : (
              <>
                {resultBatch.rows.filter((r) => r.operation === "insert").length} new store(s) created,{" "}
                {resultBatch.rows.filter((r) => r.operation === "update").length} existing row(s) updated, and{" "}
                {resultBatch.rows.filter((r) => r.operation === "not_found").length} row(s) skipped (store code not
                found — import to Stores first if this was a CCTV Assets import).
              </>
            )}{" "}
            This batch is now in the Import History tab and can be rolled back at any time.
          </p>
          <button onClick={resetAll} className="text-xs font-medium bg-brand text-white rounded-md px-4 py-2">
            Import another file
          </button>
        </div>
      )}
    </Card>
  );
}

function PreviewStep({
  targetTable,
  mapping,
  rows,
  onBack,
  onConfirm,
  importing,
  importError,
}: {
  targetTable: TargetTable;
  mapping: Record<string, string>;
  rows: Record<string, string>[];
  onBack: () => void;
  onConfirm: () => void;
  importing: boolean;
  importError: string | null;
}) {
  const { allStores } = useAppData();
  const targetCols = Array.from(new Set(Object.values(mapping).filter(Boolean)));
  const codeCol = Object.keys(mapping).find((c) => mapping[c] === "store_code");
  const knownCodes = new Set(allStores.map((s) => s.store_code));
  const preview = rows.slice(0, 25);

  const newCount = codeCol ? rows.filter((r) => !knownCodes.has(r[codeCol])).length : 0;
  const matchedCount = rows.length - newCount;
  const canInsert = targetTable === "stores";
  const isLog = targetTable === "maintenance_history";

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-faint">
        Previewing {preview.length} of {rows.length} rows.{" "}
        {isLog ? (
          <span className={matchedCount > 0 ? "text-status-healthy" : "text-brand"}>
            {matchedCount} row(s) will be added as new repair records
            {newCount > 0 ? `; ${newCount} row(s) with an unrecognized store code will be skipped.` : "."}
          </span>
        ) : (
          newCount > 0 &&
          (canInsert ? (
            <span className="text-status-healthy">{newCount} row(s) will create new stores.</span>
          ) : (
            <span className="text-brand">{newCount} row(s) have a store code not found in the system — they will be skipped (import to Stores first).</span>
          ))
        )}
      </p>
      <div className="overflow-x-auto max-h-72 border border-black/10 dark:border-white/10 rounded-md">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-muted dark:bg-white/5">
            <tr>
              {targetCols.map((tc) => (
                <th key={tc} className="text-left px-3 py-2 font-medium text-ink-faint uppercase tracking-wide">
                  {TARGET_FIELDS[targetTable].find((f) => f.key === tc)?.label ?? tc}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className="border-t border-black/5 dark:border-white/5">
                {targetCols.map((tc) => {
                  const srcCol = Object.keys(mapping).find((c) => mapping[c] === tc);
                  return <td key={tc} className="px-3 py-1.5">{srcCol ? r[srcCol] : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {importError && (
        <p className="text-xs text-brand flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {importError}
        </p>
      )}
      <div className="flex justify-between pt-1">
        <button onClick={onBack} disabled={importing} className="flex items-center gap-1.5 text-xs text-ink-soft dark:text-white/60 hover:text-brand disabled:opacity-40">
          <ArrowLeft size={13} /> Back to mapping
        </button>
        <button
          onClick={onConfirm}
          disabled={importing}
          className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-4 py-2 disabled:opacity-60"
        >
          {importing ? <Loader2 size={13} className="animate-spin" /> : null}
          {importing ? "Importing…" : "Confirm & Import"} {!importing && <ArrowRight size={13} />}
        </button>
      </div>
    </div>
  );
}
