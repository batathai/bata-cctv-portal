import type { InstallationStage } from "@/types/database";
import { POST_COMPLETION_KEYS, VERIFY_CHECKLIST_TOTAL } from "@/lib/installation";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/**
 * Moves an installation project to a new stage (id, not store_code — used
 * from the Kanban board and the detail page) and logs the change to
 * installation_stage_history, mirroring updateRecoveryStageDb's pattern.
 * `extra` carries any other columns that change alongside the stage (e.g.
 * approved_quotation_id when leaving "Quotation", permit_submitted_at when
 * entering "Permit", d1_date/d2_date, completed_at when reaching
 * "Completed").
 */
export async function updateInstallationStageDb(
  supabase: SupabaseClient,
  projectId: string,
  storeId: string,
  stage: InstallationStage,
  fromStage: InstallationStage | null,
  extra: Record<string, unknown> = {},
  note?: string | null
) {
  const { error } = await supabase
    .from("installation_projects")
    .update({ current_stage: stage, ...extra })
    .eq("id", projectId);
  if (error) throw new Error(`Failed to update installation stage: ${error.message}`);

  const { error: historyError } = await supabase.from("installation_stage_history").insert({
    store_id: storeId,
    from_stage: fromStage,
    to_stage: stage,
    note: note || null,
  });
  if (historyError) console.error("Failed to log installation stage history:", historyError.message);
}

/**
 * Toggles one Verify Checklist item on/off, keeps verify_total in sync, and
 * auto-completes the project (stage -> "Completed", completed_at = today)
 * once all 12 items are checked — R6's auto-complete rule. Returns whether
 * this call triggered the auto-complete, so the caller can log the stage
 * transition too (this function only writes installation_projects; the
 * caller is responsible for the installation_stage_history row via
 * updateInstallationStageDb, same separation as the rest of this file).
 */
export async function toggleVerifyChecklistItemDb(
  supabase: SupabaseClient,
  projectId: string,
  currentChecked: string[],
  itemKey: string,
  checked: boolean
): Promise<{ nowComplete: boolean; checked: string[] }> {
  const nextChecked = checked ? Array.from(new Set([...currentChecked, itemKey])) : currentChecked.filter((k) => k !== itemKey);
  const nowComplete = nextChecked.length >= VERIFY_CHECKLIST_TOTAL;

  const update: Record<string, unknown> = { verify_checked: nextChecked, verify_total: nextChecked.length };
  if (nowComplete) {
    update.current_stage = "Completed";
    update.completed_at = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("installation_projects").update(update).eq("id", projectId);
  if (error) throw new Error(`Failed to update verify checklist: ${error.message}`);

  return { nowComplete, checked: nextChecked };
}

/**
 * R6's 72h rollback: a store found Offline within 72h of Completed gets its
 * two post-completion checklist items (C1/C2) cleared and moves back to
 * "Installing", logged with the given reason.
 */
export async function resetPostCompletionChecklistDb(
  supabase: SupabaseClient,
  projectId: string,
  storeId: string,
  currentChecked: string[],
  reason: string
) {
  const nextChecked = currentChecked.filter((k) => !POST_COMPLETION_KEYS.includes(k));

  const { error } = await supabase
    .from("installation_projects")
    .update({
      verify_checked: nextChecked,
      verify_total: nextChecked.length,
      current_stage: "Installing",
      completed_at: null,
    })
    .eq("id", projectId);
  if (error) throw new Error(`Failed to reset post-completion checklist: ${error.message}`);

  const { error: historyError } = await supabase.from("installation_stage_history").insert({
    store_id: storeId,
    from_stage: "Completed",
    to_stage: "Installing",
    note: `ย้อนกลับ (สาขา Offline ใน 72 ชม.): ${reason}`,
  });
  if (historyError) console.error("Failed to log installation rollback:", historyError.message);
}

export async function createInstallationProjectDb(supabase: SupabaseClient, storeId: string, wave: string) {
  const { data, error } = await supabase
    .from("installation_projects")
    .insert({ store_id: storeId, wave, current_stage: "Quotation" })
    .select()
    .single();
  if (error) throw new Error(`Failed to open installation project: ${error.message}`);

  const { error: historyError } = await supabase.from("installation_stage_history").insert({
    store_id: storeId,
    from_stage: null,
    to_stage: "Quotation",
    note: null,
  });
  if (historyError) console.error("Failed to log installation stage history:", historyError.message);

  return data;
}
