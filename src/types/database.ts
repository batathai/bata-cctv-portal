// Hand-written types mirroring supabase/schema.sql.
// Regenerate with `supabase gen types typescript` once the project is linked
// for a fully generated version — this hand-authored version is enough to
// build against today.

import type { UserRole } from "@/lib/rbac";
export type { UserRole } from "@/lib/rbac";
export type OverallStatus = "Healthy" | "Partial" | "Offline" | "Unknown";

// --- Sprint 1: Recovery Dashboard (first 50 priority stores) ---
export type RecoveryRegion = "BKK" | "Upcountry";
export type RecoveryStatus = "Normal" | "Camera Issue" | "DVR Failure" | "Device Not Registered";
export type RecoveryStage =
  | "Waiting Vendor Quote"
  | "Waiting Approval"
  | "Waiting Repair"
  | "Repairing"
  | "Completed"
  | "Verified";

export interface Store {
  id: string;
  store_code: string;
  store_name: string;
  region: "Bangkok" | "Upcountry";
  zone: string;
  province: string | null;
  address: string | null;
  phone: string | null;
  store_group: string | null;
  supplier_id: string | null;
  overall_status: OverallStatus;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Sprint 1: Recovery Dashboard fields. All nullable/optional so existing
  // rows (and any real Supabase project that hasn't run migration 005 yet)
  // keep working — see src/lib/recovery.ts for fallback derivation.
  is_recovery50?: boolean;
  recovery_status?: RecoveryStatus | null;
  recovery_stage?: RecoveryStage | null;
  cause?: string | null;
  required_action?: string | null;
  // Sprint 2: Recovery Center. Denormalized onto `stores` (rather than read
  // from `cctv_assets`) on purpose: bkk_manager / country_manager can read
  // `stores` but are deliberately blocked from `cctv_assets` (see migration
  // 004's comment) — keeping these summary fields here means their Store
  // Detail page works without reopening that access.
  online_status?: "Online" | "Offline" | null;
  camera_status?: "OK" | "Partial" | "Not Work" | null;
  add_device_status?: "Registered" | "Not Registered" | null;
  repair_date?: string | null;
  // Free-text "Details" field on the Recovery Info card — separate from
  // Cause/Required Action so notes that don't fit either can still be
  // captured (e.g. "รอ vendor ยืนยันวันเข้างาน").
  recovery_notes?: string | null;
  // Which Work Order "Job" this store currently belongs to (migration 017)
  // — replaces is_recovery50 as the actual scoping mechanism; that field is
  // left in place but unused going forward (it could only ever represent
  // one batch). null = not currently part of any job.
  batch_id?: string | null;
}

// A round of work orders — "Job 1: 50-Store Pilot", "Job 2: ...", etc. The
// Work Orders page lists these; opening one shows just the stores whose
// `batch_id` matches. Closing a batch (status: "Closed") moves it to the
// History section without touching any of the stores/tickets/stage data
// underneath — purely a grouping/visibility concept.
export interface WorkOrderBatch {
  id: string;
  name: string;
  status: "Active" | "Closed";
  created_at: string;
  closed_at: string | null;
}

export interface CctvAsset {
  id: string;
  store_id: string;
  nvr_brand: string | null;
  nvr_model: string | null;
  nvr_serial: string | null;
  nvr_firmware: string | null;
  nvr_mac: string | null;
  nvr_install_date: string | null;
  nvr_online: boolean;
  camera_total: number;
  camera_working: number;
  camera_failed: number;
  camera_status: "OK" | "Partial" | "Not Work" | null;
  hdd_capacity: string | null;
  hdd_status: "Healthy" | "Warning" | "Failed" | null;
  hdd_install_date: string | null;
  playback_status: "Working" | "Not Working" | null;
  isp: string | null;
  router_model: string | null;
  internet_type: string | null;
  updated_at: string;
  // Sprint 4 - Device Identity (persists across store relocations; see
  // src/lib/assetWrite.ts's relocateAsset). Kept on cctv_assets, not on
  // `stores`, precisely because "1 Device = 1 Identity" independent of
  // which store it's currently assigned to.
  hik_uid: string | null;
  qr_code_path: string | null;
}

export interface HikConnectDevice {
  id: string;
  store_id: string;
  device_name: string | null;
  hikconnect_status: "Online" | "Offline" | null;
  owner_account: string | null;
  shared_accounts: string[];
  verification_code: string | null;
  last_verified_date: string | null;
  ivms_account: string | null;
  updated_at: string;
}

export type RepairStatus = "Pending" | "In Progress" | "Completed";

export interface MaintenanceRecord {
  id: string;
  store_id: string;
  supplier_id: string | null;
  ticket_ref: string | null;
  status: RepairStatus;
  issue_date: string;
  started_date: string | null;
  completed_date: string | null;
  vendor: string | null;
  problem: string | null;
  root_cause: string | null;
  resolution: string | null;
  cost: number;
  technician: string | null;
  attachment_url: string | null;
  created_at: string;
}

export interface AuditRecord {
  id: string;
  store_id: string;
  audit_date: string;
  auditor: string | null;
  playback_result: string | null;
  hdd_result: string | null;
  camera_result: string | null;
  hikconnect_result: string | null;
  overall_status: string | null;
  audit_score: number | null;
  notes: string | null;
}

// Sprint 3 - Repair Ticket (backed by the pre-existing `incident_tickets`
// table in schema.sql, which had RLS policies but no application code yet).
export type TicketIssueType = "Camera Failure" | "Playback Failure" | "HDD Failure" | "NVR Offline" | "Network Failure" | "Hik-Connect Failure";
export type TicketStatus = "Open" | "Assigned" | "In Progress" | "Waiting Parts" | "Completed" | "Closed";

export interface IncidentTicket {
  id: string;
  store_id: string;
  issue_type: TicketIssueType | null;
  status: TicketStatus;
  assigned_supplier_id: string | null;
  description: string | null;
  opened_at: string;
  closed_at: string | null;
}

// Sprint 3 - Asset Register file uploads (photos + documents), backed by the
// pre-existing `attachments` table.
export type AttachmentFolder =
  | "DVR Photos"
  | "NVR Photos"
  | "HDD Photos"
  | "Camera Photos"
  | "Serial Sticker Photos"
  | "Audit Reports"
  | "Repair Reports"
  | "Invoice"
  | "Warranty"
  | "Manual";

export interface Attachment {
  id: string;
  store_id: string;
  folder: AttachmentFolder | null;
  file_path: string;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
}

// Sprint 2 - Recovery Center, Task 3: Vendor Information.
// UI + DB structure only for now ("no workflow yet") — multiple quotations
// per store are supported (e.g. re-quote after rejection) so this is its
// own table rather than columns bolted onto `stores`.
export type QuotationApprovalStatus = "Pending" | "Approved" | "Rejected";

export interface VendorQuotation {
  id: string;
  store_id: string;
  vendor_name: string | null;
  quotation_number: string | null;
  estimated_cost: number | null;
  quotation_date: string | null;
  approval_status: QuotationApprovalStatus;
  created_at: string;
  updated_at: string;
}

// Sprint 4 - Work Orders: append-only log of every recovery_stage change on
// a store, so the Work Order detail page can show step-by-step status updates (a
// step-by-step timeline) instead of just the current stage. Written
// alongside every `updateRecoveryStageDb` call — never edited or deleted.
export interface RecoveryStageHistoryEntry {
  id: string;
  store_id: string;
  from_stage: RecoveryStage | null;
  to_stage: RecoveryStage;
  note: string | null;
  changed_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  assigned_zones: string[];
  supplier_id: string | null;
  is_active: boolean;
}

export interface ImportBatch {
  id: string;
  target_table: string;
  file_name: string | null;
  column_mapping: Record<string, string>;
  row_count: number;
  status: "completed" | "rolled_back" | "failed";
  created_at: string;
  rolled_back_at: string | null;
}

// Composite, denormalized shape used throughout the UI (joins store + asset + hikconnect).
export interface StoreWithAssets extends Store {
  asset: CctvAsset | null;
  hikconnect: HikConnectDevice | null;
  healthScore: number;
  supplierName: string;
}

// Minimal Supabase `Database` generic — extend as more tables are typed.
export interface Database {
  public: {
    Tables: {
      stores: { Row: Store; Insert: Partial<Store>; Update: Partial<Store> };
      cctv_assets: { Row: CctvAsset; Insert: Partial<CctvAsset>; Update: Partial<CctvAsset> };
      hikconnect_devices: { Row: HikConnectDevice; Insert: Partial<HikConnectDevice>; Update: Partial<HikConnectDevice> };
      maintenance_history: { Row: MaintenanceRecord; Insert: Partial<MaintenanceRecord>; Update: Partial<MaintenanceRecord> };
      audit_history: { Row: AuditRecord; Insert: Partial<AuditRecord>; Update: Partial<AuditRecord> };
      suppliers: { Row: Supplier; Insert: Partial<Supplier>; Update: Partial<Supplier> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      import_batches: { Row: ImportBatch; Insert: Partial<ImportBatch>; Update: Partial<ImportBatch> };
      vendor_quotations: { Row: VendorQuotation; Insert: Partial<VendorQuotation>; Update: Partial<VendorQuotation> };
      incident_tickets: { Row: IncidentTicket; Insert: Partial<IncidentTicket>; Update: Partial<IncidentTicket> };
      recovery_stage_history: { Row: RecoveryStageHistoryEntry; Insert: Partial<RecoveryStageHistoryEntry>; Update: Partial<RecoveryStageHistoryEntry> };
      attachments: { Row: Attachment; Insert: Partial<Attachment>; Update: Partial<Attachment> };
    };
  };
}
