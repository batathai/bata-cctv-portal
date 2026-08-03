"use client";

import { useState } from "react";
import { History, RotateCcw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";

export function ImportHistory() {
  const { importBatches, rollbackImport } = useAppData();
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  async function handleRollback(id: string) {
    setRollingBackId(id);
    try {
      await rollbackImport(id);
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle icon={History}>Import History ({importBatches.length})</SectionTitle>
      {importBatches.length === 0 && <p className="text-sm text-ink-faint">No imports yet in this session.</p>}
      <div className="space-y-2">
        {importBatches.map((b) => {
          const inserted = b.rows.filter((r) => r.operation === "insert").length;
          const updated = b.rows.filter((r) => r.operation === "update").length;
          const skipped = b.rows.filter((r) => r.operation === "not_found").length;
          const isRollingBack = rollingBackId === b.id;
          return (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-md bg-surface-muted dark:bg-white/5 text-sm">
              <div className="flex-1">
                <div className="font-medium text-ink dark:text-white">{b.fileName}</div>
                <div className="text-xs text-ink-faint mt-0.5">
                  Target: <span className="font-mono">{b.targetTable}</span> &middot; {inserted} created, {updated} updated,{" "}
                  {skipped} skipped &middot; {new Date(b.createdAt).toLocaleString()}
                </div>
              </div>
              {b.status === "completed" ? (
                <span className="flex items-center gap-1 text-xs text-status-healthy font-medium">
                  <CheckCircle2 size={13} /> Completed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-ink-faint font-medium">
                  <XCircle size={13} /> Rolled back
                </span>
              )}
              <button
                disabled={b.status === "rolled_back" || isRollingBack}
                onClick={() => handleRollback(b.id)}
                className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-white dark:hover:bg-white/10 disabled:opacity-30"
              >
                {isRollingBack ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {isRollingBack ? "Rolling back…" : "Rollback"}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
