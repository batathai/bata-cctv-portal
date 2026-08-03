import type { AttachmentFolder } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

const BUCKET = "attachments";

/**
 * Uploads a file to the `attachments` Storage bucket and records it in the
 * `attachments` table. Requires the bucket to exist — see
 * supabase/migrations/009_attachments_storage.sql, which creates it.
 */
export async function uploadAttachment(
  supabase: SupabaseClient,
  storeCode: string,
  storeId: string,
  folder: AttachmentFolder,
  file: File
) {
  const path = `${storeCode}/${folder.toLowerCase().replace(/ /g, "-")}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw new Error(`Failed to upload file: ${uploadError.message}`);

  const { data, error } = await supabase
    .from("attachments")
    .insert({ store_id: storeId, folder, file_path: path, file_name: file.name })
    .select()
    .single();
  if (error) throw new Error(`Failed to save attachment record: ${error.message}`);
  return data;
}

export async function deleteAttachment(supabase: SupabaseClient, attachmentId: string, filePath: string) {
  await supabase.storage.from(BUCKET).remove([filePath]);
  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(`Failed to delete attachment: ${error.message}`);
}

/** Signed URL for viewing/downloading a private attachment (1 hour). */
export async function getAttachmentUrl(supabase: SupabaseClient, filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
  if (error) {
    console.error("Failed to sign attachment URL:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
