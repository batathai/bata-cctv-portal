"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, ListChecks } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/Badge";
import { RecoveryStatusBadge, RecoveryStageBadge } from "@/components/recovery/RecoveryBadges";
import { ZONES } from "@/lib/mockData";
import {
  RECOVERY_STATUSES,
  deriveRecoveryStatus,
  getRecoveryRegion,
  getAreaLabel,
  isStoreChecked,
  isHealthy,
  needsRepair,
  isRepairCompleted,
  isRepairPending,
} from "@/lib/recovery";
import type { OverallStatus, StoreWithAssets } from "@/types/database";

// Device Status display uses the existing overall_status column, relabeled
// so "Healthy" reads as "Online" here — matches the FINAL REQUIREMENT doc's
// Online/Offline/Partial/Unknown wording without adding a parallel field.
const DEVICE_STATUS_OPTIONS = ["Online", "Partial", "View Only", "Offline", "Unknown"];
function toOverallStatus(label: string): OverallStatus {
  return label === "Online" ? "Healthy" : (label as OverallStatus);
}

type Bucket = "all" | "checked" | "normal" | "need_repair" | "under_repair" | "completed";

function bucketMatches(bucket: Bucket, s: StoreWithAssets, audits: any[], tickets: any[]): boolean {
  switch (bucket) {
    case "checked":
      return isStoreChecked(s, audits);
    case "normal":
      return isHealthy(s, tickets);
    case "need_repair":
      return needsRepair(s, tickets);
    case "under_repair":
      return isRepairPending(s, tickets);
    case "completed":
      return isRepairCompleted(s, tickets);
    default:
      return true;
  }
}

const BUCKET_LABELS: Record<Bucket, string> = {
  all: "All Stores",
  checked: "Stores Checked",
  normal: "Normal",
  need_repair: "Need Repair",
  under_repair: "Under Repair",
  completed: "Completed",
};

export default function StoreListPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-faint">Loading store list…</div>}>
      <StoreListInner />
    </Suspense>
  );
}

function StoreListInner() {
  const { stores, audits, tickets, loading } = useAppData();
  const searchParams = useSearchParams();
  const initialBucket = (searchParams.get("bucket") as Bucket) || "all";

  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [vendor, setVendor] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");

  const vendors = useMemo(() => Array.from(new Set(stores.map((s) => s.supplierName).filter(Boolean))), [stores]);

  const filtered = useMemo(() => {
    return stores.filter((s) => {
      if (!bucketMatches(bucket, s, audits, tickets)) return false;
      if (q && !(s.store_name + s.store_code).toLowerCase().includes(q.toLowerCase())) return false;
      if (region && getRecoveryRegion(s.zone) !== region) return false;
      if (area && s.zone !== area) return false;
      if (status && s.overall_status !== toOverallStatus(status)) return false;
      if (vendor && s.supplierName !== vendor) return false;
      if (recoveryStatus && deriveRecoveryStatus(s) !== recoveryStatus) return false;
      return true;
    });
  }, [stores, audits, tickets, bucket, q, region, area, status, vendor, recoveryStatus]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => a.store_code.localeCompare(b.store_code)), [filtered]);

  if (loading) return <div className="text-sm text-ink-faint">Loading store list…</div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <SectionTitle icon={ListChecks}>
            Store List ({sorted.length}) {bucket !== "all" && <span className="text-brand">&middot; {BUCKET_LABELS[bucket]}</span>}
          </SectionTitle>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store name / code"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand w-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {bucket !== "all" && (
            <button
              onClick={() => setBucket("all")}
              className="text-xs font-medium text-brand border border-brand/30 bg-brand-50 rounded-md px-2.5 py-1.5"
            >
              {BUCKET_LABELS[bucket]} ✕
            </button>
          )}
          <Select value={region} onChange={setRegion} options={["BKK", "Country"]} placeholder="Region" />
          <Select value={area} onChange={setArea} options={ZONES.map((z) => z.code)} placeholder="Area" />
          <Select value={status} onChange={setStatus} options={DEVICE_STATUS_OPTIONS} placeholder="Status" />
          <Select value={vendor} onChange={setVendor} options={vendors} placeholder="Vendor" />
          <Select value={recoveryStatus} onChange={setRecoveryStatus} options={RECOVERY_STATUSES} placeholder="Recovery Status" />
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/5">
          {sorted.map((s) => (
            <Link
              key={s.id}
              href={`/recovery/${s.store_code}`}
              className="flex items-center gap-3 py-2.5 hover:bg-surface-muted dark:hover:bg-white/5 -mx-2 px-2 rounded-md flex-wrap"
            >
              <span className="font-mono text-[11px] text-ink-faint w-14 shrink-0">{s.store_code}</span>
              <span className="text-sm text-ink dark:text-white flex-1 min-w-[140px] truncate">{s.store_name}</span>
              <span className="text-xs text-ink-faint hidden sm:inline w-16 shrink-0">{getRecoveryRegion(s.zone)}</span>
              <span className="text-xs text-ink-faint hidden md:inline w-24 shrink-0 truncate">{getAreaLabel(s.zone)}</span>
              <span className="text-xs text-ink-soft dark:text-white/60 hidden lg:inline w-24 shrink-0 truncate">{s.supplierName}</span>
              <StatusBadge status={s.overall_status} />
              <RecoveryStatusBadge status={deriveRecoveryStatus(s)} />
              <RecoveryStageBadge stage={s.recovery_stage ?? (deriveRecoveryStatus(s) === "Normal" ? "Verified" : "Waiting Vendor Quote")} />
            </Link>
          ))}
          {sorted.length === 0 && <p className="text-sm text-ink-faint py-4">No stores match this filter.</p>}
        </div>
      </Card>
    </div>
  );
}
