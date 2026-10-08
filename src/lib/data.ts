import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { generateMockData, generateMockMonitoring } from "@/lib/mockData";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/monitoring";
import type { StoreWithAssets, MaintenanceRecord, AuditRecord, VendorQuotation, IncidentTicket, Attachment, RecoveryStageHistoryEntry, WorkOrderBatch, StoreMonitor, MonitorRun, MonitorSettings, DeviceOutage } from "@/types/database";

/**
 * Data access layer. Tries Supabase first; if the project has not been
 * connected yet (no env vars) it transparently falls back to deterministic
 * mock data so the app is fully demoable out of the box.
 *
 * Once Supabase is configured, replace the mock branch's relevance by
 * seeding `supabase/schema.sql` with real rows — no UI code changes needed.
 */
export async function fetchStores(): Promise<StoreWithAssets[]> {
  if (!isSupabaseConfigured) return generateMockData().stores;

  const supabase = createClient();
  const { data: stores, error } = await supabase
    .from("stores")
    .select("*, cctv_assets(*), hikconnect_devices(*), suppliers(name)");

  if (error || !stores) {
    console.error("Supabase fetchStores failed, falling back to demo data:", error?.message);
    return generateMockData().stores;
  }

  return (stores as any[]).map((s) => {
    const asset = Array.isArray(s.cctv_assets) ? s.cctv_assets[0] : s.cctv_assets;
    const hikconnect = Array.isArray(s.hikconnect_devices) ? s.hikconnect_devices[0] : s.hikconnect_devices;
    const cameraOk = asset?.camera_status ? asset.camera_status === "OK" : asset?.camera_failed === 0;
    // A Verified/Completed store is confirmed fixed — treat it as full
    // marks rather than whatever this formula computes off asset
    // sub-fields (nvr_online/playback_status/hdd_status/camera_status),
    // which the Edit Detail form hasn't collected in a long time and so
    // stay frozen at whatever they were on import. Without this, a store
    // could show "Healthy" (see overall_status's Verified sync above) next
    // to a stale, contradictory-looking low Score in the same report row.
    const isVerifiedDone = s.recovery_stage === "Completed" || s.recovery_stage === "Verified";
    const score = isVerifiedDone
      ? 100
      : (asset?.nvr_online ? 30 : 0) +
        (asset?.playback_status === "Working" ? 30 : 0) +
        (asset?.hdd_status === "Healthy" ? 20 : 0) +
        (asset && cameraOk ? 20 : 0);
    return {
      ...s,
      asset: asset ?? null,
      hikconnect: hikconnect ?? null,
      healthScore: score,
      supplierName: s.suppliers?.name ?? "Unassigned",
      is_recovery50: s.is_recovery50 ?? false,
      recovery_status: s.recovery_status ?? null,
      recovery_stage: s.recovery_stage ?? null,
      cause: s.cause ?? null,
      required_action: s.required_action ?? null,
      online_status: s.online_status ?? null,
      camera_status: s.camera_status ?? null,
      add_device_status: s.add_device_status ?? null,
      repair_date: s.repair_date ?? null,
      recovery_notes: s.recovery_notes ?? null,
      batch_id: s.batch_id ?? null,
    } as StoreWithAssets;
  });
}

export async function fetchMaintenance(): Promise<MaintenanceRecord[]> {
  if (!isSupabaseConfigured) return generateMockData().records;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("maintenance_history")
    .select("*")
    .order("issue_date", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchMaintenance failed, falling back to demo data:", error?.message);
    return generateMockData().records;
  }
  return data as MaintenanceRecord[];
}

export async function fetchAudits(): Promise<AuditRecord[]> {
  if (!isSupabaseConfigured) return generateMockData().audits;

  const supabase = createClient();
  const { data, error } = await supabase.from("audit_history").select("*");

  if (error || !data) {
    console.error("Supabase fetchAudits failed, falling back to demo data:", error?.message);
    return generateMockData().audits;
  }
  return data as AuditRecord[];
}

/** Sprint 5 - Work Order "Jobs": groups stores into rounds of work (replaces is_recovery50). */
export async function fetchWorkOrderBatches(): Promise<WorkOrderBatch[]> {
  if (!isSupabaseConfigured) return generateMockData().workOrderBatches;

  const supabase = createClient();
  const { data, error } = await supabase.from("work_order_batches").select("*").order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchWorkOrderBatches failed, falling back to demo data:", error?.message);
    return generateMockData().workOrderBatches;
  }
  return data as WorkOrderBatch[];
}

/** Sprint 2 - Recovery Center, Task 3: vendor quotations per store (no workflow yet — plain CRUD data). */
export async function fetchVendorQuotations(): Promise<VendorQuotation[]> {
  if (!isSupabaseConfigured) return generateMockData().vendorQuotations;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("vendor_quotations")
    .select("*")
    .order("quotation_date", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchVendorQuotations failed, falling back to demo data:", error?.message);
    return generateMockData().vendorQuotations;
  }
  return data as VendorQuotation[];
}

/** Sprint 3 - Repair Ticket: incident_tickets already existed in schema.sql with RLS, just never had application code until now. */
export async function fetchIncidentTickets(): Promise<IncidentTicket[]> {
  if (!isSupabaseConfigured) return generateMockData().tickets;

  const supabase = createClient();
  const { data, error } = await supabase.from("incident_tickets").select("*").order("opened_at", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchIncidentTickets failed, falling back to demo data:", error?.message);
    return generateMockData().tickets;
  }
  return data as IncidentTicket[];
}

/** Sprint 4 - Work Orders: per-store recovery_stage change log, newest first. */
export async function fetchRecoveryStageHistory(): Promise<RecoveryStageHistoryEntry[]> {
  if (!isSupabaseConfigured) return generateMockData().recoveryStageHistory;

  const supabase = createClient();
  const { data, error } = await supabase.from("recovery_stage_history").select("*").order("changed_at", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchRecoveryStageHistory failed, falling back to demo data:", error?.message);
    return generateMockData().recoveryStageHistory;
  }
  return data as RecoveryStageHistoryEntry[];
}

/** Sprint 3 - Asset Register file uploads (photos + documents). */
export async function fetchAttachments(): Promise<Attachment[]> {
  if (!isSupabaseConfigured) return generateMockData().attachments;

  const supabase = createClient();
  const { data, error } = await supabase.from("attachments").select("*").order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Supabase fetchAttachments failed, falling back to demo data:", error?.message);
    return generateMockData().attachments;
  }
  return data as Attachment[];
}

// ---------------------------------------------------------------------------
// Device Offline Monitoring (migration 022). Unlike the fetchers above, these
// do NOT fall back to demo data when Supabase is configured but the query
// fails: showing made-up Online/Offline states for real stores would be
// worse than showing an honest "not installed / couldn't load" message.
// ---------------------------------------------------------------------------

export interface MonitoringSnapshot {
  monitors: StoreMonitor[];
  latestRun: MonitorRun | null;
  settings: MonitorSettings;
  /** Migration 022 hasn't been run on this Supabase project yet. */
  notInstalled: boolean;
  error: string | null;
}

function isMissingTable(message: string | undefined) {
  return !!message && /does not exist|schema cache|relation .* not found|Could not find the table/i.test(message);
}

export async function fetchMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  if (!isSupabaseConfigured) {
    const mock = generateMockMonitoring(generateMockData().stores);
    return { monitors: mock.monitors, latestRun: mock.latestRun, settings: DEFAULT_MONITOR_SETTINGS, notInstalled: false, error: null };
  }

  const supabase = createClient();
  const [mon, run, set] = await Promise.all([
    supabase.from("store_monitor").select("*"),
    supabase.from("monitor_runs").select("*").order("ran_at", { ascending: false }).limit(1),
    supabase.from("monitor_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const firstError = mon.error ?? run.error ?? set.error;
  if (firstError) {
    console.error("fetchMonitoringSnapshot failed:", firstError.message);
    return {
      monitors: [],
      latestRun: null,
      settings: DEFAULT_MONITOR_SETTINGS,
      notInstalled: isMissingTable(firstError.message),
      error: firstError.message,
    };
  }
  return {
    monitors: (mon.data ?? []) as StoreMonitor[],
    latestRun: ((run.data ?? [])[0] as MonitorRun | undefined) ?? null,
    settings: { ...DEFAULT_MONITOR_SETTINGS, ...((set.data as MonitorSettings | null) ?? {}) },
    notInstalled: false,
    error: null,
  };
}

const OUTAGE_PAGE = 1000;

/**
 * Outages whose start falls in [from, to). Pages through results so a long
 * date range never silently stops at Supabase's 1,000-row default. Pass
 * storeId to limit to one store (Store Detail card).
 */
export async function fetchOutages(opts: { from?: Date; to?: Date; storeId?: string; limit?: number }): Promise<{ outages: DeviceOutage[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    let list = generateMockMonitoring(generateMockData().stores).outages;
    if (opts.storeId) list = list.filter((o) => o.store_id === opts.storeId);
    if (opts.from) list = list.filter((o) => new Date(o.started_at) >= opts.from!);
    if (opts.to) list = list.filter((o) => new Date(o.started_at) < opts.to!);
    return { outages: opts.limit ? list.slice(0, opts.limit) : list, error: null };
  }

  const supabase = createClient();
  const out: DeviceOutage[] = [];
  for (let offset = 0; ; offset += OUTAGE_PAGE) {
    let q = supabase.from("device_outages").select("*").order("started_at", { ascending: false });
    if (opts.storeId) q = q.eq("store_id", opts.storeId);
    if (opts.from) q = q.gte("started_at", opts.from.toISOString());
    if (opts.to) q = q.lt("started_at", opts.to.toISOString());
    const pageSize = opts.limit ? Math.min(OUTAGE_PAGE, opts.limit - out.length) : OUTAGE_PAGE;
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) {
      console.error("fetchOutages failed:", error.message);
      return { outages: out, error: error.message };
    }
    out.push(...((data ?? []) as DeviceOutage[]));
    if (!data || data.length < pageSize || (opts.limit && out.length >= opts.limit)) break;
  }
  return { outages: out, error: null };
}
