"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ClipboardCheck, ArrowUp, ArrowDown, ArrowUpDown, ClipboardEdit } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/Select";
import { ZONES } from "@/lib/mockData";
import { zoneCode, getAreaLabel, regionFromZone } from "@/lib/recovery";
import type { AuditRecord, StoreWithAssets } from "@/types/database";

type SortKey = "store_code" | "store_name" | "zone" | "last_checked" | "status";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "store_code", label: "Store Code" },
  { key: "store_name", label: "Store Name" },
  { key: "zone", label: "Zone" },
  { key: "last_checked", label: "Last Checked" },
  { key: "status", label: "Status" },
];

function latestAuditFor(storeId: string, audits: AuditRecord[]): AuditRecord | null {
  const forStore = audits.filter((a) => a.store_id === storeId);
  if (forStore.length === 0) return null;
  return [...forStore].sort((a, b) => (a.audit_date < b.audit_date ? 1 : -1))[0];
}

// useSearchParams() below opts this page into client-side rendering, which
// Next.js requires wrapping in Suspense — see default export at the bottom.
function SurveyContent() {
  const { stores, audits, loading } = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Region/Zone live in the URL, same fix as Asset Register (see its
  // comment) — so Back from a store's checklist returns to the same
  // filtered view instead of resetting.
  const regionFilter = searchParams.get("region") ?? "";
  const zoneFilter = searchParams.get("zone") ?? "";
  const [q, setQ] = useState("");
  const [checkedFilter, setCheckedFilter] = useState<"all" | "checked" | "not_checked">("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_checked");
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

  function onRegionChange(next: string) {
    const dropZone = next && zoneFilter && regionFromZone(zoneFilter) !== next;
    setFilters({ region: next, zone: dropZone ? "" : undefined });
  }

  const zoneOptions = regionFilter ? ZONES.filter((z) => z.region === regionFilter) : ZONES;

  const lastCheckedByStore = useMemo(() => {
    const m = new Map<string, AuditRecord | null>();
    stores.forEach((s) => m.set(s.id, latestAuditFor(s.id, audits)));
    return m;
  }, [stores, audits]);

  const checkedCount = useMemo(() => stores.filter((s) => lastCheckedByStore.get(s.id) != null).length, [stores, lastCheckedByStore]);

  const filtered = stores
    .filter((s) => !regionFilter || regionFromZone(s.zone) === regionFilter)
    .filter((s) => !zoneFilter || zoneCode(s.zone) === zoneFilter)
    .filter((s) => {
      const last = lastCheckedByStore.get(s.id);
      if (checkedFilter === "checked") return last != null;
      if (checkedFilter === "not_checked") return last == null;
      return true;
    })
    .filter((s) => (s.store_name + s.store_code + zoneCode(s.zone) + getAreaLabel(s.zone)).toLowerCase().includes(q.toLowerCase()));

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    function value(s: StoreWithAssets): string | number {
      switch (sortKey) {
        case "store_code":
          return s.store_code;
        case "store_name":
          return s.store_name;
        case "zone":
          return zoneCode(s.zone);
        case "last_checked":
          return lastCheckedByStore.get(s.id)?.audit_date ?? "";
        case "status":
          return s.overall_status;
      }
    }
    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir, lastCheckedByStore]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) return <div className="text-sm text-ink-faint">Loading survey…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-lg font-bold text-ink dark:text-white">Survey</h1>
        <p className="text-sm text-ink-faint mt-0.5">
          Field checklist per store — confirm it&apos;s really online, check playback coverage, and record HDD size.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard label="Checked" value={checkedCount} colorClass="text-status-healthy" onClick={() => setCheckedFilter("checked")} active={checkedFilter === "checked"} />
        <StatCard
          label="Not Checked"
          value={stores.length - checkedCount}
          colorClass="text-status-offline"
          onClick={() => setCheckedFilter("not_checked")}
          active={checkedFilter === "not_checked"}
        />
        <StatCard label="Total Stores" value={stores.length} onClick={() => setCheckedFilter("all")} active={checkedFilter === "all"} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionTitle icon={ClipboardCheck}>Stores ({filtered.length})</SectionTitle>
          <div className="flex items-center gap-2">
            <Select value={regionFilter} onChange={onRegionChange} options={["Bangkok", "Upcountry"]} placeholder="Region" />
            <Select value={zoneFilter} onChange={(v) => setFilters({ zone: v })} options={zoneOptions.map((z) => z.code)} placeholder="Zone" />
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search store, code, zone"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-56"
              />
            </div>
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
              {sorted.map((s) => {
                const last = lastCheckedByStore.get(s.id);
                return (
                  <tr key={s.id} className="border-b border-black/5 dark:border-white/5 hover:bg-surface-muted dark:hover:bg-white/5">
                    <td className="py-2 pr-3">
                      <Link href={`/survey/${s.store_code}`} className="font-mono text-xs text-brand hover:underline">
                        {s.store_code}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{s.store_name}</td>
                    <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{zoneCode(s.zone)}</td>
                    <td className="py-2 pr-3 text-ink-soft dark:text-white/60">{last ? last.audit_date : "Never"}</td>
                    <td className="py-2 pr-3"><StatusBadge status={s.overall_status} /></td>
                    <td className="py-2 pr-3 text-right">
                      <Link
                        href={`/survey/${s.store_code}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5"
                      >
                        <ClipboardEdit size={13} /> Survey
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <p className="text-sm text-ink-faint py-4">No stores match the current filter.</p>}
        </div>
      </Card>
    </div>
  );
}

export default function SurveyPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-faint">Loading survey…</div>}>
      <SurveyContent />
    </Suspense>
  );
}
