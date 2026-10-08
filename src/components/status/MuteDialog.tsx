"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import clsx from "clsx";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { MAX_MUTE_DAYS, validateMute } from "@/lib/monitoring";
import type { StoreWithAssets } from "@/types/database";

const REASONS = ["ห้าง/สาขาปิดปรับปรุง", "รอช่างเข้าซ่อม", "ปิดสาขาถาวร / ย้ายสาขา", "อื่น ๆ"];
type Preset = "tomorrow" | "7d" | "custom";

function tomorrowMorningBangkok(now: Date): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(now.getTime() + 86400000)
  );
  return new Date(`${key}T10:00:00+07:00`);
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Mute one store: reason + expiry are required, max 30 days (R8). Outages are still recorded while muted. */
export function MuteDialog({ store, onClose }: { store: StoreWithAssets; onClose: () => void }) {
  const { muteStore } = useMonitoring();
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 3 * 86400000)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const until = useMemo(() => {
    const now = new Date();
    if (preset === "tomorrow") return tomorrowMorningBangkok(now);
    if (preset === "7d") return new Date(now.getTime() + 7 * 86400000);
    const d = new Date(custom);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [preset, custom]);

  const fullReason = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
  const untilLabel = until
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(until)
    : "—";

  async function save() {
    const msg = validateMute(until, fullReason);
    if (msg) return setError(msg);
    setSaving(true);
    setError(null);
    try {
      await muteStore(store.id, until!, fullReason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mute ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const chip = (p: Preset, label: string) => (
    <button
      type="button"
      onClick={() => setPreset(p)}
      aria-pressed={preset === p}
      className={clsx(
        "h-9 px-3 rounded-full border text-sm",
        preset === p ? "bg-ink text-white border-ink dark:bg-white dark:text-ink" : "border-black/10 dark:border-white/15 hover:bg-surface-muted dark:hover:bg-white/5"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="mute-title" className="w-full max-w-md bg-white dark:bg-surface-dark rounded-card shadow-xl border border-black/5 dark:border-white/10 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mute-title" className="font-display font-bold text-base text-ink dark:text-white">
              ปิดเตือน {store.store_code} {store.store_name}
            </h2>
            <p className="text-sm text-ink-soft dark:text-white/60 mt-1">ระหว่างนี้จะไม่ส่งเมลของสาขานี้ แต่ยังบันทึกสถานะและประวัติตามปกติ</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-semibold text-ink dark:text-white">
          เหตุผล (จำเป็น)
          <select
            ref={firstField}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 w-full h-10 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 text-sm font-normal"
          >
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-ink dark:text-white">
          รายละเอียด{reason === "อื่น ๆ" ? " (จำเป็น)" : ""}
          <textarea
            rows={2}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="เช่น ห้างปิดซ่อมระบบไฟชั้น 2 แจ้งโดย DM"
            className="mt-1.5 w-full rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-2 text-sm font-normal resize-y"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink dark:text-white mb-2">ปิดเตือนถึง (จำเป็น, สูงสุด {MAX_MUTE_DAYS} วัน)</legend>
          <div className="flex flex-wrap gap-2">
            {chip("tomorrow", "พรุ่งนี้ 10:00")}
            {chip("7d", "7 วัน")}
            {chip("custom", "กำหนดเอง")}
          </div>
          {preset === "custom" && (
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="วันเวลาที่หมดอายุ"
              className="h-10 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 text-sm"
            />
          )}
          <p className="text-xs text-ink-soft dark:text-white/60">ถึง {untilLabel} น. — หมดเวลาแล้วกลับมาแจ้งเตือนเอง</p>
        </fieldset>

        {error && <p className="text-sm text-status-offline">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-11 px-4 rounded-md border border-black/10 dark:border-white/15 text-sm font-semibold">
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={saving || (reason === "อื่น ๆ" && !detail.trim())}
            className="h-11 px-4 rounded-md bg-brand hover:bg-brand-dark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Mute
          </button>
        </div>
      </div>
    </div>
  );
}
