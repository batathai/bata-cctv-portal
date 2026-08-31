import type { PartialReason, OfflineReason } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

export interface SurveyFormInput {
  store_id: string;
  auditor: string | null;
  // The *live* state (nvr_online, camera_working/failed, playback_status,
  // hdd_status, hdd_capacity) is written to stores/cctv_assets separately,
  // via AppDataProvider's editAssetDetails — same path a manual Edit Detail
  // uses — so Asset Register is always the one place that state actually
  // lives. This form only carries what's specific to *this one check*: the
  // resulting status snapshot, why (if Partial/Offline), how many days of
  // playback were actually seen, and free notes.
  overall_status: "Healthy" | "Partial" | "Offline";
  playback_result: "Working" | "Not Working";
  hdd_result: "Healthy" | "Warning" | "Failed";
  camera_result: "OK" | "Partial" | "Not Work";
  hikconnect_result: "Working" | "Not Working";
  partial_reason: PartialReason | null;
  offline_reason: OfflineReason | null;
  retention_days_seen: number | null;
  date_correct: boolean;
  notes?: string | null;
}

export async function createAuditRecordDb(supabase: SupabaseClient, input: SurveyFormInput) {
  const { data, error } = await supabase
    .from("audit_history")
    .insert({
      store_id: input.store_id,
      audit_date: new Date().toISOString().slice(0, 10),
      auditor: input.auditor || null,
      overall_status: input.overall_status,
      playback_result: input.playback_result,
      hdd_result: input.hdd_result,
      camera_result: input.camera_result,
      hikconnect_result: input.hikconnect_result,
      partial_reason: input.partial_reason,
      offline_reason: input.offline_reason,
      retention_days_seen: input.retention_days_seen,
      date_correct: input.date_correct,
      notes: input.notes || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to save survey: ${error.message}`);
  return data;
}
