import type { RecoveryStage } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/**
 * Updates the recovery_stage column for one store (id, not store_code — used
 * from the Work Order detail page and Asset Register) and appends a row to
 * recovery_stage_history so the Work Order timeline has a permanent record
 * of who moved the job forward and when. Sprint 4 - Work Orders.
 */
export async function updateRecoveryStageDb(
  supabase: SupabaseClient,
  storeId: string,
  stage: RecoveryStage,
  fromStage: RecoveryStage | null,
  note?: string | null
) {
  const { error } = await supabase.from("stores").update({ recovery_stage: stage }).eq("id", storeId);
  if (error) throw new Error(`Failed to update recovery stage: ${error.message}`);

  const { error: historyError } = await supabase.from("recovery_stage_history").insert({
    store_id: storeId,
    from_stage: fromStage,
    to_stage: stage,
    note: note || null,
  });
  // Don't fail the whole update if only the history log insert fails — the
  // stage change itself already succeeded and is the more important write.
  if (historyError) console.error("Failed to log recovery stage history:", historyError.message);
}

/**
 * Logs a remark against a given stage — current or a PAST one (e.g. adding
 * a note to "Repairing" after the work order has already moved on to
 * "Verified", because it was forgotten at the time). Unlike
 * updateRecoveryStageDb, this never touches `stores.recovery_stage` — it
 * only appends a history row (from_stage === to_stage === the chosen stage
 * signals "remark, not a transition" to the UI).
 */
export async function addRecoveryRemarkDb(supabase: SupabaseClient, storeId: string, stage: RecoveryStage, note: string) {
  const { error } = await supabase.from("recovery_stage_history").insert({
    store_id: storeId,
    from_stage: stage,
    to_stage: stage,
    note,
  });
  if (error) throw new Error(`Failed to save remark: ${error.message}`);
}
