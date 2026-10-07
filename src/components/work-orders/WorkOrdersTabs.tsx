"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Wrench, KanbanSquare } from "lucide-react";

/**
 * Sub-tabs inside the Work Orders section: "งานซ่อม" (the pre-existing
 * repair Job batches / tickets flow) and "ติดตั้งกล้องใหม่" (Installation
 * Project, moved here from its own top-level Sidebar entry so both flows
 * live under one Work Orders menu item — see docs/workflow/STATUS.md).
 */
const TABS = [
  { href: "/work-orders", label: "งานซ่อม (Repair Jobs)", icon: Wrench },
  { href: "/work-orders/installation", label: "ติดตั้งกล้องใหม่ (Installation Project)", icon: KanbanSquare },
];

export function WorkOrdersTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-black/5 dark:border-white/10 -mt-1">
      {TABS.map((tab) => {
        const active = tab.href === "/work-orders" ? pathname === "/work-orders" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 border-b-2 -mb-px transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-ink-faint hover:text-ink-soft dark:hover:text-white/70"
            )}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
