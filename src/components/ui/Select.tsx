"use client";

import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-surface-muted dark:bg-white/5 border border-black/10 dark:border-white/10 text-ink dark:text-white rounded-md pl-3 pr-7 py-1.5 text-xs outline-none cursor-pointer focus:border-brand"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-2.5 pointer-events-none text-ink-faint" />
    </div>
  );
}
