"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { effectiveHours, shortTime, validateHours } from "@/lib/monitoring";
import type { StoreMonitor } from "@/types/database";

/** Per-store opening hours (R12). Empty = use the standard hours from Settings. */
export function BusinessHoursEditor({ storeId, monitor, canEdit }: { storeId: string; monitor: StoreMonitor | null; canEdit: boolean }) {
  const { settings, setStoreHours } = useMonitoring();
  const hours = effectiveHours(monitor, settings);
  const [open, setOpen] = useState(hours.open);
  const [close, setClose] = useState(hours.close);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setOpen(hours.open);
    setClose(hours.close);
  }, [hours.open, hours.close]);

  const dirty = open !== hours.open || close !== hours.close;
  const std = `${shortTime(settings.default_open_time)}–${shortTime(settings.default_close_time)}`;

  async function run(o: string | null, c: string | null) {
    if (o && c) {
      const err = validateHours(o, c);
      if (err) return setMsg({ kind: "err", text: err });
    }
    setSaving(true);
    setMsg(null);
    try {
      await setStoreHours(storeId, o, c);
      setMsg({ kind: "ok", text: "บันทึกแล้ว" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="space-y-2 min-w-[240px]">
      <legend className="text-sm font-semibold text-ink dark:text-white mb-2">เวลาทำการของสาขา</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60">
          เปิด
          <input type="time" value={open} disabled={!canEdit} onChange={(e) => setOpen(e.target.value)} className="h-9 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2 font-mono text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60">
          ปิด
          <input type="time" value={close} disabled={!canEdit} onChange={(e) => setClose(e.target.value)} className="h-9 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2 font-mono text-sm" />
        </label>
        {canEdit && dirty && (
          <button onClick={() => run(open, close)} disabled={saving} className="h-9 px-3 rounded-md bg-brand hover:bg-brand-dark text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving && <Loader2 size={13} className="animate-spin" />}บันทึก
          </button>
        )}
      </div>
      <p className="text-xs text-ink-soft dark:text-white/60">
        {hours.custom ? (
          <>
            ตั้งเฉพาะสาขานี้ · ค่ามาตรฐาน {std}
            {canEdit && (
              <>
                {" · "}
                <button onClick={() => run(null, null)} disabled={saving} className="text-brand hover:underline">
                  ใช้ค่ามาตรฐาน
                </button>
              </>
            )}
          </>
        ) : (
          <>ใช้ค่ามาตรฐาน {std}</>
        )}
      </p>
      {msg && <p className={msg.kind === "ok" ? "text-xs text-status-healthy" : "text-xs text-status-offline"}>{msg.text}</p>}
    </fieldset>
  );
}
