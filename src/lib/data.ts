import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { generateMockData } from "@/lib/mockData";
import type { StoreWithAssets, MaintenanceRecord, AuditRecord, VendorQuotation, IncidentTicket, Attachment, RecoveryStageHistoryEntry } from "@/types/database";

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
    const score =
      (asset?.nvr_online ? 30 : 0) +
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
