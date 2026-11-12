import { Card } from "./Card";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  colorClass,
  active,
  onClick,
  hint,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string | number;
  colorClass?: string;
  active?: boolean;
  onClick?: () => void;
  /** Optional one-line explanation under the number. */
  hint?: string;
  /** Optional status symbol shown left of the number, in a filled circle. */
  icon?: LucideIcon;
  /** Background + text colour classes for the icon circle. */
  iconClass?: string;
}) {
  return (
    <Card
      onClick={onClick}
      className={clsx(
        "flex-1 min-w-[140px] p-4 transition-shadow",
        onClick && "cursor-pointer hover:shadow-md",
        active && "ring-2 ring-brand"
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", iconClass ?? "bg-black/5 text-ink-soft dark:bg-white/10 dark:text-white/70")}>
            <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-ink-faint mb-1">{label}</div>
          <div className={clsx("font-display text-2xl font-bold", colorClass ?? "text-ink dark:text-white")}>{value}</div>
          {hint && <div className="mt-1 text-[11px] leading-snug text-ink-faint">{hint}</div>}
        </div>
      </div>
    </Card>
  );
}
