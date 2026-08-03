import type { StoreWithAssets } from "@/types/database";

export type TargetTable = "stores" | "cctv_assets" | "maintenance_history";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}

// Field maps for each bulk-import target. Extend with more tables
// (hikconnect_devices, audit_history, ...) the same way.
export const TARGET_FIELDS: Record<TargetTable, FieldDef[]> = {
  stores: [
    { key: "store_code", label: "Store Code (match key)", required: true },
    { key: "store_name", label: "Store Name" },
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "province", label: "Province" },
    { key: "address", label: "Address" },
    { key: "phone", label: "Phone" },
    { key: "store_group", label: "Store Group (Tourist/City/Family)" },
    { key: "supplierName", label: "Supplier" },
    { key: "overall_status", label: "Overall Status" },
  ],
  cctv_assets: [
    { key: "store_code", label: "Store Code (match key)", required: true },
    { key: "nvr_model", label: "NVR Model" },
    { key: "nvr_serial", label: "NVR Serial" },
    { key: "nvr_firmware", label: "NVR Firmware" },
    { key: "nvr_online", label: "NVR Online / Device Status" },
    { key: "camera_total", label: "Camera Total" },
    { key: "camera_working", label: "Camera Working" },
    { key: "camera_failed", label: "Camera Failed" },
    { key: "camera_status", label: "Camera Status (OK/Partial/Not Work)" },
    { key: "hdd_status", label: "HDD Status" },
    { key: "playback_status", label: "Playback Status" },
    { key: "isp", label: "ISP" },
  ],
  maintenance_history: [
    { key: "store_code", label: "Store Code (match key)", required: true },
    { key: "issue_date", label: "Date Reported" },
    { key: "started_date", label: "Date Started" },
    { key: "completed_date", label: "Date Completed" },
    { key: "status", label: "Status (Pending/In Progress/Completed)" },
    { key: "vendor", label: "Vendor / Supplier" },
    { key: "problem", label: "Problem" },
    { key: "root_cause", label: "Root Cause / Cause" },
    { key: "resolution", label: "Resolution / Remark" },
    { key: "cost", label: "Cost (THB)" },
    { key: "technician", label: "Technician" },
    { key: "ticket_ref", label: "Ticket Ref" },
  ],
};

// "stores" supports creating brand-new rows (there's nothing to match yet on
// a first import). "cctv_assets" requires the store to already exist, since
// an asset row needs a real store_id to attach to.
const SUPPORTS_INSERT: Record<"stores" | "cctv_assets", boolean> = {
  stores: true,
  cctv_assets: false,
};

// "snapshot" tables have exactly one row per store, matched/updated by
// store_code (stores, cctv_assets). "log" tables are append-only history —
// every imported row becomes a brand-new record, and many rows can belong
// to the same store (maintenance_history).
const RECORD_MODE: Record<TargetTable, "snapshot" | "log"> = {
  stores: "snapshot",
  cctv_assets: "snapshot",
  maintenance_history: "log",
};

export interface ImportBatchRow {
  storeCode: string;
  operation: "insert" | "update" | "not_found";
  previous: Record<string, any> | null;
  next: Record<string, any>;
  /** Populated after a real DB insert (log-mode tables), so rollback can delete the exact row. */
  insertedId?: string;
}

export interface ImportBatch {
  id: string;
  targetTable: TargetTable;
  fileName: string;
  mapping: Record<string, string>; // source column -> target field key
  rows: ImportBatchRow[];
  createdAt: string;
  status: "completed" | "rolled_back";
}

/** Builds a preview + snapshot of previous values, matched by store_code. */
export function buildImportRows(
  targetTable: TargetTable,
  mapping: Record<string, string>,
  parsedRows: Record<string, string>[],
  stores: StoreWithAssets[]
): ImportBatchRow[] {
  const byCode = new Map(stores.map((s) => [s.store_code, s]));
  const reverseMap = Object.entries(mapping).filter(([, target]) => target); // [csvCol, targetField][]

  return parsedRows.map((row) => {
    const next: Record<string, any> = {};
    reverseMap.forEach(([csvCol, targetField]) => {
      next[targetField] = row[csvCol];
    });
    // Normalize the match key: some sources (Excel numeric cells in
    // particular) can hand back a number instead of text, which would
    // silently fail every store_code lookup below.
    if (next["store_code"] !== undefined && next["store_code"] !== null) {
      next["store_code"] = String(next["store_code"]).trim();
    }
    const storeCode = next["store_code"];
    const store = byCode.get(storeCode);

    if (RECORD_MODE[targetTable] === "log") {
      // A repair log always creates a new record — it never matches/updates
      // an existing one — but the store it belongs to must already exist.
      return { storeCode, operation: store ? "insert" : "not_found", previous: null, next };
    }

    if (!store) {
      return {
        storeCode,
        operation: SUPPORTS_INSERT[targetTable as "stores" | "cctv_assets"] ? "insert" : "not_found",
        previous: null,
        next,
      };
    }

    const previous: Record<string, any> = {};
    if (targetTable === "stores") {
      Object.keys(next).forEach((k) => (previous[k] = (store as any)[k]));
    } else {
      Object.keys(next).forEach((k) => (previous[k] = (store.asset as any)?.[k]));
    }
    return { storeCode, operation: "update", previous, next };
  });
}

function deriveRegion(zone: string | undefined): "Bangkok" | "Upcountry" {
  return zone && ["511", "512", "513", "550"].includes(zone) ? "Bangkok" : "Upcountry";
}

/** Applies a batch's rows to the in-memory store list (demo mode / optimistic UI). Only for snapshot tables. */
export function applyBatchToStores(stores: StoreWithAssets[], batch: ImportBatch): StoreWithAssets[] {
  if (RECORD_MODE[batch.targetTable] === "log") return stores;
  const result = [...stores];
  const byCode = new Map(result.map((s) => [s.store_code, s]));

  batch.rows.forEach((r) => {
    if (r.operation === "not_found") return;

    if (r.operation === "insert") {
      const now = new Date().toISOString();
      const newStore: StoreWithAssets = {
        id: `store_${r.storeCode}`,
        store_code: r.storeCode,
        store_name: r.next.store_name || r.storeCode,
        region: (r.next.region as any) || deriveRegion(r.next.zone),
        zone: r.next.zone || "",
        province: r.next.province || null,
        address: r.next.address || null,
        phone: r.next.phone || null,
        store_group: r.next.store_group || null,
        supplier_id: null,
        overall_status: (r.next.overall_status as any) || "Unknown",
        latitude: null,
        longitude: null,
        is_active: true,
        created_at: now,
        updated_at: now,
        supplierName: r.next.supplierName || "Unassigned",
        healthScore: 0,
        asset: null,
        hikconnect: null,
      };
      result.push(newStore);
      byCode.set(r.storeCode, newStore);
      return;
    }

    const store = byCode.get(r.storeCode);
    if (!store) return;
    if (batch.targetTable === "stores") {
      Object.assign(store, r.next);
    } else if (store.asset) {
      Object.assign(store.asset, coerceAssetTypes(r.next));
    }
  });
  return result;
}

/** Reverts a batch using its stored `previous` snapshots (deletes inserted rows, restores updated ones). Only for snapshot tables. */
export function revertBatchFromStores(stores: StoreWithAssets[], batch: ImportBatch): StoreWithAssets[] {
  if (RECORD_MODE[batch.targetTable] === "log") return stores;
  let result = [...stores];
  const byCode = new Map(result.map((s) => [s.store_code, s]));

  batch.rows.forEach((r) => {
    if (r.operation === "insert") {
      result = result.filter((s) => s.store_code !== r.storeCode);
      return;
    }
    if (r.operation !== "update" || !r.previous) return;
    const store = byCode.get(r.storeCode);
    if (!store) return;
    if (batch.targetTable === "stores") {
      Object.assign(store, r.previous);
    } else if (store.asset) {
      Object.assign(store.asset, coerceAssetTypes(r.previous));
    }
  });
  return result;
}

function coerceAssetTypes(values: Record<string, any>) {
  const numericFields = ["camera_total", "camera_working", "camera_failed"];
  const out = { ...values };
  numericFields.forEach((f) => {
    if (out[f] !== undefined && out[f] !== null && out[f] !== "") out[f] = Number(out[f]);
  });
  return out;
}

/** Demo-mode (no Supabase): appends new maintenance records to the in-memory list, tagging each with a local id for rollback. */
export function applyBatchToMaintenance(records: any[], batch: ImportBatch): any[] {
  if (batch.targetTable !== "maintenance_history") return records;
  const result = [...records];
  batch.rows.forEach((r) => {
    if (r.operation !== "insert") return;
    const localId = `local_${Math.random().toString(36).slice(2)}`;
    r.insertedId = localId;
    result.push({
      id: localId,
      store_id: r.storeCode, // demo mode only — real mode resolves this to a UUID
      supplier_id: null,
      ticket_ref: r.next.ticket_ref ?? null,
      status: ["Pending", "In Progress", "Completed"].includes(r.next.status) ? r.next.status : "Pending",
      issue_date: r.next.issue_date || new Date().toISOString().slice(0, 10),
      started_date: r.next.started_date ?? null,
      completed_date: r.next.completed_date ?? null,
      vendor: r.next.vendor ?? null,
      problem: r.next.problem ?? null,
      root_cause: r.next.root_cause ?? null,
      resolution: r.next.resolution ?? null,
      cost: r.next.cost ? Number(r.next.cost) : 0,
      technician: r.next.technician ?? null,
      attachment_url: null,
      created_at: new Date().toISOString(),
    });
  });
  return result;
}

/** Demo-mode rollback: removes records this batch inserted, by their local id. */
export function revertBatchFromMaintenance(records: any[], batch: ImportBatch): any[] {
  if (batch.targetTable !== "maintenance_history") return records;
  const insertedIds = new Set(batch.rows.map((r) => r.insertedId).filter(Boolean));
  return records.filter((r) => !insertedIds.has(r.id));
}
