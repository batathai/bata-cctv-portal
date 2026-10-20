"use client";

import Link from "next/link";
import clsx from "clsx";
import { Wrench } from "lucide-react";
import { formatDuration, formatSeen, REPAIR_SUGGEST_MINUTES, type DisplayStatus } from "@/lib/monitoring";
import { hasOpenTicket } from "@/lib/tickets";
import type { IncidentTicket, StoreMonitor, StoreWithAssets, TicketIssueType } from "@/types/database";

/**
 * Why a store needs a repair ticket, from the sync result + what people
 * reported (decision 2026-10-11):
 *  - "dvr":    DVR offline for REPAIR_SUGGEST_MINUTES or longer (not muted)
 *  - "camera": DVR online, but someone marked the store Partial = cameras
 *              can't be viewed (stores.camera_issue / overall_status Partial)
 */
export type RepairReason = { kind: "dvr" | "camera"; issue: TicketIssueType; note: string };

export const CAMERA_ISSUE_REMARK = "DVR Online แต่ดูกล้องไม่ได้ — เปิดงานให้ช่างซ่อม";

export function repairReason(
  store: StoreWithAssets,
  monitor: StoreMonitor | null | undefined,
  status: DisplayStatus,
  offlineMinutes: number | null
): RepairReason | null {
  if (status === "Offline" && (offlineMinutes ?? 0) >= REPAIR_SUGGEST_MINUTES) {
    return {
      kind: "dvr",
      issue: "NVR Offline",
      note: `DVR Offline จาก Hik-Partner Pro ตั้งแต่ ${formatSeen(monitor?.last_seen_at ?? monitor?.state_since)} (${formatDuration(offlineMinutes)})`,
    };
  }
  if ((status === "Online" || status === "Confirming" || status === "CameraIssue") && store.overall_status === "Partial") {
    return { kind: "camera", issue: "Camera Failure", note: `${CAMERA_ISSUE_REMARK} (sync ล่าสุด ${formatSeen(monitor?.last_checked_at ?? monitor?.last_seen_at)})` };
  }
  return null;
}

/**
 * Dashboard "Repair" card (decision 2026-10-12, option ข): stores that should
 * get a repair ticket (red or amber wrench) but don't have an open one yet.
 */
export function pendingRepairKind(
  row: { store: StoreWithAssets; monitor: StoreMonitor | null; status: DisplayStatus; offlineMinutes: number | null },
  tickets: IncidentTicket[]
): RepairReason["kind"] | null {
  const reason = repairReason(row.store, row.monitor, row.status, row.offlineMinutes);
  if (!reason || hasOpenTicket(row.store.id, tickets)) return null;
  return reason.kind;
}

const iconBtn =
  "inline-flex items-center justify-center w-8 h-8 rounded-md border border-black/10 dark:border-white/10 hover:bg-surface-muted dark:hover:bg-white/5";

/** Red wrench → New Ticket form pre-filled; grey wrench → the store already has an open ticket. */
export function RepairLink({ store, reason, tickets }: { store: StoreWithAssets; reason: RepairReason; tickets: IncidentTicket[] }) {
  const open = hasOpenTicket(store.id, tickets);
  const label = open
    ? "มีเคสซ่อมเปิดอยู่แล้ว — ดูเคส"
    : reason.kind === "camera"
    ? "เปิดเคสซ่อมกล้อง (DVR Online แต่ดูกล้องไม่ได้)"
    : `เปิดเคสซ่อม (${reason.note})`;
  const href = open
    ? `/assets/${store.store_code}#tickets`
    : `/assets/${store.store_code}?newTicket=${encodeURIComponent(reason.issue)}&note=${encodeURIComponent(reason.note)}#tickets`;
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={clsx(
        iconBtn,
        open
          ? "text-ink-faint"
          : reason.kind === "camera"
          ? "text-[#8A5A00] dark:text-status-partial border-status-partial/50 bg-status-partial/10"
          : "text-status-offline border-status-offline/40 bg-status-offline/5"
      )}
    >
      <Wrench size={15} />
    </Link>
  );
}
