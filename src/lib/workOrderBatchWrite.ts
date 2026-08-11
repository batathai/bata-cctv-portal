import type { SupabaseClient } from "@supabase/supabase-js";

export async function createWorkOrderBatchDb(supabase: SupabaseClient, name: string) {
  const { data, error } = await supabase.from("work_order_batches").insert({ name, status: "Active" }).select().single();
  if (error) throw new Error(`Failed to create job: ${error.message}`);
  return data;
}

export async function setWorkOrderBatchStatusDb(supabase: SupabaseClient, batchId: string, status: "Active" | "Closed") {
  const { error } = await supabase
    .from("work_order_batches")
    .update({ status, closed_at: status === "Closed" ? new Date().toISOString() : null })
    .eq("id", batchId);
  if (error) throw new Error(`Failed to update job status: ${error.message}`);
}
