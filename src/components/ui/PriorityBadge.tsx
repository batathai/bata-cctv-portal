import clsx from "clsx";
import type { PriorityTier } from "@/lib/installation";

/** "Top 20" / "Top 50" pill shown next to a store name (Device Status, Asset Register). */
export function PriorityBadge({ tier }: { tier: PriorityTier | undefined }) {
  if (!tier) return null;
  return (
    <span
      title={tier === "Top 20" ? "สาขายอดขาย Top 20 — ดูด่วนก่อน" : "สาขายอดขาย Top 50 (อันดับ 21–50)"}
      className={clsx(
        "shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold whitespace-nowrap",
        tier === "Top 20" ? "bg-brand text-white" : "border border-brand text-brand"
      )}
    >
      {tier}
    </span>
  );
}
