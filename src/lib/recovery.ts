import type { RecoveryRegion, RecoveryStage, RecoveryStatus, StoreWithAssets, VendorQuotation, AuditRecord, IncidentTicket, RecoveryStageHistoryEntry } from "@/types/database";
import { ZONES } from "@/lib/mockData";
import { hasOpenTicket, ticketsForStore } from "@/lib/tickets";

/**
 * Sprint 1 - Recovery Dashboard: canonical zone -> region mapping.
 *
 * This matches `Store.region` ("Bangkok" / "Upcountry") everywhere in the
 * app now that zone "550" is classified as Bangkok in mockData.ts,
 * importWrite.ts, and importHistory.ts (previously inconsistent — some
 * treated it as Upcountry). Kept as a separate BKK/Country-labeled map here
 * because the Recovery Dashboard's stat cards and store list use "BKK" /
 * "Country" labels rather than "Bangkok" / "Upcountry".
 */
export const RECOVERY_REGION_BY_ZONE: Record<string, RecoveryRegion> = {
  "511": "BKK",
  "512": "BKK",
  "513": "BKK",
  "550": "BKK",
  "520": "Country",
  "530": "Country",
  "540": "Country",
  "560": "Country",
};

/**
 * Some stores' `zone` values carry a "_ManagerName" suffix from the DM
 * import (e.g. "511_Songpol"), while others are the bare code (e.g. "520")
 * — both mean the same zone. Every zone-keyed lookup in this file goes
 * through this first so DM-suffixed stores classify/label the same as
 * everyone else, instead of silently falling through to a wrong default.
 */
export function zoneCode(zone: string): string {
  return zone.split("_")[0];
}

export function getRecoveryRegion(zone: string): RecoveryRegion {
  return RECOVERY_REGION_BY_ZONE[zoneCode(zone)] ?? "Country";
}

/**
 * Bangkok/Upcountry classification, derived purely from the zone code —
 * same source of truth as getRecoveryRegion (511/512/513/550 -> Bangkok,
 * 520/530/540/560 -> Upcountry) but returning the "Bangkok"/"Upcountry"
 * labels used by `stores.region`, the TopBar Region filter, and Asset
 * Register, instead of the "BKK"/"Country" labels used by the Recovery/Work
 * Order pages. Use this instead of trusting a store's stored `region`
 * column, which can drift out of sync with its `zone` after a messy import.
 */
export function regionFromZone(zone: string): "Bangkok" | "Upcountry" {
  return getRecoveryRegion(zone) === "BKK" ? "Bangkok" : "Upcountry";
}

/** "Area" on the Store Detail page — reuses the human-readable zone label already defined in mockData's ZONES. */
export function getAreaLabel(zone: string): string {
  return ZONES.find((z) => z.code === zoneCode(zone))?.label ?? zoneCode(zone);
}

export const RECOVERY_STATUSES: RecoveryStatus[] = ["Normal", "Camera Issue", "DVR Failure", "Device Not Registered"];
export const RECOVERY_STAGES: RecoveryStage[] = [
  "Waiting Vendor Quote",
  "Waiting Approval",
  "Waiting Repair",
  "Repairing",
  "Completed",
  "Verified",
];

/** Most recent quotation for a store (by quotation_date, falling back to created_at), or null if none yet. */
export function getLatestQuotation(storeId: string, quotations: VendorQuotation[]): VendorQuotation | null {
  const forStore = quotations.filter((q) => q.store_id === storeId);
  if (forStore.length === 0) return null;
  return [...forStore].sort((a, b) => {
    const da = a.quotation_date ?? a.created_at;
    const db = b.quotation_date ?? b.created_at;
    return da < db ? 1 : -1;
  })[0];
}

/**
 * Fallback classification for stores that don't (yet) have an explicit
 * `recovery_status` set on the row — e.g. real Supabase rows created before
 * migration 005, or any store outside the flagged Recovery 50 when viewing
 * "All Stores". Keeps the Dashboard Summary meaningful everywhere instead of
 * requiring every store to be manually tagged.
 */
export function deriveRecoveryStatus(store: StoreWithAssets): RecoveryStatus {
  // Once a work order has been marked Completed/Verified, treat the store
  // as fixed for display — `recovery_status` is set once when the issue is
  // first opened/imported and nothing ever wrote it back to "Normal" on
  // completion, so without this a store's badge kept showing its original
  // failure type (e.g. "DVR Failure") forever after the repair was done and
  // verified. needsRepair() below adds its own recovery_stage check so this
  // doesn't drop finished stores out of the Work Orders list.
  if (store.recovery_stage === "Completed" || store.recovery_stage === "Verified") return "Normal";
  if (store.recovery_status) return store.recovery_status;
  // A store with no asset record yet hasn't actually been surveyed/imported
  // in full — treat it as "not yet checked" rather than guessing it's
  // broken. Without this guard, every newly-imported store that simply
  // hasn't had its Hik-Connect/NVR detail collected yet gets misclassified
  // as "Device Not Registered" (a real problem) instead of "not checked yet"
  // (a data-completeness gap) — see isStoreChecked, which already uses the
  // same asset != null signal for its own "Stores Checked" count.
  if (!store.asset) return "Normal";
  if (!store.hikconnect || !store.hikconnect.ivms_account) return "Device Not Registered";
  if (!store.asset.nvr_online) return "DVR Failure";
  if (store.asset.camera_failed > 0) return "Camera Issue";
  return "Normal";
}

const DEFAULT_CAUSE: Record<RecoveryStatus, string | null> = {
  Normal: null,
  "Camera Issue": "Camera cable/PoE fault or failed camera unit",
  "DVR Failure": "DVR/NVR hardware failure — no signal output",
  "Device Not Registered": "Device never registered to Hik-Connect / iVMS",
};

const DEFAULT_ACTION: Record<RecoveryStatus, string | null> = {
  Normal: null,
  "Camera Issue": "Repair or replace affected camera(s)",
  "DVR Failure": "Replace DVR/NVR unit",
  "Device Not Registered": "Register device to central Hik-Connect / iVMS account",
};

export function getCause(store: StoreWithAssets): string | null {
  return store.cause ?? DEFAULT_CAUSE[deriveRecoveryStatus(store)];
}

export function getRequiredAction(store: StoreWithAssets): string | null {
  return store.required_action ?? DEFAULT_ACTION[deriveRecoveryStatus(store)];
}

/**
 * The remark to show next to a store's status badge in list views (Work
 * Orders, Dashboard, Status). Prefers the most recently logged entry in
 * recovery_stage_history that actually has a note — i.e. whatever was last
 * typed via "Add Remark" / a stage move on the Work Order Progress screen —
 * over the store's static `cause`/`recovery_notes` fields, which are only
 * set once at import time and go stale the moment someone logs a real
 * update. Falls back to cause+details only when no history note exists yet.
 */
export function getLatestRemark(store: StoreWithAssets, history: RecoveryStageHistoryEntry[]): string | null {
  const latest = history
    .filter((h) => h.store_id === store.id && h.note && h.note.trim())
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))[0];
  if (latest) return latest.note;
  return [getCause(store), store.recovery_notes].filter(Boolean).join(" — ") || null;
}

/**
 * iVMS-4200 is a locally-installed desktop client, not a web service — it
 * has no registered URL protocol a browser link can launch (confirmed
 * against Hikvision's docs; earlier versions of this button pretended to
 * "open" it via a web link, which never actually worked). The practical
 * workflow is: open iVMS-4200 on your own machine, then search/add the
 * device by its Cloud P2P account, Hik UID, or Serial Number. This just
 * surfaces whichever identifier is available so it can be copied into iVMS.
 *
 * `hikconnect.ivms_account` is checked first (not `cctv_assets.hik_uid` /
 * `nvr_serial`) because bkk_manager / country_manager can read
 * `hikconnect_devices` but are blocked from `cctv_assets` by RLS (migration
 * 004) — using it first means Live Access still works for them, not just
 * hq_admin/supplier.
 */
export function getIvmsLookup(store: StoreWithAssets): { label: string; value: string } | null {
  const ivmsAccount = store.hikconnect?.ivms_account;
  if (ivmsAccount) return { label: "Cloud P2P Account", value: ivmsAccount };
  const hikUid = store.asset?.hik_uid;
  if (hikUid) return { label: "Hik UID", value: hikUid };
  const serial = store.asset?.nvr_serial;
  if (serial) return { label: "Serial Number", value: serial };
  return null;
}

// --- Sprint 3: Maintenance / Repair Summary bucket classification ---
// Defined per the workflow the retail IT team described:
//   Stores Checked = has an audit on file, or asset data has been synced
//   Healthy        = Health Score >= 80, no classified issue, no open ticket
//   Need Repair    = has a classified issue (Camera Issue/DVR Failure/Device
//                    Not Registered) or an open ticket — the total pool of
//                    known problems, regardless of how far along the fix is
//   Completed      = a Need Repair store whose repair stage or ticket says done
//   Pending        = a Need Repair store that isn't Completed yet
// By construction: Healthy and Need Repair never overlap, and
// Completed + Pending exactly partitions Need Repair.

export function isStoreChecked(store: StoreWithAssets, audits: AuditRecord[]): boolean {
  return store.asset != null || audits.some((a) => a.store_id === store.id);
}

export function isHealthy(store: StoreWithAssets, tickets: IncidentTicket[]): boolean {
  return (
    store.healthScore >= 80 &&
    deriveRecoveryStatus(store) === "Normal" &&
    !hasOpenTicket(store.id, tickets) &&
    store.recovery_stage == null
  );
}

// A store stays counted as "Need Repair" for as long as it has ever had a
// work order opened (recovery_stage set) — even after deriveRecoveryStatus
// reports "Normal" once Completed/Verified — so a finished repair keeps
// showing up in the Work Orders list/counts instead of silently
// disappearing the moment it's fixed. See deriveRecoveryStatus's comment.
export function needsRepair(store: StoreWithAssets, tickets: IncidentTicket[]): boolean {
  return deriveRecoveryStatus(store) !== "Normal" || hasOpenTicket(store.id, tickets) || store.recovery_stage != null;
}

export function isRepairCompleted(store: StoreWithAssets, tickets: IncidentTicket[]): boolean {
  if (!needsRepair(store, tickets)) return false;
  if (store.recovery_stage === "Completed" || store.recovery_stage === "Verified") return true;
  return ticketsForStore(store.id, tickets).some((t) => t.status === "Completed" || t.status === "Closed");
}

export function isRepairPending(store: StoreWithAssets, tickets: IncidentTicket[]): boolean {
  return needsRepair(store, tickets) && !isRepairCompleted(store, tickets);
}

/**
 * The single stage bucket to count and display a work order under, on the
 * Work Orders page. A store's `recovery_stage` field only advances to
 * "Completed"/"Verified" if someone walks it through the Work Order stage
 * timeline — but isRepairCompleted() above also treats a Completed/Closed
 * incident ticket as "done", since repairs are sometimes closed out via the
 * ticket instead. Code that bucketed stores by raw `recovery_stage` alone
 * (as the Work Orders page used to, in its header count and stage-breakdown
 * cards) disagreed with the "Total Open" card, which already used
 * isRepairCompleted — a store with a closed ticket but a stale/unset
 * recovery_stage got counted as open by one and done by the other, 1 apart.
 * Routing every count through this one function is what keeps them in sync.
 */
export function getEffectiveRecoveryStage(store: StoreWithAssets, tickets: IncidentTicket[]): RecoveryStage {
  if (store.recovery_stage === "Verified") return "Verified";
  if (isRepairCompleted(store, tickets)) return "Completed";
  return store.recovery_stage ?? "Waiting Vendor Quote";
}

/**
 * NOT currently called from the app — kept for the Health Score module and
 * as a reference implementation. Used to also run automatically inside
 * editAssetDetails() on every Edit Detail save, but that broke once
 * EditableStatusBadge (manual status override) shipped: the Edit Detail
 * form no longer even collects camera_working/camera_failed/camera_status/
 * hdd_status/playback_status (see EditAssetModal, pared down to
 * Total/Brand/Model/Serial/Install Date/Online/HDD Capacity), so this was
 * silently recomputing off permanently-stale inputs and reverting a manual
 * status override on the next unrelated save. overall_status is now purely
 * manual — see AppDataProvider.editAssetDetails's comment.
 *
 * OverallStatus dropped "View Only" as a distinct status (folded into
 * "Partial") — it used to mean "camera OK but recording/playback broken",
 * a real distinction, but recording health (hdd_status/playback_status)
 * isn't tracked through any UI anymore, so a status nobody could ever set
 * or fix just added confusion. "Partial" now covers any online-but-something's-
 * wrong case.
 */
export function deriveOverallStatusFromAsset(asset: {
  nvr_online?: boolean | null;
  playback_status?: string | null;
  hdd_status?: string | null;
  camera_status?: string | null;
  camera_failed?: number | null;
}): "Healthy" | "Partial" | "Offline" {
  if (!asset.nvr_online) return "Offline";
  const cameraOk = asset.camera_status ? asset.camera_status === "OK" : (asset.camera_failed ?? 0) === 0;
  if (!cameraOk) return "Partial";
  const playbackOk = asset.playback_status === "Working";
  const hddOk = asset.hdd_status === "Healthy";
  if (playbackOk && hddOk) return "Healthy";
  return "Partial";
}

/**
 * NOT currently called from the app — see deriveOverallStatusFromAsset's
 * comment, same reasoning applies. AppDataProvider.editAssetDetails now
 * only derives the narrower "Device Not Registered" signal directly from
 * ivms_account (still a reliably-tracked field), rather than calling this.
 */
export function deriveRecoveryStatusFromAsset(
  asset: {
    nvr_online?: boolean | null;
    hdd_status?: string | null;
    playback_status?: string | null;
    camera_status?: string | null;
    camera_failed?: number | null;
  } | null,
  hikconnect: { ivms_account?: string | null } | null
): RecoveryStatus {
  if (!hikconnect?.ivms_account) return "Device Not Registered";
  if (!asset) return "Normal";
  if (!asset.nvr_online || asset.hdd_status === "Failed" || asset.playback_status === "Not Working") return "DVR Failure";
  const cameraOk = asset.camera_status ? asset.camera_status === "OK" : (asset.camera_failed ?? 0) === 0;
  if (!cameraOk) return "Camera Issue";
  return "Normal";
}
