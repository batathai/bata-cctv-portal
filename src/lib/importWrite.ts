// This module intentionally uses `any` for the Supabase client: our
// hand-authored `Database` type (see src/types/database.ts) covers the
// columns the UI needs but isn't a complete match for supabase-js's stricter
// generated-type shape (Relationships/Views/Functions/Enums). Regenerating
// types with `supabase gen types typescript` will let this be tightened.
type SupabaseClient = any;

const VALID_REGIONS = ["Bangkok", "Upcountry"] as const;
const VALID_STATUSES = ["Healthy", "Partial", "Offline", "Unknown"] as const;
const BANGKOK_ZONES = ["511", "512", "513", "550"];
const TRUE_STRINGS = ["true", "yes", "y", "online", "1", "active", "ok", "working", "healthy"];
const FALSE_STRINGS = ["false", "no", "n", "offline", "0", "inactive", "fail", "failed", "not working"];

function normalizeRegion(region: unknown, zone: unknown): string {
  if (typeof region === "string" && (VALID_REGIONS as readonly string[]).includes(region)) return region;
  return BANGKOK_ZONES.includes(String(zone)) ? "Bangkok" : "Upcountry";
}

function normalizeStatus(status: unknown): string {
  if (typeof status === "string" && (VALID_STATUSES as readonly string[]).includes(status)) return status;
  return "Unknown";
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

/** Parses free-text truthy/falsy values from a spreadsheet (e.g. "Online", "Yes", "1") into a boolean. */
function toBooleanOrUndefined(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const norm = String(v).trim().toLowerCase();
  if (TRUE_STRINGS.includes(norm)) return true;
  if (FALSE_STRINGS.includes(norm)) return false;
  return undefined;
}

/** Normalizes free-text HDD status into the schema's fixed enum. */
function normalizeHddStatus(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const norm = v.trim().toLowerCase();
  if (["healthy", "ok", "good", "normal", "pass"].includes(norm)) return "Healthy";
  if (["warning", "warn", "degraded"].includes(norm)) return "Warning";
  if (["failed", "fail", "error", "bad"].includes(norm)) return "Failed";
  return undefined;
}

/** Normalizes free-text playback status into the schema's fixed enum. */
function normalizePlaybackStatus(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const norm = v.trim().toLowerCase();
  if (TRUE_STRINGS.includes(norm) || norm === "working") return "Working";
  if (FALSE_STRINGS.includes(norm) || norm === "not working") return "Not Working";
  return undefined;
}

/** Normalizes free-text camera status into the schema's fixed enum (OK / Partial / Not Work). */
function normalizeCameraStatus(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const norm = v.trim().toLowerCase();
  if (["ok", "good", "normal", "working", "pass"].includes(norm)) return "OK";
  if (["partial", "some failed", "degraded"].includes(norm)) return "Partial";
  if (["not work", "not working", "fail", "failed", "offline", "broken"].includes(norm)) return "Not Work";
  return undefined;
}

/** Finds a supplier by name (case-insensitive), creating it if it doesn't exist yet. Cached per call. */
async function resolveSupplierIds(supabase: SupabaseClient, names: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(names.filter(Boolean)));
  const map = new Map<string, string>();
  for (const name of unique) {
    const { data: existing } = await supabase.from("suppliers").select("id").ilike("name", name).maybeSingle();
    if (existing) {
      map.set(name, (existing as any).id);
      continue;
    }
    const { data: created, error } = await supabase.from("suppliers").insert({ name }).select("id").single();
    if (error) throw new Error(`Could not create supplier "${name}": ${error.message}`);
    map.set(name, (created as any).id);
  }
  return map;
}

export interface StoreImportRow {
  store_code: string;
  operation: "insert" | "update";
  store_name?: string;
  region?: string;
  zone?: string;
  province?: string;
  address?: string;
  phone?: string;
  store_group?: string;
  supplierName?: string;
  overall_status?: string;
}

/**
 * Upserts store rows into Supabase, matched on the unique `store_code` column.
 *
 * Only writes columns that were actually mapped in *this* import. This
 * matters because re-importing a sheet that only has, say, Store Name and
 * Zone should never blow away `overall_status` (or province, or supplier)
 * that a previous CCTV Assets import derived — otherwise every subsequent
 * "stores" import silently resets those fields back to their defaults.
 * Brand-new rows still get sensible defaults for the columns Postgres
 * requires (store_name, region, zone).
 */
export async function upsertStoresToSupabase(supabase: SupabaseClient, rows: StoreImportRow[]) {
  const withCode = rows.filter((r) => r.store_code);
  const supplierIds = await resolveSupplierIds(
    supabase,
    withCode.map((r) => r.supplierName).filter((s): s is string => !!s)
  );

  const payload = withCode.map((r) => {
    const row: Record<string, any> = { store_code: r.store_code };

    if (r.operation === "insert") {
      // A fresh row needs every NOT NULL column with no default filled in.
      row.store_name = r.store_name || r.store_code;
      row.region = normalizeRegion(r.region, r.zone);
      row.zone = r.zone || "";
    } else {
      // Existing row: only touch what this import actually maps.
      if (r.store_name !== undefined) row.store_name = r.store_name || r.store_code;
      if (r.region !== undefined || r.zone !== undefined) row.region = normalizeRegion(r.region, r.zone);
      if (r.zone !== undefined) row.zone = r.zone;
    }

    if (r.province !== undefined) row.province = r.province || null;
    if (r.address !== undefined) row.address = r.address || null;
    if (r.phone !== undefined) row.phone = r.phone || null;
    if (r.store_group !== undefined) row.store_group = r.store_group || null;
    if (r.supplierName !== undefined) row.supplier_id = supplierIds.get(r.supplierName) ?? null;
    if (r.overall_status !== undefined) row.overall_status = normalizeStatus(r.overall_status);

    return row;
  });

  if (payload.length === 0) return [];
  const { data, error } = await supabase.from("stores").upsert(payload, { onConflict: "store_code" }).select();
  if (error) throw new Error(`Failed to import stores: ${error.message}`);
  return data;
}

export interface AssetImportRow {
  store_code: string;
  nvr_model?: string;
  nvr_serial?: string;
  nvr_firmware?: string;
  nvr_online?: string;
  camera_total?: string;
  camera_working?: string;
  camera_failed?: string;
  camera_status?: string;
  hdd_status?: string;
  playback_status?: string;
  isp?: string;
}

/**
 * Upserts CCTV asset rows, matched on `store_id` (requires the store to
 * already exist — import to `stores` first). Needs a unique constraint on
 * cctv_assets.store_id — see the migration note in the README / chat.
 *
 * Also derives and writes back each store's `overall_status` from the newly
 * imported health factors, since that's what the Dashboard's status cards
 * and Store Status chart read from — otherwise every store stays "Unknown"
 * forever unless a separate import happens to set it explicitly.
 */
export async function upsertCctvAssetsToSupabase(
  supabase: SupabaseClient,
  rows: AssetImportRow[],
  storeCodeToId: Map<string, string>
) {
  const normalized = rows
    .map((r) => {
      const store_id = storeCodeToId.get(r.store_code);
      if (!store_id) return null;
      return {
        store_code: r.store_code,
        store_id,
        nvr_model: r.nvr_model || undefined,
        nvr_serial: r.nvr_serial || undefined,
        nvr_firmware: r.nvr_firmware || undefined,
        nvr_online: toBooleanOrUndefined(r.nvr_online),
        camera_total: toNumberOrUndefined(r.camera_total),
        camera_working: toNumberOrUndefined(r.camera_working),
        camera_failed: toNumberOrUndefined(r.camera_failed),
        camera_status: normalizeCameraStatus(r.camera_status),
        hdd_status: normalizeHddStatus(r.hdd_status),
        playback_status: normalizePlaybackStatus(r.playback_status),
        isp: r.isp || undefined,
      };
    })
    .filter((r): r is Exclude<typeof r, null> => r !== null);

  if (normalized.length === 0) return [];

  const assetPayload = normalized.map(({ store_code, ...rest }) => rest);
  const { data, error } = await supabase.from("cctv_assets").upsert(assetPayload, { onConflict: "store_id" }).select();
  if (error) {
    throw new Error(
      `Failed to import CCTV assets: ${error.message}. If this mentions "no unique or exclusion constraint", ` +
        `run: alter table public.cctv_assets add constraint cctv_assets_store_id_unique unique (store_id);`
    );
  }

  // Derive overall_status per store from what we just wrote and persist it.
  // This must be a plain UPDATE, not an upsert: Postgres validates upsert's
  // implicit INSERT values (including NOT NULL columns like store_name)
  // even when the row already exists and the conflict path will be taken.
  const statusUpdates = normalized.map((r) => ({ store_id: r.store_id, overall_status: deriveOverallStatus(r) }));
  const chunkSize = 20;
  for (let i = 0; i < statusUpdates.length; i += chunkSize) {
    const chunk = statusUpdates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((u) => supabase.from("stores").update({ overall_status: u.overall_status }).eq("id", u.store_id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      throw new Error(`CCTV assets saved, but failed to update store status: ${failed.error.message}`);
    }
  }

  return data;
}

/** Same health-factor logic used for the Health Score module, collapsed into the simpler Healthy/Partial/Offline/Unknown status used by Module 3. */
export function deriveOverallStatus(a: {
  nvr_online?: boolean;
  playback_status?: string;
  hdd_status?: string;
  camera_failed?: number;
  camera_status?: string;
}): string {
  if (a.nvr_online === false) return "Offline";

  const hasSignal =
    a.nvr_online !== undefined ||
    a.playback_status !== undefined ||
    a.hdd_status !== undefined ||
    a.camera_failed !== undefined ||
    a.camera_status !== undefined;
  if (!hasSignal) return "Unknown";

  // Treat fields that weren't provided by this import as "not a problem" —
  // otherwise a sheet that only tracks cameras would always read as Partial.
  // (nvr_online is already known not to be `false` here — handled above.)
  const playbackOk = a.playback_status === undefined || a.playback_status === "Working";
  const hddOk = a.hdd_status === undefined || a.hdd_status === "Healthy";
  const cameraOk = a.camera_status !== undefined
    ? a.camera_status === "OK"
    : a.camera_failed === undefined || a.camera_failed === 0;

  if (playbackOk && hddOk && cameraOk) return "Healthy";
  return "Partial";
}

export interface MaintenanceImportRow {
  store_code: string;
  issue_date?: string;
  started_date?: string;
  completed_date?: string;
  status?: string;
  vendor?: string;
  problem?: string;
  root_cause?: string;
  resolution?: string;
  cost?: string;
  technician?: string;
  ticket_ref?: string;
}

function normalizeRepairStatus(v: unknown): "Pending" | "In Progress" | "Completed" {
  if (typeof v === "string") {
    const norm = v.trim().toLowerCase();
    if (["completed", "done", "closed", "resolved"].includes(norm)) return "Completed";
    if (["in progress", "in-progress", "ongoing", "assigned", "working"].includes(norm)) return "In Progress";
  }
  return "Pending";
}

/**
 * Inserts new maintenance/repair records. Always creates new rows — a
 * repair log is append-only, so there's no "update" concept here — and
 * requires the store to already exist (resolved via storeCodeToId).
 * Returns the inserted rows in the same order as `rows` so callers can
 * line up generated ids for rollback.
 */
export async function insertMaintenanceRecords(
  supabase: SupabaseClient,
  rows: MaintenanceImportRow[],
  storeCodeToId: Map<string, string>
) {
  const payload = rows
    .map((r) => {
      const store_id = storeCodeToId.get(r.store_code);
      if (!store_id) return null;
      return {
        store_id,
        ticket_ref: r.ticket_ref || null,
        status: normalizeRepairStatus(r.status),
        issue_date: r.issue_date || new Date().toISOString().slice(0, 10),
        started_date: r.started_date || null,
        completed_date: r.completed_date || null,
        vendor: r.vendor || null,
        problem: r.problem || null,
        root_cause: r.root_cause || null,
        resolution: r.resolution || null,
        cost: toNumberOrUndefined(r.cost) ?? 0,
        technician: r.technician || null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (payload.length === 0) return [];
  const { data, error } = await supabase.from("maintenance_history").insert(payload).select();
  if (error) throw new Error(`Failed to import maintenance records: ${error.message}`);
  return data;
}

export async function deleteMaintenanceRecordById(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("maintenance_history").delete().eq("id", id);
  if (error) throw new Error(`Failed to roll back maintenance record: ${error.message}`);
}

export async function deleteStoreByCode(supabase: SupabaseClient, storeCode: string) {
  const { error } = await supabase.from("stores").delete().eq("store_code", storeCode);
  if (error) throw new Error(`Failed to roll back store ${storeCode}: ${error.message}`);
}

export async function updateStoreByCode(supabase: SupabaseClient, storeCode: string, values: Record<string, any>) {
  const { error } = await supabase.from("stores").update(values).eq("store_code", storeCode);
  if (error) throw new Error(`Failed to roll back store ${storeCode}: ${error.message}`);
}

export async function updateAssetByStoreId(supabase: SupabaseClient, storeId: string, values: Record<string, any>) {
  const { error } = await supabase.from("cctv_assets").update(values).eq("store_id", storeId);
  if (error) throw new Error(`Failed to roll back asset for store: ${error.message}`);
}
