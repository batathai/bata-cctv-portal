import { Card } from "./Card";
import clsx from "clsx";

export function StatCard({
  label,
  value,
  colorClass,
  active,
  onClick,
  hint,
}: {
  label: string;
  value: string | number;
  colorClass?: string;
  active?: boolean;
  onClick?: () => void;
  /** Optional one-line explanation under the number. */
  hint?: string;
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
      <div className="text-xs uppercase tracking-wide text-ink-faint mb-2">{label}</div>
      <div className={clsx("font-display text-2xl font-bold", colorClass ?? "text-ink dark:text-white")}>{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-ink-faint">{hint}</div>}
    </Card>
  );
}
