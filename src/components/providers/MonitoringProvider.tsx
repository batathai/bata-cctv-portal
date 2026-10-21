"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchMonitoringSnapshot, type MonitoringSnapshot } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { DEFAULT_MONITOR_SETTINGS, monitorHealth, healthIsStale, type MonitorHealth } from "@/lib/monitoring";
import {
  setMonitoredDb,
  setStoreHoursDb,
  muteStoreDb,
  unmuteStoreDb,
  saveMonitorSettingsDb,
  type MonitorSettingsPatch,
} from "@/lib/monitoringWrite";
import type { StoreMonitor } from "@/types/database";

/**
 * Device Offline Monitoring state, kept separate from AppDataProvider (which
 * loads everything once) because this data changes every few minutes: it is
 * re-fetched every 60 s while the tab is visible. The HQ script only writes
 * every `check_interval_minutes`, so polling faster would add nothing.
 */
const POLL_MS = 60_000;

interface MonitoringContextValue extends MonitoringSnapshot {
  loading: boolean;
  health: MonitorHealth;
  stale: boolean;
  monitorByStore: Map<string, StoreMonitor>;
  lastLoadedAt: Date | null;
  refresh: () => Promise<void>;
  setMonitored: (storeIds: string[], monitored: boolean) => Promise<void>;
  setStoreHours: (storeId: string, open: string | null, close: string | null) => Promise<void>;
  muteStore: (storeId: string, until: Date, reason: string) => Promise<void>;
  unmuteStore: (storeId: string) => Promise<void>;
  saveSettings: (patch: MonitorSettingsPatch) => Promise<void>;
}

const MonitoringContext = createContext<MonitoringContextValue | null>(null);

const EMPTY: MonitoringSnapshot = { monitors: [], latestRun: null, settings: DEFAULT_MONITOR_SETTINGS, notInstalled: false, error: null };

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<MonitoringSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchMonitoringSnapshot();
      setSnap(next);
      setLastLoadedAt(new Date());
      setNow(new Date());
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
      else setNow(new Date());
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Demo mode has no database: apply edits to local state so the screens still work.
  const patchLocal = useCallback((storeIds: string[], patch: Partial<StoreMonitor>) => {
    const ids = new Set(storeIds);
    setSnap((s) => ({ ...s, monitors: s.monitors.map((m) => (ids.has(m.store_id) ? { ...m, ...patch } : m)) }));
  }, []);

  const write = useCallback(
    async (dbCall: (sb: any) => Promise<void>, local: () => void) => {
      if (!isSupabaseConfigured) {
        local();
        return;
      }
      await dbCall(createClient());
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<MonitoringContextValue>(() => {
    const monitoredCount = snap.monitors.filter((m) => m.monitored).length;
    const health = monitorHealth({ latestRun: snap.latestRun, settings: snap.settings, monitoredCount, notInstalled: snap.notInstalled, now });
    return {
      ...snap,
      loading,
      health,
      stale: healthIsStale(health),
      monitorByStore: new Map(snap.monitors.map((m) => [m.store_id, m])),
      lastLoadedAt,
      refresh,
      setMonitored: (storeIds, monitored) =>
        write((sb) => setMonitoredDb(sb, storeIds, monitored), () => patchLocal(storeIds, { monitored })),
      setStoreHours: (storeId, open, close) =>
        write(
          (sb) => setStoreHoursDb(sb, storeId, open, close),
          () => patchLocal([storeId], { open_time: open ? `${open}:00` : null, close_time: close ? `${close}:00` : null })
        ),
      muteStore: (storeId, until, reason) =>
        write(
          (sb) => muteStoreDb(sb, storeId, until, reason),
          () => patchLocal([storeId], { muted_until: until.toISOString(), mute_reason: reason.trim() })
        ),
      unmuteStore: (storeId) =>
        write((sb) => unmuteStoreDb(sb, storeId), () => patchLocal([storeId], { muted_until: null, mute_reason: null, muted_by: null })),
      saveSettings: (patch) =>
        write(
          (sb) => saveMonitorSettingsDb(sb, patch),
          () => setSnap((s) => ({ ...s, settings: { ...s.settings, ...patch, updated_at: new Date().toISOString() } }))
        ),
    };
  }, [snap, loading, now, lastLoadedAt, refresh, write, patchLocal]);

  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>;
}

export function useMonitoring() {
  const ctx = useContext(MonitoringContext);
  if (!ctx) throw new Error("useMonitoring must be used inside <MonitoringProvider>");
  return ctx;
}
