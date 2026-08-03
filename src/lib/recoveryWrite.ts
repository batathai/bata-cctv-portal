import type { RecoveryStage } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/** Updates just the recovery_stage column for one store (id, not store_code — used from the Store Detail page). */
export async function updateRecoveryStageDb(supabase: SupabaseClient, storeId: string, stage: RecoveryStage) {
  const { error } = await supabase.from("stores").update({ recovery_stage: stage }).eq("id", storeId);
  if (error) throw new Error(`Failed to update recovery stage: ${error.message}`);
}
