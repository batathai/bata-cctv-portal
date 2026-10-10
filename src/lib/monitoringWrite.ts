import type { MonitorSettings } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/**
 * Portal-side writes for Device Offline Monitoring. Migration 022 only
 * grants UPDATE on these specific columns to logged-in users, so the portal
 * can never overwrite the state the HQ script computed (state, last_seen_at,
 * outage links). Every store already has a store_monitor row (created by
 * the migration + a trigger on new stores), so these are plain updates.
 */

export async function setMonitoredDb(supabase: SupabaseClient, storeIds: string[], monitored: boolean) {
  if (storeIds.length === 0) return;
  const { error } = await supabase.from("store_monitor").update({ monitored }).in("store_id", storeIds);
  if (error) throw new Error(`บันทึกสถานะ monitored ไม่สำเร็จ: ${error.message}`);
}

/** open/close as "HH:MM"; pass nulls to go back to the standard hours. */
export async function setStoreHoursDb(supabase: SupabaseClient, storeId: string, open: string | null, close: string | null) {
  const { error } = await supabase
    .from("store_monitor")
    .update({ open_time: open, close_time: close })
    .eq("store_id", storeId);
  if (error) throw new Error(`บันทึกเวลาทำการไม่สำเร็จ: ${error.message}`);
}

export async function muteStoreDb(supabase: SupabaseClient, storeId: string, until: Date, reason: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("store_monitor")
    .update({ muted_until: until.toISOString(), mute_reason: reason.trim(), muted_by: user?.id ?? null })
    .eq("store_id", storeId);
  if (error) throw new Error(`Mute ไม่สำเร็จ: ${error.message}`);
}

export async function unmuteStoreDb(supabase: SupabaseClient, storeId: string) {
  const { error } = await supabase
    .from("store_monitor")
    .update({ muted_until: null, mute_reason: null, muted_by: null })
    .eq("store_id", storeId);
  if (error) throw new Error(`ปลด Mute ไม่สำเร็จ: ${error.message}`);
}

export type MonitorSettingsPatch = Partial<Omit<MonitorSettings, "id" | "updated_at" | "updated_by">>;

export async function saveMonitorSettingsDb(supabase: SupabaseClient, patch: MonitorSettingsPatch) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("monitor_settings")
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq("id", 1);
  if (error) throw new Error(`บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`);
}

export async function setOutageNoteDb(supabase: SupabaseClient, outageId: string, note: string) {
  const { error } = await supabase.from("device_outages").update({ note: note.trim() || null }).eq("id", outageId);
  if (error) throw new Error(`บันทึกหมายเหตุไม่สำเร็จ: ${error.message}`);
}
