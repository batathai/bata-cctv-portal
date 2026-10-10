"use client";

import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useMonitoring } from "@/components/providers/MonitoringProvider";
import { formatDuration, formatSeen } from "@/lib/monitoring";

/**
 * Top-of-page strip that says whether the HQ script is alive and the data is
 * trustworthy. The important case is "stale": when the script goes quiet we
 * say so loudly instead of letting every store look Offline (R6).
 */
export function MonitorHealthBanner({ onGoRollout }: { onGoRollout?: () => void }) {
  const { health, latestRun, settings, error, refresh, loading } = useMonitoring();
  if (loading) return null;

  // User request 2026-10-10: show the coloured strip only when the numbers on
  // screen can't be trusted (script silent, never ran, DB missing, central
  // outage). Routine states — ok, one failed read, page full, count mismatch —
  // show just the reload button; the admin still gets the "failed 3 times"
  // email and the Rollout tab still shows the count mismatch.
  const warn = health.kind === "stale" || health.kind === "never" || health.kind === "notInstalled" || health.kind === "suspect";
  if (!warn) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => refresh()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-white/60 underline-offset-2 hover:underline hover:text-ink dark:hover:text-white"
          aria-label="โหลดสถานะใหม่"
        >
          <RefreshCw size={12} /> โหลดใหม่
        </button>
      </div>
    );
  }

  const lastRun = latestRun ? formatSeen(latestRun.ran_at) : "—";
  const tone =
    health.kind === "ok" ? "ok" : health.kind === "stale" || health.kind === "failed" || health.kind === "suspect" || health.kind === "notInstalled" ? "bad" : "warn";

  let title = "";
  let detail: React.ReactNode = null;
  switch (health.kind) {
    case "ok":
      title = "ตัวตรวจทำงานปกติ";
      detail = `ตรวจล่าสุด ${lastRun} น. · ทุก ${settings.check_interval_minutes} นาที · iVMS ${health.ivmsTotal ?? "—"} เครื่อง · portal ติ๊กไว้ ${health.monitoredCount} ตรงกัน`;
      break;
    case "stale":
      title = "ระบบตรวจหยุดทำงาน";
      detail = `ไม่มีรายงานจากคอม HQ มา ${formatDuration(health.minutesSinceRun)} (ล่าสุด ${lastRun}) — สถานะด้านล่างเป็นข้อมูลเก่า ไม่ใช่ Offline ทั้งหมด · เช็ก: คอม HQ เปิดอยู่ไหม, iVMS เปิดค้างหน้า Cloud P2P, จอไม่ล็อก`;
      break;
    case "never":
      title = "ยังไม่มีรายงานจากตัวตรวจ";
      detail = "ติดตั้งสคริปต์ tools/ivms-monitor บนคอม HQ แล้วสถานะจะเริ่มขึ้นภายในไม่กี่นาที";
      break;
    case "notInstalled":
      title = "ยังไม่ได้ติดตั้งฐานข้อมูลส่วนนี้";
      detail = "รัน supabase/migrations/022_device_monitoring.sql ใน Supabase SQL Editor ก่อน";
      break;
    case "failed":
      title = "รอบตรวจล่าสุดอ่าน iVMS ไม่ได้";
      detail = `${lastRun} น. · ${latestRun?.error ?? "ไม่ทราบสาเหตุ"} — สถานะยังเป็นของรอบก่อนหน้า`;
      break;
    case "suspect":
      title = "สงสัยปัญหาฝั่งกลาง";
      detail = `รอบ ${lastRun} น. เห็น Offline ${latestRun?.offline_count ?? "?"} จาก ${latestRun?.ivms_total ?? "?"} เครื่อง — ไม่เปลี่ยนสถานะสาขา เช็กเน็ต HQ / Hik-Connect`;
      break;
    case "partial":
      title = `Offline เต็มหน้าจอ iVMS (${latestRun?.offline_count ?? "?"} แถว)`;
      detail = "อาจมีมากกว่านี้ สาขาที่มองไม่เห็นคงสถานะเดิมไว้ก่อน";
      break;
    case "mismatch":
      title = "จำนวนเครื่องไม่ตรงกัน";
      detail = (
        <>
          iVMS มี {health.ivmsTotal} เครื่อง แต่ portal ติ๊ก monitored ไว้ {health.monitoredCount} สาขา
          {onGoRollout && (
            <>
              {" "}
              ·{" "}
              <button onClick={onGoRollout} className="underline font-medium">
                ตรวจในแท็บ Rollout
              </button>
            </>
          )}
        </>
      );
      break;
  }

  const Icon = tone === "ok" ? CheckCircle2 : health.kind === "notInstalled" ? Database : AlertTriangle;

  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={clsx(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3 text-sm",
        tone === "ok" && "bg-status-healthy/10 border-status-healthy/30 text-[#155E39] dark:text-status-healthy",
        tone === "warn" && "bg-status-partial/10 border-status-partial/40 text-[#6E4700] dark:text-status-partial",
        tone === "bad" && "bg-status-offline/10 border-status-offline/30 text-brand-dark dark:text-brand-light"
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="font-semibold">{title}</span>
      <span className="min-w-0">{detail}</span>
      {error && health.kind !== "notInstalled" && <span className="text-xs opacity-80">({error})</span>}
      <button
        onClick={() => refresh()}
        className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline"
        aria-label="โหลดสถานะใหม่"
      >
        <RefreshCw size={12} /> โหลดใหม่
      </button>
    </div>
  );
}
