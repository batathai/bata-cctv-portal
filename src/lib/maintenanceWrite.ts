import type { RepairStatus, OverallStatus } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/**
 * Sprint 5: keeps Device Status (now merged into /dashboard) and Asset Register in sync with
 * Maintenance. Both of those pages display `stores.overall_status`
 * directly, so updating that one column here is enough for both to reflect
 * the change automatically — no separate sync needed per page.
 */
export const REPAIR_STATUS_TO_OVERALL_STATUS: Record<RepairStatus, OverallStatus> = {
  Pending: "Offline",
  "In Progress": "Partial",
  Completed: "Healthy",
};

export interface MaintenanceFormInput {
  store_id: string;
  status: RepairStatus;
  issue_date: string;
  started_date?: string | null;
  completed_date?: string | null;
  vendor?: string | null;
  problem?: string | null;
  root_cause?: string | null;
  resolution?: string | null;
  cost?: number;
  technician?: string | null;
  ticket_ref?: string | null;
}

export async function createMaintenanceRecordDb(supabase: SupabaseClient, input: MaintenanceFormInput) {
  const { data, error } = await supabase
    .from("maintenance_history")
    .insert({
      store_id: input.store_id,
      status: input.status,
      issue_date: input.issue_date,
      started_date: input.started_date || null,
      completed_date: input.completed_date || null,
      vendor: input.vendor || null,
      problem: input.problem || null,
      root_cause: input.root_cause || null,
      resolution: input.resolution || null,
      cost: input.cost ?? 0,
      technician: input.technician || null,
      ticket_ref: input.ticket_ref || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to save repair record: ${error.message}`);
  return data;
}

export async function updateMaintenanceRecordDb(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<MaintenanceFormInput>
) {
  const { error } = await supabase.from("maintenance_history").update(patch).eq("id", id);
  if (error) throw new Error(`Failed to update repair record: ${error.message}`);
}

export async function deleteMaintenanceRecordDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("maintenance_history").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete repair record: ${error.message}`);
}
