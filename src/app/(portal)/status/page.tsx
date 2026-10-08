"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useAppData } from "@/components/providers/AppDataProvider";
import { MonitorHealthBanner } from "@/components/status/MonitorHealthBanner";
import { LiveStatusTab } from "@/components/status/LiveStatusTab";
import { OutageHistoryTab } from "@/components/status/OutageHistoryTab";
import { RolloutTab } from "@/components/status/RolloutTab";
import { MonitorSettingsTab } from "@/components/status/MonitorSettingsTab";

const TABS = [
  { key: "live", label: "สถานะสด" },
  { key: "history", label: "ประวัติการหลุด" },
  { key: "rollout", label: "Rollout" },
  { key: "settings", label: "ตั้งค่า" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Device Status — live DVR Online/Offline read from iVMS-4200 at HQ by the
 * script in tools/ivms-monitor (Device Offline Monitoring feature).
 * Camera health from Survey (`overall_status`) is shown as a secondary line
 * per store and no longer drives this page's counts.
 * Design: docs/workflow/DESIGN-device-offline-monitoring.md
 */
function DeviceStatusInner() {
  const { loading } = useAppData();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "live";

  function go(next: TabKey) {
    const sp = new URLSearchParams(params.toString());
    if (next === "live") sp.delete("tab");
    else sp.set("tab", next);
    if (next !== "history") sp.delete("q");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading device status…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink dark:text-white">Device Status</h1>
        <p className="text-sm text-ink-soft dark:text-white/60">สถานะ DVR ของสาขา อ่านจาก iVMS-4200 ที่ HQ อัตโนมัติ</p>
      </div>

      <div role="tablist" aria-label="Device Status" className="flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={clsx(
              "h-10 px-3.5 text-sm -mb-px border-b-2 transition-colors",
              tab === t.key ? "border-brand text-brand font-semibold" : "border-transparent text-ink-soft dark:text-white/60 hover:text-ink dark:hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <MonitorHealthBanner onGoRollout={() => go("rollout")} />

      {tab === "live" && <LiveStatusTab />}
      {tab === "history" && <OutageHistoryTab initialQuery={params.get("q") ?? ""} />}
      {tab === "rollout" && <RolloutTab />}
      {tab === "settings" && <MonitorSettingsTab />}
    </div>
  );
}

export default function DeviceStatusPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-faint">Loading device status…</div>}>
      <DeviceStatusInner />
    </Suspense>
  );
}
