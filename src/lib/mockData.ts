import type {
  StoreWithAssets,
  MaintenanceRecord,
  AuditRecord,
  RecoveryStatus,
  RecoveryStage,
  VendorQuotation,
  QuotationApprovalStatus,
  IncidentTicket,
  TicketIssueType,
  TicketStatus,
  Attachment,
  RecoveryStageHistoryEntry,
  WorkOrderBatch,
} from "@/types/database";

// Deterministic PRNG so demo data is stable across reloads.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ZONES = [
  { code: "511", region: "Bangkok" as const, label: "BKK Central", provinces: ["Bangkok"], count: 7 },
  { code: "512", region: "Bangkok" as const, label: "BKK North", provinces: ["Bangkok", "Nonthaburi"], count: 6 },
  { code: "513", region: "Bangkok" as const, label: "BKK South", provinces: ["Bangkok", "Samut Prakan"], count: 6 },
  { code: "520", region: "Upcountry" as const, label: "North", provinces: ["Chiang Mai", "Chiang Rai", "Lampang"], count: 7 },
  { code: "530", region: "Upcountry" as const, label: "Northeast", provinces: ["Khon Kaen", "Nakhon Ratchasima", "Udon Thani"], count: 7 },
  { code: "540", region: "Upcountry" as const, label: "Lower North", provinces: ["Phitsanulok", "Nakhon Sawan"], count: 6 },
  { code: "550", region: "Bangkok" as const, label: "East", provinces: ["Chonburi", "Rayong"], count: 6 },
  { code: "560", region: "Upcountry" as const, label: "South", provinces: ["Songkhla", "Surat Thani", "Phuket"], count: 5 },
];

export const SUPPLIERS = ["Flowbridge", "SecureVision Co.", "NetGuard Systems"];
const NVR_MODELS = ["DS-7716NI-K4", "DS-7608NI-E2/8P", "DS-7732NI-K4", "DS-7616NI-K2"];
const ISPS = ["AIS Business", "True Online", "3BB"];
const ROUTERS = ["TP-Link ER605", "Mikrotik hEX", "Cisco RV160"];
const NET_TYPES = ["Fiber 100/50", "Fiber 200/100", "Fiber 500/300"];
const TECHS = ["S. Boonmee", "K. Charoen", "P. Wattana", "A. Srisuk", "T. Niyom"];
const PROBLEMS: [string, string, string][] = [
  ["Playback Failure", "HDD sector corruption", "Replaced HDD, re-indexed footage"],
  ["NVR Offline", "Power supply failure", "Replaced PSU, verified boot cycle"],
  ["Camera Failure", "Cable/PoE fault at junction", "Re-terminated cable, tested feed"],
  ["HDD Failure", "Disk exceeded MTBF, SMART errors", "Swapped HDD, ran surface scan"],
  ["Network Failure", "ISP line outage", "Escalated to ISP, restored uplink"],
  ["Hik-Connect Failure", "Account verification expired", "Re-verified device, updated shared users"],
];

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

export function generateMockData() {
  const rnd = mulberry32(20260705);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const stores: StoreWithAssets[] = [];
  ZONES.forEach((z) => {
    for (let i = 1; i <= z.count; i++) {
      const code = `${z.code}${pad(i)}`;
      const province = pick(z.provinces);
      const supplierName = rnd() < 0.6 ? "Flowbridge" : pick(SUPPLIERS.slice(1));

      const nvrOnline = rnd() < 0.85;
      const playbackWorking = nvrOnline ? rnd() < 0.85 : rnd() < 0.15;
      const hddHealthy = rnd() < 0.83;
      const totalCameras = 8 + Math.floor(rnd() * 9);
      const failedCameras = rnd() < 0.78 ? 0 : 1 + Math.floor(rnd() * 3);
      const cameraComplete = failedCameras === 0;

      const score =
        (nvrOnline ? 30 : 0) + (playbackWorking ? 30 : 0) + (hddHealthy ? 20 : 0) + (cameraComplete ? 20 : 0);

      let overallStatus: StoreWithAssets["overall_status"];
      if (!nvrOnline) overallStatus = rnd() < 0.8 ? "Offline" : "Unknown";
      else if (score >= 90) overallStatus = "Healthy";
      else if (score >= 60) overallStatus = rnd() < 0.85 ? "Healthy" : "Partial";
      else overallStatus = rnd() < 0.7 ? "Partial" : "Unknown";

      const installYear = 2019 + Math.floor(rnd() * 5);
      const hddYear = installYear + Math.floor(rnd() * 2);
      const id = `store_${code}`;

      stores.push({
        id,
        store_code: code,
        store_name: `BATA ${province} ${i}`,
        region: z.region,
        zone: z.code,
        province,
        address: null,
        phone: null,
        store_group: null,
        supplier_id: supplierName,
        overall_status: overallStatus,
        latitude: null,
        longitude: null,
        is_active: true,
        created_at: "2021-01-01",
        updated_at: "2026-06-01",
        supplierName,
        healthScore: score,
        asset: {
          id: `asset_${code}`,
          store_id: id,
          nvr_brand: "Hikvision",
          nvr_model: pick(NVR_MODELS),
          nvr_serial: `HK${z.code}${pad(i)}${Math.floor(rnd() * 9000 + 1000)}`,
          nvr_firmware: `V4.${Math.floor(rnd() * 3) + 1}.${Math.floor(rnd() * 90) + 10}`,
          nvr_mac: Array.from({ length: 6 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, "0").toUpperCase()).join(":"),
          nvr_install_date: `${installYear}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 27))}`,
          nvr_online: nvrOnline,
          camera_total: totalCameras,
          camera_working: totalCameras - failedCameras,
          camera_failed: failedCameras,
          camera_status: null,
          hdd_capacity: pick(["2 TB", "4 TB", "6 TB", "8 TB"]),
          hdd_status: hddHealthy ? "Healthy" : rnd() < 0.5 ? "Warning" : "Failed",
          hdd_install_date: `${hddYear}-${pad(1 + Math.floor(rnd() * 12))}-01`,
          playback_status: playbackWorking ? "Working" : "Not Working",
          isp: pick(ISPS),
          router_model: pick(ROUTERS),
          internet_type: pick(NET_TYPES),
          updated_at: "2026-06-01",
          hik_uid: `HIK-${z.code}${pad(i)}-${Math.floor(rnd() * 900000 + 100000)}`,
          qr_code_path: null,
        },
        hikconnect: {
          id: `hik_${code}`,
          store_id: id,
          device_name: `BATA-${code}`,
          hikconnect_status: nvrOnline ? "Online" : "Offline",
          owner_account: z.region === "Bangkok" ? "BATA CCTV BKK" : "BATA CCTV COUNTRY",
          shared_accounts: ["Zone Manager", "District Manager"],
          verification_code: `VC-${code}`,
          last_verified_date: `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`,
          ivms_account: `ivms_${code}@bata.co.th`,
          updated_at: "2026-06-01",
        },
      });
    }
  });

  // --- Sprint 1: Recovery Dashboard — assign recovery fields to all 50 pilot stores. ---
  // Distribution matches the real 50-store repair list reviewed earlier:
  // 16 DVR Failure, 12 Device Not Registered, 9 Camera Issue, 13 Normal.
  const RECOVERY_CAUSE: Record<RecoveryStatus, string | null> = {
    Normal: null,
    "Camera Issue": "Camera cable/PoE fault or failed camera unit",
    "DVR Failure": "DVR/NVR hardware failure — no signal output",
    "Device Not Registered": "Device never registered to Hik-Connect / iVMS",
  };
  const RECOVERY_ACTION: Record<RecoveryStatus, string | null> = {
    Normal: null,
    "Camera Issue": "Repair or replace affected camera(s)",
    "DVR Failure": "Replace DVR/NVR unit",
    "Device Not Registered": "Register device to central Hik-Connect / iVMS account",
  };
  const STAGES: RecoveryStage[] = ["Waiting Vendor Quote", "Waiting Approval", "Waiting Repair", "Repairing", "Completed", "Verified"];
  const VENDOR_NAMES = ["Flowbridge", "SecureVision Co.", "NetGuard Systems"];
  const APPROVAL_STATUSES: QuotationApprovalStatus[] = ["Pending", "Approved", "Rejected"];

  const distribution: RecoveryStatus[] = [
    ...Array(16).fill("DVR Failure"),
    ...Array(12).fill("Device Not Registered"),
    ...Array(9).fill("Camera Issue"),
    ...Array(13).fill("Normal"),
  ] as RecoveryStatus[];
  // Deterministic shuffle so the same store always lands in the same bucket across reloads.
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

  const vendorQuotations: VendorQuotation[] = [];
  let qid = 1;
  const stageHistory: RecoveryStageHistoryEntry[] = [];
  let shid = 1;

  stores.forEach((s, idx) => {
    const status = distribution[idx] ?? "Normal";
    s.is_recovery50 = true;
    s.recovery_status = status;
    s.cause = RECOVERY_CAUSE[status];
    s.required_action = RECOVERY_ACTION[status];
    // Sprint 2: summary fields shown on the Store Detail page, denormalized
    // onto the store itself (see the Store interface comment) rather than
    // reaching into cctv_assets — kept consistent with the underlying mock
    // asset/hikconnect data so the demo looks coherent.
    s.online_status = s.asset?.nvr_online ? "Online" : "Offline";
    s.camera_status = status === "Camera Issue" ? (rnd() < 0.5 ? "Partial" : "Not Work") : s.asset && s.asset.camera_failed === 0 ? "OK" : "Partial";
    s.add_device_status = status === "Device Not Registered" ? "Not Registered" : "Registered";

    const stage: RecoveryStage =
      status === "Normal" ? "Verified" : pick(STAGES.slice(0, 5).concat(rnd() < 0.2 ? (["Verified"] as RecoveryStage[]) : []));
    s.recovery_stage = stage;
    s.repair_date =
      stage === "Completed" || stage === "Verified" || stage === "Repairing"
        ? `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`
        : null;

    // Sprint 4 - Work Orders: walk this store through every stage it has
    // already passed on the way to `stage`, logging one history row per
    // step so the timeline on /recovery/[code] isn't empty in demo mode.
    if (status !== "Normal") {
      const reachedIdx = STAGES.indexOf(stage);
      let cursor = new Date(2026, Math.floor(rnd() * 5), 1 + Math.floor(rnd() * 20));
      for (let i = 0; i <= reachedIdx; i++) {
        cursor = new Date(cursor.getTime() + (1 + Math.floor(rnd() * 4)) * 86400000);
        stageHistory.push({
          id: `rsh_${pad(shid++, 4)}`,
          store_id: s.id,
          from_stage: i === 0 ? null : STAGES[i - 1],
          to_stage: STAGES[i],
          note: i === reachedIdx ? s.required_action : null,
          changed_at: cursor.toISOString(),
        });
      }
    }

    // A quotation exists once a store has moved past "Waiting Vendor Quote".
    if (status !== "Normal" && stage !== "Waiting Vendor Quote") {
      const approvalStatus: QuotationApprovalStatus =
        stage === "Waiting Approval" ? "Pending" : stage === "Repairing" || stage === "Completed" || stage === "Verified" ? "Approved" : pick(APPROVAL_STATUSES);
      vendorQuotations.push({
        id: `vq_${pad(qid++, 4)}`,
        store_id: s.id,
        vendor_name: s.supplierName,
        quotation_number: `QT-${s.store_code}-${pad(qid, 3)}`,
        estimated_cost: 1200 + Math.floor(rnd() * 8000),
        quotation_date: `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`,
        approval_status: approvalStatus,
        created_at: "2026-06-01",
        updated_at: "2026-06-01",
      });
    }
  });

  // --- Sprint 3: Repair Ticket + Attachments ---
  const ISSUE_TYPE_BY_STATUS: Record<RecoveryStatus, TicketIssueType | null> = {
    Normal: null,
    "Camera Issue": "Camera Failure",
    "DVR Failure": "NVR Offline",
    "Device Not Registered": "Hik-Connect Failure",
  };
  const TICKET_STATUS_BY_STAGE: Record<RecoveryStage, TicketStatus> = {
    "Waiting Vendor Quote": "Open",
    "Waiting Approval": "Assigned",
    "Waiting Repair": "In Progress",
    Repairing: "In Progress",
    Completed: "Completed",
    Verified: "Closed",
  };

  const tickets: IncidentTicket[] = [];
  const attachments: Attachment[] = [];
  let tid = 1;
  let aid = 1;

  stores.forEach((s) => {
    const status = s.recovery_status as RecoveryStatus;
    const issueType = ISSUE_TYPE_BY_STATUS[status];
    if (issueType) {
      const ticketStatus = TICKET_STATUS_BY_STAGE[s.recovery_stage as RecoveryStage];
      const openedAt = `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`;
      tickets.push({
        id: `tk_${pad(tid++, 4)}`,
        store_id: s.id,
        issue_type: issueType,
        status: ticketStatus,
        assigned_supplier_id: null,
        description: s.cause ?? null,
        opened_at: openedAt,
        closed_at: ticketStatus === "Closed" ? openedAt : null,
      });
    }
    // A handful of stores get a sample attachment so the Asset Register's
    // Documents section isn't empty in the demo.
    if (rnd() < 0.3) {
      const folder = pick<Attachment["folder"]>(["NVR Photos", "Camera Photos", "Invoice", "Warranty"]);
      attachments.push({
        id: `att_${pad(aid++, 4)}`,
        store_id: s.id,
        folder,
        file_path: `demo/${s.store_code}/${folder!.toLowerCase().replace(/ /g, "-")}.jpg`,
        file_name: `${folder}.jpg`,
        uploaded_by: null,
        created_at: "2026-06-01",
      });
    }
  });

  const records: MaintenanceRecord[] = [];
  let rid = 1;
  stores.forEach((s) => {
    const n = s.overall_status === "Healthy" ? (rnd() < 0.3 ? 1 : 0) : 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const [problem, rootCause, resolution] = pick(PROBLEMS);
      const issueDate = `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`;
      const statusRoll = rnd();
      const status = statusRoll < 0.5 ? "Completed" : statusRoll < 0.8 ? "In Progress" : "Pending";
      records.push({
        id: `mt_${pad(rid++, 4)}`,
        store_id: s.id,
        supplier_id: s.supplierName,
        ticket_ref: `MT-${pad(rid, 4)}`,
        status,
        issue_date: issueDate,
        started_date: status === "Pending" ? null : issueDate,
        completed_date: status === "Completed" ? issueDate : null,
        vendor: s.supplierName,
        problem,
        root_cause: rootCause,
        resolution,
        cost: 800 + Math.floor(rnd() * 6500),
        technician: pick(TECHS),
        attachment_url: null,
        created_at: "2026-06-01",
      });
    }
  });
  records.sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1));

  const audits: AuditRecord[] = stores
    .filter(() => rnd() < 0.6)
    .map((s, idx) => ({
      id: `audit_${pad(idx + 1, 4)}`,
      store_id: s.id,
      audit_date: `2026-${pad(1 + Math.floor(rnd() * 6))}-${pad(1 + Math.floor(rnd() * 27))}`,
      auditor: pick(TECHS),
      playback_result: s.asset?.playback_status === "Working" ? "Pass" : "Fail",
      hdd_result: s.asset?.hdd_status === "Healthy" ? "Pass" : "Fail",
      camera_result: s.asset && s.asset.camera_failed === 0 ? "Pass" : "Fail",
      hikconnect_result: s.hikconnect?.hikconnect_status === "Online" ? "Pass" : "Fail",
      overall_status: s.overall_status,
      audit_score: s.healthScore,
      notes: null,
      partial_reason: null,
      offline_reason: null,
      retention_days_seen: null,
    }));

  // Sprint 5 - Work Order "Jobs": mock data has always been exactly the 50
  // pilot stores (ZONES' counts sum to 50), so there's no "stray" bucket to
  // demo here — just the one batch, all 50 stores in it.
  const WORK_ORDER_BATCH_ID = "batch_0001";
  const workOrderBatches: WorkOrderBatch[] = [
    { id: WORK_ORDER_BATCH_ID, name: "Job 1: 50-Store Pilot", status: "Active", created_at: "2026-07-01T00:00:00.000Z", closed_at: null },
  ];
  stores.forEach((s) => {
    s.batch_id = WORK_ORDER_BATCH_ID;
  });

  return { stores, records, audits, vendorQuotations, tickets, attachments, recoveryStageHistory: stageHistory, workOrderBatches };
}
