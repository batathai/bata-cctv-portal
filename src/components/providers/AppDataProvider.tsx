"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchStores,
  fetchMaintenance,
  fetchAudits,
  fetchVendorQuotations,
  fetchIncidentTickets,
  fetchAttachments,
  fetchRecoveryStageHistory,
  fetchWorkOrderBatches,
} from "@/lib/data";
import { fetchCurrentProfile } from "@/lib/profile";
import { type UserRole, ROLE_LABELS } from "@/lib/rbac";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  StoreWithAssets,
  MaintenanceRecord,
  AuditRecord,
  VendorQuotation,
  IncidentTicket,
  Attachment,
  AttachmentFolder,
  RecoveryStageHistoryEntry,
  WorkOrderBatch,
} from "@/types/database";
import { SUPPLIERS } from "@/lib/mockData";
import {
  buildImportRows,
  applyBatchToStores,
  revertBatchFromStores,
  applyBatchToMaintenance,
  revertBatchFromMaintenance,
  type ImportBatch,
  type TargetTable,
} from "@/lib/importHistory";
import {
  upsertStoresToSupabase,
  upsertCctvAssetsToSupabase,
  insertMaintenanceRecords,
  deleteStoreByCode,
  updateStoreByCode,
  updateAssetByStoreId,
  deleteMaintenanceRecordById,
} from "@/lib/importWrite";
import {
  createMaintenanceRecordDb,
  updateMaintenanceRecordDb,
  deleteMaintenanceRecordDb,
  REPAIR_STATUS_TO_OVERALL_STATUS,
  type MaintenanceFormInput,
} from "@/lib/maintenanceWrite";
import { updateRecoveryStageDb, addRecoveryRemarkDb, deleteRecoveryRemarkDb } from "@/lib/recoveryWrite";
import { createWorkOrderBatchDb, setWorkOrderBatchStatusDb } from "@/lib/workOrderBatchWrite";
import { zoneCode, regionFromZone } from "@/lib/recovery";
import { updateStoreDetailsDb, updateAssetDetailsDb, updateHikconnectDetailsDb, relocateAssetDb, uploadQrCodeDb } from "@/lib/assetWrite";
import { createIncidentTicketDb, updateIncidentTicketStatusDb, type TicketFormInput } from "@/lib/ticketWrite";
import { uploadAttachment as uploadAttachmentDb, deleteAttachment as deleteAttachmentDb, getAttachmentUrl } from "@/lib/attachmentWrite";
import type { RecoveryStage, TicketStatus } from "@/types/database";

export interface Filters {
  region: string;
  zone: string;
  status: string;
}

interface AppDataContextValue {
  loading: boolean;
  profileLoaded: boolean;
  role: UserRole;
  setRole: (r: UserRole) => void;
  isDemoMode: boolean;
  // True when the person is genuinely logged in via Supabase but has no
  // matching `profiles` row — RLS will silently return zero rows for
  // everything in this state, so the UI shows a clear message instead of a
  // confusingly empty dashboard under a stale role label.
  accountNotProvisioned: boolean;
  unprovisionedEmail: string | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  allStores: StoreWithAssets[];
  stores: StoreWithAssets[]; // role + filter scoped
  maintenance: MaintenanceRecord[];
  audits: AuditRecord[];
  vendorQuotations: VendorQuotation[];
  tickets: IncidentTicket[];
  recoveryStageHistory: RecoveryStageHistoryEntry[];
  workOrderBatches: WorkOrderBatch[];
  attachments: Attachment[];
  suppliers: string[];
  importBatches: ImportBatch[];
  runImport: (
    targetTable: TargetTable,
    mapping: Record<string, string>,
    parsedRows: Record<string, string>[],
    fileName: string
  ) => Promise<ImportBatch>;
  rollbackImport: (batchId: string) => Promise<void>;
  addMaintenanceRecord: (input: MaintenanceFormInput) => Promise<void>;
  updateMaintenanceRecord: (id: string, patch: Partial<MaintenanceFormInput>) => Promise<void>;
  deleteMaintenanceRecord: (id: string) => Promise<void>;
  updateRecoveryStage: (storeId: string, stage: RecoveryStage, note?: string) => Promise<void>;
  addRecoveryRemark: (storeId: string, stage: RecoveryStage, note: string) => Promise<void>;
  deleteRecoveryRemark: (historyId: string) => Promise<void>;
  createWorkOrderBatch: (name: string) => Promise<WorkOrderBatch>;
  closeWorkOrderBatch: (batchId: string) => Promise<void>;
  reopenWorkOrderBatch: (batchId: string) => Promise<void>;
  assignStoreToBatch: (storeId: string, batchId: string) => Promise<void>;
  refreshAllData: () => Promise<void>;
  createTicket: (input: TicketFormInput) => Promise<void>;
  updateTicketStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  uploadAttachment: (storeCode: string, storeId: string, folder: AttachmentFolder, file: File) => Promise<void>;
  deleteAttachment: (attachmentId: string, filePath: string) => Promise<void>;
  resolveAttachmentUrl: (filePath: string) => Promise<string | null>;
  editAssetDetails: (
    storeId: string,
    patch: { store?: Record<string, any>; asset?: Record<string, any>; hikconnect?: Record<string, any> }
  ) => Promise<void>;
  relocateAsset: (sourceStoreId: string, targetStoreCode: string) => Promise<void>;
  uploadQrCode: (storeCode: string, storeId: string, file: File) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>("hq_admin");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [accountNotProvisioned, setAccountNotProvisioned] = useState(false);
  const [unprovisionedEmail, setUnprovisionedEmail] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ region: "", zone: "", status: "" });
  const [allStores, setAllStores] = useState<StoreWithAssets[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [vendorQuotations, setVendorQuotations] = useState<VendorQuotation[]>([]);
  const [tickets, setTickets] = useState<IncidentTicket[]>([]);
  const [recoveryStageHistory, setRecoveryStageHistory] = useState<RecoveryStageHistoryEntry[]>([]);
  const [workOrderBatches, setWorkOrderBatches] = useState<WorkOrderBatch[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  async function refreshAllData() {
    const [s, m, a, profileResult, vq, tk, att, rsh, wob] = await Promise.all([
      fetchStores(),
      fetchMaintenance(),
      fetchAudits(),
      fetchCurrentProfile(),
      fetchVendorQuotations(),
      fetchIncidentTickets(),
      fetchAttachments(),
      fetchRecoveryStageHistory(),
      fetchWorkOrderBatches(),
    ]);
    setAllStores(s);
    setMaintenance(m);
    setAudits(a);
    setVendorQuotations(vq);
    setTickets(tk);
    setAttachments(att);
    setRecoveryStageHistory(rsh);
    setWorkOrderBatches(wob);
    if (profileResult.status === "ok") {
      setRole(profileResult.profile.role);
    } else if (profileResult.status === "not_provisioned") {
      setAccountNotProvisioned(true);
      setUnprovisionedEmail(profileResult.email);
    }
    setProfileLoaded(true);
  }

  useEffect(() => {
    // This provider wraps the whole (portal) layout and mounts once per
    // browser session — plain client-side navigation between pages (e.g.
    // Dashboard -> Reports) does NOT re-run this, so anything changed in
    // Supabase after the tab was first opened (by this admin in another
    // tab, a teammate, a direct SQL edit, etc.) stays invisible until a
    // full page reload. refreshAllData is exposed via context specifically
    // so pages where staleness actually matters (Reports, in particular —
    // it's meant to be a point-in-time accurate snapshot) can force a
    // refetch on their own mount instead of trusting whatever was cached
    // whenever the session started.
    let mounted = true;
    refreshAllData().then(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const stores = useMemo(() => {
    let list = allStores;
    if (filters.region) list = list.filter((s) => regionFromZone(s.zone) === filters.region);
    if (filters.zone) list = list.filter((s) => zoneCode(s.zone) === filters.zone);
    if (filters.status) list = list.filter((s) => s.overall_status === filters.status);
    return list;
  }, [allStores, filters]);

  async function runImport(
    targetTable: TargetTable,
    mapping: Record<string, string>,
    parsedRows: Record<string, string>[],
    fileName: string
  ): Promise<ImportBatch> {
    const rows = buildImportRows(targetTable, mapping, parsedRows, allStores);
    const batch: ImportBatch = {
      id: `batch_${Date.now()}`,
      targetTable,
      fileName,
      mapping,
      rows,
      createdAt: new Date().toISOString(),
      status: "completed",
    };

    if (isSupabaseConfigured) {
      const supabase = createClient();
      if (targetTable === "stores") {
        const payload = rows
          .filter((r) => r.operation !== "not_found")
          .map((r) => ({ store_code: r.storeCode, operation: r.operation as "insert" | "update", ...r.next }));
        await upsertStoresToSupabase(supabase, payload);
        setAllStores(await fetchStores());
      } else if (targetTable === "cctv_assets") {
        const storeCodeToId = new Map(allStores.map((s) => [s.store_code, s.id]));
        const payload = rows
          .filter((r) => r.operation === "update")
          .map((r) => ({ store_code: r.storeCode, ...r.next }));
        await upsertCctvAssetsToSupabase(supabase, payload, storeCodeToId);
        setAllStores(await fetchStores());
      } else {
        // maintenance_history: append-only log, no store fields to refresh.
        const storeCodeToId = new Map(allStores.map((s) => [s.store_code, s.id]));
        const insertRows = rows.filter((r) => r.operation === "insert");
        const payload = insertRows.map((r) => ({ store_code: r.storeCode, ...r.next }));
        const inserted = await insertMaintenanceRecords(supabase, payload, storeCodeToId);
        insertRows.forEach((r, i) => {
          r.insertedId = (inserted[i] as any)?.id;
        });
        setMaintenance(await fetchMaintenance());
      }
    } else {
      setAllStores((prev) => applyBatchToStores([...prev], batch));
      setMaintenance((prev) => applyBatchToMaintenance(prev, batch));
    }

    setImportBatches((prev) => [batch, ...prev]);
    return batch;
  }

  async function rollbackImport(batchId: string) {
    const batch = importBatches.find((b) => b.id === batchId);
    if (!batch || batch.status === "rolled_back") return;

    if (isSupabaseConfigured) {
      const supabase = createClient();
      if (batch.targetTable === "stores") {
        for (const r of batch.rows) {
          if (r.operation === "not_found") continue;
          if (r.operation === "insert") {
            await deleteStoreByCode(supabase, r.storeCode);
          } else if (r.previous) {
            await updateStoreByCode(supabase, r.storeCode, r.previous);
          }
        }
        setAllStores(await fetchStores());
      } else if (batch.targetTable === "cctv_assets") {
        for (const r of batch.rows) {
          if (r.operation === "update" && r.previous) {
            const store = allStores.find((s) => s.store_code === r.storeCode);
            if (store) await updateAssetByStoreId(supabase, store.id, r.previous);
          }
        }
        setAllStores(await fetchStores());
      } else {
        for (const r of batch.rows) {
          if (r.operation === "insert" && r.insertedId) {
            await deleteMaintenanceRecordById(supabase, r.insertedId);
          }
        }
        setMaintenance(await fetchMaintenance());
      }
    } else {
      setAllStores((prev) => revertBatchFromStores([...prev], batch));
      setMaintenance((prev) => revertBatchFromMaintenance(prev, batch));
    }

    setImportBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, status: "rolled_back" } : b)));
  }

  async function addMaintenanceRecord(input: MaintenanceFormInput) {
    const mappedStatus = REPAIR_STATUS_TO_OVERALL_STATUS[input.status];
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await createMaintenanceRecordDb(supabase, input);
      await updateStoreDetailsDb(supabase, input.store_id, { overall_status: mappedStatus });
      setMaintenance(await fetchMaintenance());
      setAllStores(await fetchStores());
    } else {
      const now = new Date().toISOString();
      setMaintenance((prev) => [
        {
          id: `local_${Date.now()}`,
          store_id: input.store_id,
          supplier_id: null,
          ticket_ref: input.ticket_ref ?? null,
          status: input.status,
          issue_date: input.issue_date,
          started_date: input.started_date ?? null,
          completed_date: input.completed_date ?? null,
          vendor: input.vendor ?? null,
          problem: input.problem ?? null,
          root_cause: input.root_cause ?? null,
          resolution: input.resolution ?? null,
          cost: input.cost ?? 0,
          technician: input.technician ?? null,
          attachment_url: null,
          created_at: now,
        },
        ...prev,
      ]);
      setAllStores((prev) => prev.map((s) => (s.id === input.store_id ? { ...s, overall_status: mappedStatus } : s)));
    }
  }

  async function updateMaintenanceRecord(id: string, patch: Partial<MaintenanceFormInput>) {
    const existing = maintenance.find((r) => r.id === id);
    const storeId = patch.store_id ?? existing?.store_id;
    const mappedStatus = patch.status ? REPAIR_STATUS_TO_OVERALL_STATUS[patch.status] : null;

    if (isSupabaseConfigured) {
      const supabase = createClient();
      await updateMaintenanceRecordDb(supabase, id, patch);
      if (mappedStatus && storeId) {
        await updateStoreDetailsDb(supabase, storeId, { overall_status: mappedStatus });
      }
      setMaintenance(await fetchMaintenance());
      if (mappedStatus) setAllStores(await fetchStores());
    } else {
      setMaintenance((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      if (mappedStatus && storeId) {
        setAllStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, overall_status: mappedStatus } : s)));
      }
    }
  }

  async function deleteMaintenanceRecord(id: string) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await deleteMaintenanceRecordDb(supabase, id);
      setMaintenance(await fetchMaintenance());
    } else {
      setMaintenance((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function updateRecoveryStage(storeId: string, stage: RecoveryStage, note?: string) {
    const currentStore = allStores.find((s) => s.id === storeId);
    const fromStage = currentStore?.recovery_stage ?? null;
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await updateRecoveryStageDb(supabase, storeId, stage, fromStage, note);
      setAllStores(await fetchStores());
      setRecoveryStageHistory(await fetchRecoveryStageHistory());
    } else {
      setAllStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, recovery_stage: stage } : s)));
      setRecoveryStageHistory((prev) => [
        {
          id: `rsh_local_${Date.now()}`,
          store_id: storeId,
          from_stage: fromStage,
          to_stage: stage,
          note: note || null,
          changed_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }

  // Adds a remark to any stage (current or past) WITHOUT changing
  // stores.recovery_stage — see addRecoveryRemarkDb's comment.
  async function addRecoveryRemark(storeId: string, stage: RecoveryStage, note: string) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await addRecoveryRemarkDb(supabase, storeId, stage, note);
      setRecoveryStageHistory(await fetchRecoveryStageHistory());
    } else {
      setRecoveryStageHistory((prev) => [
        {
          id: `rsh_local_${Date.now()}`,
          store_id: storeId,
          from_stage: stage,
          to_stage: stage,
          note,
          changed_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }

  // Deletes a remark (from_stage === to_stage) row — real stage-transition
  // rows are rejected by the DB delete policy itself (migration 014); the
  // caller (StageTimeline) only ever offers this on remark rows anyway.
  async function deleteRecoveryRemark(historyId: string) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await deleteRecoveryRemarkDb(supabase, historyId);
      setRecoveryStageHistory(await fetchRecoveryStageHistory());
    } else {
      setRecoveryStageHistory((prev) => prev.filter((h) => h.id !== historyId));
    }
  }

  async function createWorkOrderBatch(name: string): Promise<WorkOrderBatch> {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      const created = await createWorkOrderBatchDb(supabase, name);
      setWorkOrderBatches(await fetchWorkOrderBatches());
      return created as WorkOrderBatch;
    }
    const batch: WorkOrderBatch = { id: `batch_local_${Date.now()}`, name, status: "Active", created_at: new Date().toISOString(), closed_at: null };
    setWorkOrderBatches((prev) => [batch, ...prev]);
    return batch;
  }

  async function setBatchStatus(batchId: string, status: "Active" | "Closed") {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await setWorkOrderBatchStatusDb(supabase, batchId, status);
      setWorkOrderBatches(await fetchWorkOrderBatches());
    } else {
      setWorkOrderBatches((prev) =>
        prev.map((b) => (b.id === batchId ? { ...b, status, closed_at: status === "Closed" ? new Date().toISOString() : null } : b))
      );
    }
  }
  const closeWorkOrderBatch = (batchId: string) => setBatchStatus(batchId, "Closed");
  const reopenWorkOrderBatch = (batchId: string) => setBatchStatus(batchId, "Active");

  // Assigning a store to a batch is just a normal store field patch — reuses
  // the same write path as everything else in editAssetDetails, no new DB
  // function needed.
  async function assignStoreToBatch(storeId: string, batchId: string) {
    await editAssetDetails(storeId, { store: { batch_id: batchId } });
  }

  async function createTicket(input: TicketFormInput) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await createIncidentTicketDb(supabase, input);
      setTickets(await fetchIncidentTickets());
    } else {
      setTickets((prev) => [
        {
          id: `tk_local_${Date.now()}`,
          store_id: input.store_id,
          issue_type: input.issue_type,
          status: "Open",
          assigned_supplier_id: null,
          description: input.description ?? null,
          opened_at: new Date().toISOString().slice(0, 10),
          closed_at: null,
        },
        ...prev,
      ]);
    }
  }

  async function updateTicketStatus(ticketId: string, status: TicketStatus) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await updateIncidentTicketStatusDb(supabase, ticketId, status);
      setTickets(await fetchIncidentTickets());
    } else {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? { ...t, status, closed_at: status === "Closed" ? new Date().toISOString().slice(0, 10) : t.closed_at }
            : t
        )
      );
    }
  }

  async function uploadAttachment(storeCode: string, storeId: string, folder: AttachmentFolder, file: File) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await uploadAttachmentDb(supabase, storeCode, storeId, folder, file);
      setAttachments(await fetchAttachments());
    } else {
      // Demo mode has no real Storage to upload to — record the metadata
      // only, using a local blob URL so it's still viewable this session.
      setAttachments((prev) => [
        {
          id: `att_local_${Date.now()}`,
          store_id: storeId,
          folder,
          file_path: URL.createObjectURL(file),
          file_name: file.name,
          uploaded_by: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }

  async function deleteAttachment(attachmentId: string, filePath: string) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await deleteAttachmentDb(supabase, attachmentId, filePath);
      setAttachments(await fetchAttachments());
    } else {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
  }

  /** Demo mode stores a directly-usable blob: URL in file_path already; real Supabase needs a signed URL. */
  async function resolveAttachmentUrl(filePath: string): Promise<string | null> {
    if (!isSupabaseConfigured) return filePath;
    const supabase = createClient();
    return getAttachmentUrl(supabase, filePath);
  }

  async function editAssetDetails(
    storeId: string,
    patch: { store?: Record<string, any>; asset?: Record<string, any>; hikconnect?: Record<string, any> }
  ) {
    // overall_status/recovery_status used to be silently recomputed here
    // from the merged asset/hikconnect condition on every save. That broke
    // the moment EditableStatusBadge (manual status override) shipped: the
    // Edit Detail form still always submits an `asset` patch (even when
    // only e.g. Store Name changed), which re-ran deriveOverallStatusFromAsset
    // off camera_working/camera_failed/camera_status/hdd_status/
    // playback_status — fields the form no longer even collects (see
    // EditAssetModal, pared down to Total/Brand/Model/Serial/Install
    // Date/Online/HDD Capacity only). Those inputs are permanently stale
    // now, so the recompute would silently REVERT a manual status override
    // back to whatever it derived from old import data, the next time
    // anyone saved an unrelated field on the same store. overall_status is
    // now purely manual (the pencil-edit on the badge); recovery_status
    // still gets one narrow, reliable signal — "Device Not Registered" —
    // from ivms_account, since that field IS still tracked and edited here.
    const storePatch = { ...(patch.store ?? {}) };
    if (patch.hikconnect && "ivms_account" in patch.hikconnect && !patch.hikconnect.ivms_account) {
      storePatch.recovery_status = "Device Not Registered";
    }

    if (isSupabaseConfigured) {
      const supabase = createClient();
      await Promise.all([
        Object.keys(storePatch).length ? updateStoreDetailsDb(supabase, storeId, storePatch) : Promise.resolve(),
        patch.asset ? updateAssetDetailsDb(supabase, storeId, patch.asset) : Promise.resolve(),
        patch.hikconnect ? updateHikconnectDetailsDb(supabase, storeId, patch.hikconnect) : Promise.resolve(),
      ]);
      setAllStores(await fetchStores());
    } else {
      setAllStores((prev) =>
        prev.map((s) =>
          s.id === storeId
            ? {
                ...s,
                ...storePatch,
                asset: s.asset ? { ...s.asset, ...(patch.asset ?? {}) } : s.asset,
                hikconnect: s.hikconnect ? { ...s.hikconnect, ...(patch.hikconnect ?? {}) } : s.hikconnect,
              }
            : s
        )
      );
    }
  }

  async function relocateAsset(sourceStoreId: string, targetStoreCode: string) {
    const sourceStore = allStores.find((s) => s.id === sourceStoreId);
    if (!sourceStore?.asset) throw new Error("This store has no device to relocate.");

    if (isSupabaseConfigured) {
      const supabase = createClient();
      await relocateAssetDb(supabase, sourceStore.asset.id, targetStoreCode);
      setAllStores(await fetchStores());
    } else {
      const targetStore = allStores.find((s) => s.store_code === targetStoreCode);
      if (!targetStore) throw new Error(`Store ${targetStoreCode} not found.`);
      if (targetStore.asset) throw new Error(`Store ${targetStoreCode} already has a device assigned. Move that device out first.`);
      const movedAsset = { ...sourceStore.asset, store_id: targetStore.id };
      setAllStores((prev) =>
        prev.map((s) => {
          if (s.id === sourceStoreId) return { ...s, asset: null };
          if (s.id === targetStore.id) return { ...s, asset: movedAsset };
          return s;
        })
      );
    }
  }

  async function uploadQrCode(storeCode: string, storeId: string, file: File) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await uploadQrCodeDb(supabase, storeCode, storeId, file);
      setAllStores(await fetchStores());
    } else {
      const localUrl = URL.createObjectURL(file);
      setAllStores((prev) => prev.map((s) => (s.id === storeId && s.asset ? { ...s, asset: { ...s.asset, qr_code_path: localUrl } } : s)));
    }
  }

  const value: AppDataContextValue = {
    loading,
    profileLoaded,
    role,
    setRole,
    isDemoMode: !isSupabaseConfigured,
    accountNotProvisioned,
    unprovisionedEmail,
    filters,
    setFilters,
    allStores,
    stores,
    maintenance,
    audits,
    vendorQuotations,
    tickets,
    recoveryStageHistory,
    workOrderBatches,
    attachments,
    suppliers: SUPPLIERS,
    importBatches,
    runImport,
    rollbackImport,
    addMaintenanceRecord,
    updateMaintenanceRecord,
    deleteMaintenanceRecord,
    updateRecoveryStage,
    addRecoveryRemark,
    deleteRecoveryRemark,
    createWorkOrderBatch,
    closeWorkOrderBatch,
    reopenWorkOrderBatch,
    assignStoreToBatch,
    refreshAllData,
    createTicket,
    updateTicketStatus,
    uploadAttachment,
    deleteAttachment,
    resolveAttachmentUrl,
    editAssetDetails,
    relocateAsset,
    uploadQrCode,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export { ROLE_LABELS };
