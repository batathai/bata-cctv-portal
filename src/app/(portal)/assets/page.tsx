"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Server, FileText, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ZONES } from "@/lib/mockData";
import { zoneCode, getAreaLabel, regionFromZone } from "@/lib/recovery";
import type { StoreWithAssets } from "@/types/database";

type SortKey = "store_code" | "store_name" | "zone" | "serial" | "cameras" | "status";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "store_code", label: "Store Code" },
  { key: "store_name", label: "Store Name" },
  { key: "zone", label: "Zone" },
  { key: "serial", label: "Serial No." },
  { key: "cameras", label: "Cameras" },
  { key: "status", label: "Status" },
];

function sortValue(s: StoreWithAssets, key: SortKey): string | number {
  switch (key) {
    case "store_code":
      return s.store_code;
    case "store_name":
      return s.store_name;
    case "zone":
      return zoneCode(s.zone);
    case "serial":
      return s.asset?.nvr_serial ?? "";
    case "cameras":
      // Stores with no synced asset have no camera count yet — sort them to
      // the low end (like a blank cell in a spreadsheet) rather than
      // crashing a numeric comparison against `undefined`.
      return s.asset?.camera_total ?? -1;
    case "status":
      return s.overall_status;
  }
}

// useSearchParams() below opts this page into client-side rendering, which
// Next.js requires wrapping in Suspense — see default export at the bottom.
function AssetRegisterContent() {
  const { stores, loading } = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Region/Zone live in the URL (?region=...&zone=...), not just useState, so
  // that opening a store's Details then hitting Back (router.back(), see
  // assets/[code]/page.tsx) returns to this same filtered view instead of
  // resetting to "all" — a plain useState is lost on remount since Back
  // re-mounts this page fresh. Mirrors the same fix on the Dashboard page.
  const regionFilter = searchParams.get("region") ?? "";
  const zoneFilter = searchParams.get("zone") ?? "";
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("store_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function setFilters(next: { region?: string; zone?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextRegion = next.region ?? regionFilter;
    const nextZone = next.zone ?? zoneFilter;
    if (nextRegion) params.set("region", nextRegion);
    else params.delete("region");
    if (nextZone) params.set("zone", nextZone);
    else params.delete("zone");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Zone options narrow to whichever region is selected, so picking
  // "Bangkok" doesn't leave stale Upcountry zone codes (520/530/...)
  // selectable/shown in the Zone dropdown.
  const zoneOptions = regionFilter ? ZONES.filter((z) => z.region === regionFilter) : ZONES;

  const filtered = stores
    .filter((s) => !regionFilter || regionFromZone(s.zone) === regionFilter)
    .filter((s) => !zoneFilter || zoneCode(s.zone) === zoneFilter)
    .filter((s) =>
      (s.store_name + s.store_code + (s.province ?? "") + zoneCode(s.zone) + getAreaLabel(s.zone)).toLowerCase().includes(q.toLowerCase())
    );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function onRegionChange(next: string) {
    // Drop the zone filter if it no longer belongs to the newly-selected
    // region (e.g. was "520" and region switched to "Bangkok").
    const dropZone = next && zoneFilter && regionFromZone(zoneFilter) !== next;
    setFilters({ region: next, zone: dropZone ? "" : undefined });
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading asset register…</div>;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionTitle icon={Server}>Asset Register ({filtered.length})</SectionTitle>
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onChange={onRegionChange} options={["Bangkok", "Upcountry"]} placeholder="Region" />
          <Select value={zoneFilter} onChange={(v) => setFilters({ zone: v })} options={zoneOptions.map((z) => z.code)} placeholder="Zone" />
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store, code, province, zone"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
          <ExportButtons stores={filtered} reportType="asset-register" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-black/5 dark:border-white/10">
              {SORT_COLUMNS.map((col) => (
                <th key={col.key} className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center gap-1 hover:text-ink dark:hover:text-white"
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30" />
                    )}
                  </button>
                </th>
              ))}
              <th className="py-2 pr-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="border-b border-black/5 dark:border-white/5 hover:bg-surface-muted dark:hover:bg-white/5">
                <td className="py-2 pr-3">
                  <Link href={`/assets/${s.store_code}`} className="font-mono text-xs text-brand hover:underline">
                    {s.store_code}
                  </Link>
                </td>
                <td className="py-2 pr-3">{s.store_name}</td>
                <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{zoneCode(s.zone)}</td>
                <td className="py-2 pr-3 font-mono text-xs text-ink-soft dark:text-white/60">{s.asset?.nvr_serial}</td>
                <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{s.asset?.camera_total ?? "—"}</td>
                <td className="py-2 pr-3"><StatusBadge status={s.overall_status} /></td>
                <td className="py-2 pr-3 text-right">
                  <Link
                    href={`/assets/${s.store_code}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
                  >
                    <FileText size={13} /> Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AssetRegisterPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-faint">Loading asset register…</div>}>
      <AssetRegisterContent />
    </Suspense>
  );
}
