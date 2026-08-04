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
