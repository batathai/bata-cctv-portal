// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

const ATTACHMENTS_BUCKET = "attachments";

export async function updateStoreDetailsDb(supabase: SupabaseClient, storeId: string, patch: Record<string, any>) {
  const { error } = await supabase.from("stores").update(patch).eq("id", storeId);
  if (error) throw new Error(`Failed to update store: ${error.message}`);
}

export async function updateAssetDetailsDb(supabase: SupabaseClient, storeId: string, patch: Record<string, any>) {
  const { error } = await supabase.from("cctv_assets").update(patch).eq("store_id", storeId);
  if (error) throw new Error(`Failed to update asset: ${error.message}`);
}

export async function updateHikconnectDetailsDb(supabase: SupabaseClient, storeId: string, patch: Record<string, any>) {
  const { error } = await supabase.from("hikconnect_devices").update(patch).eq("store_id", storeId);
  if (error) throw new Error(`Failed to update Hik-Connect record: ${error.message}`);
}

/**
 * Sprint 4 - Store Relocation: repoints a device's cctv_assets row to a
 * different store (by store_code). Serial/MAC/Hik UID/QR Code are untouched
 * since they live on the same asset row — only `store_id` changes.
 *
 * Relies on the existing unique constraint on cctv_assets.store_id
 * (migration 001) to reject moving into a store that already has a device;
 * that Postgres error is caught and re-thrown as a clear message instead of
 * silently overwriting the other device's record.
 */
export async function relocateAssetDb(supabase: SupabaseClient, assetId: string, targetStoreCode: string) {
  const { data: targetStore, error: lookupError } = await supabase
    .from("stores")
    .select("id")
    .eq("store_code", targetStoreCode)
    .single();
  if (lookupError || !targetStore) throw new Error(`Store ${targetStoreCode} not found.`);

  const { error } = await supabase.from("cctv_assets").update({ store_id: targetStore.id }).eq("id", assetId);
  if (error) {
    if (error.code === "23505") {
      throw new Error(`Store ${targetStoreCode} already has a device assigned. Move that device out first.`);
    }
    throw new Error(`Failed to relocate device: ${error.message}`);
  }
}

/**
 * QR Code is device identity, uploaded once and referenced directly on
 * cctv_assets.qr_code_path — not routed through the generic `attachments`
 * table (see migration 010's comment). Still lands in the same Storage
 * bucket as everything else.
 */
export async function uploadQrCodeDb(supabase: SupabaseClient, storeCode: string, storeId: string, file: File) {
  const path = `${storeCode}/qr-code/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
  if (uploadError) throw new Error(`Failed to upload QR code: ${uploadError.message}`);
  await updateAssetDetailsDb(supabase, storeId, { qr_code_path: path });
  return path;
}
