"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { Card } from "@/components/ui/Card";
import { formatSeen, parseRecipients, shortTime, validateHours } from "@/lib/monitoring";
import { canManageMasterData } from "@/lib/rbac";
import type { MonitorSettings } from "@/types/database";

type NumKey = "check_interval_minutes" | "confirm_cycles" | "late_open_grace_minutes" | "mass_alert_threshold" | "stale_after_minutes";

const NUMS: { key: NumKey; label: string; hint: string; unit: string; min: number; max: number }[] = [
  { key: "check_interval_minutes", label: "ตรวจทุก", hint: "รอบอ่าน iVMS", unit: "นาที", min: 1, max: 60 },
  { key: "confirm_cycles", label: "ยืนยัน Offline เมื่อเห็นติดกัน", hint: "กันหน้าจอยังไม่นิ่ง / หลุดแวบเดียว", unit: "รอบ", min: 1, max: 10 },
  { key: "late_open_grace_minutes", label: "เปิดร้านแล้วยังไม่ Online", hint: "ผ่อนผันหลังเวลาเปิด", unit: "นาที", min: 0, max: 240 },
  { key: "mass_alert_threshold", label: "หลุดพร้อมกันกี่สาขา → เมลรวมฉบับเดียว", hint: "และเตือนว่าอาจเป็นปัญหาฝั่งกลาง", unit: "สาขา", min: 2, max: 500 },
  { key: "stale_after_minutes", label: 'ไม่มีรายงานเกิน → "ระบบตรวจหยุดทำงาน"', hint: "แบนเนอร์แดงในทุกหน้า", unit: "นาที", min: 5, max: 240 },
];

/** Tab 4 of /status: recipients, standard hours and thresholds. The HQ script re-reads these every cycle. */
export function MonitorSettingsTab() {
  const { role } = useAppData();
  const { settings, monitors, saveSettings } = useMonitoring();
  const canEdit = canManageMasterData(role);
  const [form, setForm] = useState(() => toForm(settings));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => setForm(toForm(settings)), [settings]);

  const customHours = monitors.filter((m) => m.open_time && m.close_time).length;

  async function save() {
    setMsg(null);
    const alert = parseRecipients(form.alert);
    const admin = parseRecipients(form.admin);
    const bad = [...alert.invalid, ...admin.invalid];
    if (bad.length) return setMsg({ kind: "err", text: `อีเมลไม่ถูกต้อง: ${bad.join(", ")}` });
    const hoursErr = validateHours(form.open, form.close);
    if (hoursErr) return setMsg({ kind: "err", text: hoursErr });
    for (const n of NUMS) {
      const v = Number(form[n.key]);
      if (!Number.isInteger(v) || v < n.min || v > n.max) return setMsg({ kind: "err", text: `${n.label}: ต้องเป็นจำนวนเต็ม ${n.min}–${n.max}` });
    }
    const ratio = Number(form.suspectPct) / 100;
    if (!(ratio > 0 && ratio <= 1)) return setMsg({ kind: "err", text: "เปอร์เซ็นต์ปัญหาฝั่งกลางต้องอยู่ระหว่าง 1–100" });

    setSaving(true);
    try {
      await saveSettings({
        alert_recipients: alert.emails,
        admin_recipients: admin.emails,
        default_open_time: form.open,
        default_close_time: form.close,
        morning_summary_time: form.summary,
        emails_enabled: form.emailsEnabled,
        suspect_ratio: Math.round(ratio * 100) / 100,
        ...Object.fromEntries(NUMS.map((n) => [n.key, Number(form[n.key])])),
      });
      setMsg({ kind: "ok", text: "บันทึกแล้ว — สคริปต์ที่ HQ ใช้ค่าใหม่ในรอบตรวจถัดไป" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  const input = "h-10 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 text-sm disabled:opacity-60";
  const area = "w-full rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-2 font-mono text-sm resize-y disabled:opacity-60";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] items-start">
        <Card className="p-5 space-y-4">
          <h2 className="font-display font-semibold text-sm text-ink dark:text-white">ผู้รับเมล</h2>
          <label className="block text-sm font-semibold">
            แจ้งเตือนสาขาหลุด / กลับมา / สรุปเช้า
            <textarea rows={3} disabled={!canEdit} value={form.alert} onChange={(e) => setForm({ ...form, alert: e.target.value })} placeholder="อีเมลละบรรทัด" className={`mt-1.5 ${area}`} />
          </label>
          <label className="block text-sm font-semibold">
            ผู้ดูแลระบบตรวจ (เมลเมื่อตัวตรวจล้ม)
            <textarea rows={2} disabled={!canEdit} value={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.value })} placeholder="อีเมลละบรรทัด" className={`mt-1.5 ${area}`} />
          </label>
          <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
            <span>
              <span className="block font-semibold">ส่งเมลแจ้งเตือน</span>
              <span className="block text-xs text-ink-faint">ปิดไว้ระหว่างทดสอบ — ยังบันทึกสถานะและประวัติ</span>
            </span>
            <input type="checkbox" disabled={!canEdit} checked={form.emailsEnabled} onChange={(e) => setForm({ ...form, emailsEnabled: e.target.checked })} className="w-5 h-5 accent-brand" />
          </label>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-display font-semibold text-sm text-ink dark:text-white">เวลาทำการมาตรฐาน</h2>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm text-ink-soft dark:text-white/60">
              เปิด
              <input type="time" disabled={!canEdit} value={form.open} onChange={(e) => setForm({ ...form, open: e.target.value })} className={`${input} font-mono`} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-soft dark:text-white/60">
              ปิด
              <input type="time" disabled={!canEdit} value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} className={`${input} font-mono`} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-soft dark:text-white/60">
              ส่งสรุปเช้าเวลา
              <input type="time" disabled={!canEdit} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className={`${input} font-mono`} />
            </label>
          </div>
          <p className="text-xs text-ink-faint">ใช้กับทุกสาขาที่ไม่ได้ตั้งเวลาเอง (ตอนนี้ {customHours} สาขาตั้งเอง — แก้ได้ในหน้า Store Detail)</p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>หลุดในเวลาทำการ → เมลทันที</li>
            <li>หลุดนอกเวลาทำการ → รวมในเมลสรุปเช้า</li>
            <li>เปิดร้านแล้ว {form.late_open_grace_minutes} นาทียังไม่ Online → เมลทันที</li>
          </ul>
        </Card>

        <Card className="p-5 space-y-3.5">
          <h2 className="font-display font-semibold text-sm text-ink dark:text-white">การตรวจ</h2>
          {NUMS.map((n) => (
            <label key={n.key} className="grid grid-cols-[1fr_auto] gap-3 items-center text-sm">
              <span>
                <span className="block font-semibold">{n.label}</span>
                <span className="block text-xs text-ink-faint">{n.hint}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <input
                  inputMode="numeric"
                  disabled={!canEdit}
                  value={form[n.key]}
                  onChange={(e) => setForm({ ...form, [n.key]: e.target.value })}
                  className={`${input} w-16 text-right font-mono`}
                />
                <span className="text-xs text-ink-soft w-9">{n.unit}</span>
              </span>
            </label>
          ))}
          <label className="grid grid-cols-[1fr_auto] gap-3 items-center text-sm">
            <span>
              <span className="block font-semibold">Offline เกินกี่ % ถือว่าฝั่งกลางล่ม</span>
              <span className="block text-xs text-ink-faint">ไม่เปลี่ยนสถานะใคร ส่งเมลผู้ดูแล</span>
            </span>
            <span className="flex items-center gap-1.5">
              <input inputMode="numeric" disabled={!canEdit} value={form.suspectPct} onChange={(e) => setForm({ ...form, suspectPct: e.target.value })} className={`${input} w-16 text-right font-mono`} />
              <span className="text-xs text-ink-soft w-9">%</span>
            </span>
          </label>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {msg && <span className={msg.kind === "ok" ? "text-sm text-status-healthy" : "text-sm text-status-offline"}>{msg.text}</span>}
        <span className="text-xs text-ink-faint">แก้ไขล่าสุด {settings.updated_at && new Date(settings.updated_at).getTime() > 0 ? formatSeen(settings.updated_at) : "—"}</span>
        {canEdit && (
          <button onClick={save} disabled={saving} className="h-11 px-5 rounded-md bg-brand hover:bg-brand-dark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}บันทึก
          </button>
        )}
      </div>
    </div>
  );
}

function toForm(s: MonitorSettings) {
  return {
    alert: s.alert_recipients.join("\n"),
    admin: s.admin_recipients.join("\n"),
    open: shortTime(s.default_open_time),
    close: shortTime(s.default_close_time),
    summary: shortTime(s.morning_summary_time),
    emailsEnabled: s.emails_enabled,
    suspectPct: String(Math.round(Number(s.suspect_ratio) * 100)),
    check_interval_minutes: String(s.check_interval_minutes),
    confirm_cycles: String(s.confirm_cycles),
    late_open_grace_minutes: String(s.late_open_grace_minutes),
    mass_alert_threshold: String(s.mass_alert_threshold),
    stale_after_minutes: String(s.stale_after_minutes),
  };
}
