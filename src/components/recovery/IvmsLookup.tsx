"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { getIvmsLookup } from "@/lib/recovery";
import type { StoreWithAssets } from "@/types/database";

export function IvmsLookup({ store }: { store: StoreWithAssets }) {
  const lookup = getIvmsLookup(store);
  const [copied, setCopied] = useState(false);

  if (!lookup) {
    return <p className="text-xs text-ink-faint">No Serial Number / Hik UID recorded for this device yet</p>;
  }

  async function handleCopy() {
    if (!lookup) return;
    try {
      await navigator.clipboard.writeText(lookup.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (e.g. insecure context) — value is still visible to copy manually.
    }
  }

  return (
    <div>
      <p className="text-[11px] text-ink-faint mb-1">Open iVMS-4200 on your computer, then search using this {lookup.label}</p>
      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-between gap-2 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-2 hover:bg-surface-muted dark:hover:bg-white/5"
      >
        <span className="font-mono">{lookup.value}</span>
        {copied ? <Check size={13} className="text-status-healthy shrink-0" /> : <Copy size={13} className="text-ink-faint shrink-0" />}
      </button>
    </div>
  );
}
