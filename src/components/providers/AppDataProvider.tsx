"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchStores, fetchMaintenance, fetchAudits, fetchVendorQuotations, fetchIncidentTickets, fetchAttachments } from "@/lib/data";
import { fetchCurrentProfile } from "@/lib/profile";
import { ROLE_ZONES, type UserRole, ROLE_LABELS } from "@/lib/rbac";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { StoreWithAssets, MaintenanceRecord, AuditRecord, VendorQuotation, IncidentTicket, Attachment, AttachmentFolder } from "@/types/database";
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
import { updateRecoveryStageDb } from "@/lib/recoveryWrite";
import { deriveOverallStatusFromAsset, deriveRecoveryStatusFromAsset } from "@/lib/recovery";
import { updateStoreDetailsDb, updateAssetDetailsDb, updateHikconnectDetailsDb, relocateAssetDb, uploadQrCodeDb } from "@/lib/assetWrite";
import { createIncidentTicketDb, updateIncidentTicketStatusDb, type TicketFormInput } from "@/lib/ticketWrite";
import { uploadAttachment as uploadAttachmentDb, deleteAttachment as deleteAttachmentDb, getAttachmentUrl } from "@/lib/attachmentWrite";
import type { RecoveryStage, TicketStatus } from "@/types/database";

export interface Filters {
  region: string;
  zone: string;
  supplier: string;
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
  updateRecoveryStage: (storeId: string, stage: RecoveryStage) => Promise<void>;
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
  // Per-user zone assignment from their real `profiles` row (e.g. one BKK
  // Manager sees only "511", another only "512"). Falls back to the static
  // ROLE_ZONES map below when there's no real profile yet (demo mode, or a
  // role that hasn't been assigned specific zones).
  const [assignedZones, setAssignedZones] = useState<string[] | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [accountNotProvisioned, setAccountNotProvisioned] = useState(false);
  const [unprovisionedEmail, setUnprovisionedEmail] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ region: "", zone: "", supplier: "", status: "" });
  const [allStores, setAllStores] = useState<StoreWithAssets[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [vendorQuotations, setVendorQuotations] = useState<VendorQuotation[]>([]);
  const [tickets, setTickets] = useState<IncidentTicket[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchStores(),
      fetchMaintenance(),
      fetchAudits(),
      fetchCurrentProfile(),
      fetchVendorQuotations(),
      fetchIncidentTickets(),
      fetchAttachments(),
    ]).then(([s, m, a, profileResult, vq, tk, att]) => {
        if (!mounted) return;
        setAllStores(s);
        setMaintenance(m);
        setAudits(a);
        setVendorQuotations(vq);
        setTickets(tk);
        setAttachments(att);
        // This is what makes RBAC apply to real logins instead of everyone
        // defaulting to hq_admin: once a real profile is found, its role and
        // assigned_zones win over the local demo state.
        if (profileResult.status === "ok") {
          setRole(profileResult.profile.role);
          setAssignedZones(profileResult.profile.assigned_zones ?? []);
        } else if (profileResult.status === "not_provisioned") {
          setAccountNotProvisioned(true);
          setUnprovisionedEmail(profileResult.email);
        }
        setProfileLoaded(true);
        setLoading(false);
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  const stores = useMemo(() => {
    let list = allStores;
    // Only bkk_manager / country_manager are ever zone-restricted. hq_admin
    // and supplier must never be filtered by zone — critically, an empty
    // assigned_zones array (`[]`, which is what a profile row defaults to
    // before anyone fills it in) is NOT the same as "no zones assigned yet,
    // fall back to the default"; `[] ?? fallback` still evaluates to `[]`
    // since `??` only falls back on null/undefined, and `.filter(() =>
    // [].includes(...))` then silently excludes every single store. This bit
    // hq_admin in production: their profiles row had assigned_zones = [].
    if (role === "bkk_manager" || role === "country_manager") {
      const zones = assignedZones && assignedZones.length > 0 ? assignedZones : ROLE_ZONES[role];
      if (zones) list = list.filter((s) => zones.includes(s.zone));
    }
    if (role === "supplier") list = list.filter((s) => s.supplierName === "Flowbridge");
    if (filters.region) list = list.filter((s) => s.region === filters.region);
    if (filters.zone) list = list.filter((s) => s.zone === filters.zone);
    if (filters.supplier) list = list.filter((s) => s.supplierName === filters.supplier);
    if (filters.status) list = list.filter((s) => s.overall_status === filters.status);
    return list;
  }, [allStores, role, assignedZones, filters]);

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

  async function updateRecoveryStage(storeId: string, stage: RecoveryStage) {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await updateRecoveryStageDb(supabase, storeId, stage);
      setAllStores(await fetchStores());
    } else {
      setAllStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, recovery_stage: stage } : s)));
    }
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
    const currentStore = allStores.find((s) => s.id === storeId);
    // Recompute both status fields from the resulting asset/hikconnect
    // condition whenever those are edited — without this, the badges
    // (overall_status) and the Recovery Tracking classification
    // (recovery_status) go stale and stop matching what was actually edited.
    const mergedAsset = patch.asset && currentStore?.asset ? { ...currentStore.asset, ...patch.asset } : patch.asset ?? currentStore?.asset;
    const mergedHikconnect =
      patch.hikconnect && currentStore?.hikconnect ? { ...currentStore.hikconnect, ...patch.hikconnect } : patch.hikconnect ?? currentStore?.hikconnect;
    const statusPatch =
      patch.asset || patch.hikconnect
        ? {
            ...(mergedAsset ? { overall_status: deriveOverallStatusFromAsset(mergedAsset) } : {}),
            recovery_status: deriveRecoveryStatusFromAsset(mergedAsset ?? null, mergedHikconnect ?? null),
          }
        : {};
    const storePatch = { ...(patch.store ?? {}), ...statusPatch };

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
    attachments,
    suppliers: SUPPLIERS,
    importBatches,
    runImport,
    rollbackImport,
    addMaintenanceRecord,
    updateMaintenanceRecord,
    deleteMaintenanceRecord,
    updateRecoveryStage,
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
