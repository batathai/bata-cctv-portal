"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { fetchSerialHistory } from "@/lib/data";
import type { DeviceSerialChange, StoreWithAssets } from "@/types/database";

/** Store Detail: DVR serial changes for this store, "old → new", newest first (migration 027). */
export function SerialHistoryCard({ store }: { store: StoreWithAssets }) {
  const [rows, setRows] = useState<DeviceSerialChange[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSerialHistory(store.id).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [store.id]);

  if (rows === null) return <p className="text-sm text-ink-faint">กำลังโหลด…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink-faint">ยังไม่มีประวัติการเปลี่ยน Serial ของสาขานี้</p>;

  return (
    <ul className="divide-y divide-black/5 dark:divide-white/5">
      {rows.map((r) => (
        <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <span className="text-ink-soft dark:text-white/60">{r.old_serial ?? "ไม่มีข้อมูล"}</span>
            <ArrowRight size={14} className="text-ink-faint shrink-0" aria-label="เปลี่ยนเป็น" />
            <span className="font-semibold text-ink dark:text-white">{r.new_serial}</span>
          </div>
          <div className="text-xs text-ink-faint mt-0.5">
            เปลี่ยนเมื่อ {new Date(r.changed_on).toLocaleDateString("th-TH", { dateStyle: "medium" })} &middot; ที่มา: {r.source}
            {r.note && <> &middot; {r.note}</>}
          </div>
        </li>
      ))}
    </ul>
  );
}
