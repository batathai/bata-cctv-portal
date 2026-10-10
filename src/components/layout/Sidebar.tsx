"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Server, FileBarChart, Camera, X, ClipboardList, ClipboardCheck, Wifi,
} from "lucide-react";
import { useMonitoring } from "@/components/providers/MonitoringProvider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/status", label: "Device Status", icon: Wifi },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { href: "/assets", label: "Asset Register", icon: Server },
  { href: "/survey", label: "Survey", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { monitors, stale } = useMonitoring();
  // Unmuted, monitored stores currently Offline — hidden when the data is stale.
  const now = Date.now();
  const offlineCount = stale
    ? 0
    : monitors.filter((m) => m.monitored && m.state === "Offline" && !(m.muted_until && new Date(m.muted_until).getTime() > now)).length;

  return (
    <>
      {mobileOpen && <div onClick={onClose} className="fixed inset-0 bg-black/40 z-30 lg:hidden" />}
      <aside
        className={clsx(
          "fixed lg:static z-40 top-0 left-0 h-full w-64 bg-white dark:bg-surface-dark border-r border-black/5 dark:border-white/10 flex flex-col transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center text-white shrink-0">
              <Camera size={17} />
            </div>
            <div>
              <div className="font-display font-bold text-sm text-ink dark:text-white leading-tight">BATA CCTV</div>
              <div className="text-[10px] text-ink-faint tracking-wider">COMMAND CENTER</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-ink-faint">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm mb-0.5 transition-colors",
                  active
                    ? "bg-brand-50 text-brand font-semibold dark:bg-brand/15"
                    : "text-ink-soft hover:bg-surface-muted dark:text-white/70 dark:hover:bg-white/5"
                )}
              >
                <Icon size={16} />
                {item.label}
                {item.href === "/status" && offlineCount > 0 && (
                  <span
                    className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center"
                    aria-label={`${offlineCount} สาขา Offline`}
                  >
                    {offlineCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-black/5 dark:border-white/10 text-[11px] text-ink-faint">
          Pilot: 50 stores &middot; scaling to 500+
        </div>
      </aside>
    </>
  );
}
