// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

/**
 * Cleans a job name typed by a person: trims spaces and drops stray symbols
 * stuck to the front (e.g. a ' or a Thai tone mark typed while switching
 * keyboard layout), so a name always starts with a letter or digit.
 */
export function cleanJobName(raw: string): string {
  return raw.trim().replace(/^[^A-Za-z0-9\u0E01-\u0E2E\u0E40-\u0E44\u0E50-\u0E59]+/, "").trim();
}

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

export async function renameWorkOrderBatchDb(supabase: SupabaseClient, batchId: string, name: string) {
  const { error } = await supabase.from("work_order_batches").update({ name }).eq("id", batchId);
  if (error) throw new Error(`Failed to rename job: ${error.message}`);
}
