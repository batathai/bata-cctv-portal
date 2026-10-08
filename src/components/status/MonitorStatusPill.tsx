import clsx from "clsx";
import { DISPLAY_STATUS_LABEL, type DisplayStatus } from "@/lib/monitoring";

const STYLE: Record<DisplayStatus, { pill: string; dot: string }> = {
  Offline: { pill: "bg-status-offline/10 text-brand-dark dark:text-brand-light", dot: "bg-status-offline" },
  Muted: { pill: "bg-black/5 text-ink-soft dark:bg-white/10 dark:text-white/70", dot: "bg-ink-soft" },
  Confirming: { pill: "bg-status-partial/15 text-[#8A5A00] dark:text-status-partial", dot: "bg-status-partial" },
  Online: { pill: "bg-status-healthy/10 text-[#17804A] dark:text-status-healthy", dot: "bg-status-healthy" },
  Unknown: { pill: "bg-black/5 text-ink-soft dark:bg-white/10 dark:text-white/70", dot: "bg-status-unknown" },
  Stale: { pill: "bg-status-partial/10 text-[#6E4700] dark:text-status-partial", dot: "bg-status-partial" },
  NotMonitored: { pill: "border border-black/10 text-ink-faint dark:border-white/15 dark:text-white/50", dot: "bg-black/20 dark:bg-white/30" },
};

/** Online/Offline pill for the iVMS monitor. The Offline dot pulses (off when the OS asks for reduced motion). */
export function MonitorStatusPill({ status, className }: { status: DisplayStatus; className?: string }) {
  const s = STYLE[status];
  return (
    <span className={clsx("inline-flex items-center gap-2 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap", s.pill, className)}>
      <span className="relative inline-flex w-2 h-2">
        {status === "Offline" && (
          <span className={clsx("absolute inset-0 rounded-full animate-ping motion-reduce:animate-none opacity-60", s.dot)} />
        )}
        <span className={clsx("relative inline-flex w-2 h-2 rounded-full", s.dot)} />
      </span>
      {DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}
