import type { InstallationProject, InstallationStage, VendorQuotation } from "@/types/database";

/**
 * Installation Project: helpers for the 6-stage install pipeline.
 * "Floor Plan" and "Layout" were dropped (migration 021) — that work
 * happens before a store enters this tracker, so it was never used here.
 * See docs/workflow/DESIGN-installation-project.md for the full design.
 */
export const INSTALLATION_STAGES: InstallationStage[] = [
  "Quotation",
  "Permit",
  "Scheduled",
  "Installing",
  "Verify",
  "Completed",
];

export const INSTALLATION_STAGE_LABELS: Record<InstallationStage, string> = {
  Quotation: "ขอใบเสนอราคา/อนุมัติงบ",
  Permit: "ขออนุญาตห้าง",
  Scheduled: "นัดติดตั้ง",
  Installing: "ติดตั้ง",
  Verify: "Verify",
  Completed: "Completed",
};

export function getStageLabel(stage: InstallationStage): string {
  return INSTALLATION_STAGE_LABELS[stage] ?? stage;
}

/** Verify Checklist — 12 items in 3 groups (R6). Group A = on-site (6), B = HQ/central (3), C = post-completion follow-up (3, checked within 72h of Completed). */
export interface ChecklistItem {
  key: string;
  group: "A" | "B" | "C";
  label: string;
}

export const VERIFY_CHECKLIST: ChecklistItem[] = [
  // Group A — หน้างาน (6)
  { key: "A1", group: "A", label: "NVR บันทึกภาพต่อเนื่อง (Playback ตรวจสอบได้)" },
  { key: "A2", group: "A", label: "กล้องทั้ง 3 จุดออนไลน์และภาพชัด" },
  { key: "A3", group: "A", label: "HDD สถานะ Healthy, พื้นที่เพียงพอ" },
  { key: "A4", group: "A", label: "สาย/ปลั๊ก/PoE เดินเรียบร้อย ไม่มีจุดเสี่ยงหลุด" },
  { key: "A5", group: "A", label: "ติด Serial Sticker และถ่ายรูปยืนยัน" },
  { key: "A6", group: "A", label: "ทดสอบไฟดับ/ไฟกลับมาแล้ว NVR บูตขึ้นใช้งานได้" },
  // Group B — ส่วนกลาง (3)
  { key: "B1", group: "B", label: "ลงทะเบียนอุปกรณ์เข้า Hik-Connect / iVMS ส่วนกลางแล้ว" },
  { key: "B2", group: "B", label: "ตรวจสอบ Online Status จากส่วนกลางตรงกับหน้างาน" },
  { key: "B3", group: "B", label: "บันทึกข้อมูลอุปกรณ์เข้า Asset Register ครบถ้วน" },
  // Group C — ติดตามหลังปิดงาน 72 ชม. (3)
  { key: "C1", group: "C", label: "ยืนยันสถานะ Online ต่อเนื่อง 24 ชม. แรก" },
  { key: "C2", group: "C", label: "ยืนยันสถานะ Online ต่อเนื่อง 72 ชม." },
  { key: "C3", group: "C", label: "ปิดงานกับ DM/สาขา — ไม่มีข้อร้องเรียนเพิ่ม" },
];

export const VERIFY_CHECKLIST_TOTAL = VERIFY_CHECKLIST.length; // 12

export function isChecklistComplete(checked: string[]): boolean {
  return checked.length >= VERIFY_CHECKLIST_TOTAL;
}

/**
 * Items 10-11 in the plan's numbering = C1/C2 here (the 72h post-completion
 * monitoring items) — the ones that get cleared if a store drops offline
 * within 72h of Completed, per R6's rollback flow.
 */
export const POST_COMPLETION_KEYS = ["C1", "C2"];

/**
 * R3: the card can move out of "Quotation" only once this project has an
 * explicitly-linked, Approved vendor_quotations row. Deliberately checked
 * via `approved_quotation_id` (a value the user picks) rather than "does
 * any Approved quotation exist for this store_id" — a store can also have
 * unrelated quotations from the Recovery/repair flow in the same shared
 * table, and those must never be mistaken for installation budget approval.
 */
export function canAdvancePastQuotation(project: InstallationProject, quotations: VendorQuotation[]): boolean {
  if (!project.approved_quotation_id) return false;
  const q = quotations.find((v) => v.id === project.approved_quotation_id);
  return q?.approval_status === "Approved" && q.store_id === project.store_id;
}

/** Whether hq_admin can drag/advance this project past its current stage right now. */
export function canAdvanceStage(project: InstallationProject, quotations: VendorQuotation[]): boolean {
  if (project.current_stage === "Quotation") return canAdvancePastQuotation(project, quotations);
  return true;
}

export function nextStage(stage: InstallationStage): InstallationStage | null {
  const idx = INSTALLATION_STAGES.indexOf(stage);
  if (idx === -1 || idx === INSTALLATION_STAGES.length - 1) return null;
  return INSTALLATION_STAGES[idx + 1];
}

export function stageIndex(stage: InstallationStage): number {
  return INSTALLATION_STAGES.indexOf(stage);
}

/** True during the 72h window after Completed where the C1/C2 rollback action is offered (R6). */
export function withinPostCompletionWindow(project: InstallationProject, now: Date = new Date()): boolean {
  if (project.current_stage !== "Completed" || !project.completed_at) return false;
  const completedAt = new Date(project.completed_at).getTime();
  return now.getTime() - completedAt <= 72 * 60 * 60 * 1000;
}
