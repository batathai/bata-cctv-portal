"use client";

import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onChange,
  options,
  placeholder,
  variant = "compact",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  /** "compact" (default) is the original inline-filter sizing used in
   * TopBar/list filters — unchanged. "full" stretches to fill its
   * container and matches the text-sm/py-2 sizing of the text <input>s
   * used in edit forms (e.g. EditAssetModal), so a dropdown sitting next
   * to regular fields in a form doesn't look shrunken. */
  variant?: "compact" | "full";
}) {
  const isFull = variant === "full";
  return (
    <div className={`relative ${isFull ? "w-full" : ""}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          isFull
            ? "w-full appearance-none bg-surface-muted dark:bg-white/5 border border-black/10 dark:border-white/10 text-ink dark:text-white rounded-md pl-3 pr-8 py-2 text-sm outline-none cursor-pointer focus:border-brand"
            : "appearance-none bg-surface-muted dark:bg-white/5 border border-black/10 dark:border-white/10 text-ink dark:text-white rounded-md pl-3 pr-7 py-1.5 text-xs outline-none cursor-pointer focus:border-brand"
        }
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={isFull ? 14 : 12} className={`absolute ${isFull ? "right-3 top-3" : "right-2 top-2.5"} pointer-events-none text-ink-faint`} />
    </div>
  );
}
