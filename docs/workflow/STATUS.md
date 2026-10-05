# Workflow Status

Feature: Installation Project
Phase: implemented — restructured under Work Orders, ready for /test
Design approved: yes — 2026-09-30 — DESIGN-installation-project.md (schema `installation_projects`/`installation_stage_history`, 8-stage flow, RLS, screens, exports)
Updated: 2026-10-05

## Done
- Plan written: docs/workflow/PLAN-installation-project.md
- Design written: docs/workflow/DESIGN-installation-project.md (schema, screens, flow, RLS, exports, traceability R1–R10)
- Repo attached to session (batathai/bata-cctv-portal), read-only for now (push not authorized for this session)
- Confirmed against real schema/code:
  - Budget/quote step can reuse existing `vendor_quotations` table (migration 008) instead of a new one
  - System is single-role (`hq_admin` only) per `src/lib/rbac.ts` — no DM/RM/supplier logins active; DM is contact info, not a user
  - Stage-history pattern to follow: `recovery_stage_history` (migration 012)
  - `attachments_storage` (migration 009) fits as-is; only the `attachments.folder` check constraint needs widening (4 new categories) — no new bucket needed
  - Next free migration number confirmed: 020
  - `work_order_batches` (migration 017) can represent "Wave" without schema changes (used via a `wave` text column, not a second FK, to avoid clashing with `stores.batch_id` which already belongs to repair batches)
  - Real Excel export pattern is client-side `xlsx` (json_to_sheet), not the formula-based openpyxl demo shown earlier — flagged as an open conflict with R7 ("ใช้สูตรจริง")

## Open issues
- Storage quota for ~1,200+ verify photos not yet estimated
- Push access: this session cannot push to GitHub (org has not installed the Claude GitHub App / GitHub not reconnected). User must push manually until resolved.
- Store code corrections (Fashion Island 51401→51404, Central Udon 53031→53012): confirmed as an ongoing data-cleanup task, not a blocker for `/implement` — data changes constantly, so this is handled separately whenever discovered, not as a one-time fix before seeding

## Design decisions — resolved 2026-09-30
1. `d1_date`/`d2_date` — confirmed: D1 = วันนัดติดตั้ง (scheduled), D2 = วันติดตั้งจริง (actual)
2. Export approach — confirmed: **(ก)** client-side `xlsx` (`json_to_sheet`), matching the real app's existing `exportExcel.ts` pattern, no formulas, no new backend

## Implemented — 2026-09-30

New files:
- `supabase/migrations/020_installation_project.sql` — `installation_projects`, `installation_stage_history`, widened `attachments.folder`, RLS (hq_admin only)
- `src/lib/installation.ts` — stages, labels, 12-item/3-group Verify Checklist, `canAdvanceStage`, `withinPostCompletionWindow`
- `src/lib/installationWrite.ts` — DB writes: stage transitions, checklist toggle + auto-complete, 72h rollback, project creation
- `src/lib/reports/exportInstallationExcel.ts` — Summary + Timeline sheets, client-side `xlsx` (per approved R7 decision)
- `src/lib/reports/exportInstallationPdf.ts` — Executive Summary + per-store handover PDF
- `src/app/(portal)/installation/page.tsx` — Kanban board (drag & drop, filters, KPIs, exports)
- `src/app/(portal)/installation/[code]/page.tsx` — detail: stepper, quotation link (R3), Verify Checklist + 72h rollback (R6), attachments, activity log
- `src/app/(portal)/installation/timeline/page.tsx` — Gantt-style timeline
- `src/app/(portal)/installation/rollout/page.tsx` — 194-target rollout grid + per-stage/per-zone summary, "open project" action

Modified:
- `src/types/database.ts` — `InstallationProject`, `InstallationStageHistoryEntry`, widened `AttachmentFolder`
- `src/lib/data.ts` — `fetchInstallationProjects`, `fetchInstallationStageHistory`
- `src/lib/mockData.ts` — Wave 1 (20 stores) demo data across all 8 stages, own quotation rows (kept separate from Recovery-flow mock quotations)
- `src/components/providers/AppDataProvider.tsx` — state + `createInstallationProject`/`advanceInstallationStage`/`updateVerifyChecklistItem`/`resetPostCompletionChecklist`
- `src/components/layout/Sidebar.tsx` — added "Installation Project" nav item
- `src/components/assets/AttachmentsCard.tsx` — added the 4 new installation folder categories to the picker (shared component)

Verification: `npx tsc --noEmit` — 0 errors. `npm run lint` — 0 warnings/errors. `npm run build` could not be completed in this sandbox (outbound network to Google Fonts is blocked by the session's egress proxy — unrelated to this change; GitHub Actions' real build has normal internet access and should succeed there). **User must still verify a real `npm run build` themselves once pushed, before merging.**

Refinement beyond the design doc: R3's "any Approved quotation exists for this store" was ambiguous, since the same `vendor_quotations` table is also used by the unrelated Recovery/repair flow — a store could have an Approved *repair* quote that has nothing to do with installation budget. Implemented as `approved_quotation_id` on `installation_projects`, explicitly picked by hq_admin from that store's Approved quotations (see the Quotation-stage card on the detail page), so the two flows can never be confused.

## Resolved — 2026-10-05
- Migration 020 **has been run** against the real Supabase project by the user — confirmed ("รันเรียบร้อยแล้วครับ"). The "not yet run" note above is stale/historical.
- This feature's branch (`docs/installation-project-plan`, commits `a6d10b6..e702db5`) is **not on `origin/main`**, and `git branch -r` shows only `origin/main` — the branch the user previously pushed to is not currently on the `batathai/bata-cctv-portal` remote this session sees (deleted, or pushed elsewhere). This session's container had reset to a fresh clone of `main`; the commits were recovered from leftover loose git objects still on disk and re-pointed to a local branch of the same name. **User should confirm where `docs/installation-project-plan` actually lives** (check `git branch -r` / GitHub) before assuming it's safe to delete locally again.

## UI restructure — 2026-10-05 (per user request)
Installation Project moved from its own top-level Sidebar entry into a sub-tab of the existing **Work Orders** menu item, so Sidebar has one "Work Orders" entry again (no "Installation Project" row):
- Routes moved: `/installation*` → `/work-orders/installation*` (board, `[code]` detail, `timeline`, `rollout`). All internal links within those pages updated to match.
- `src/components/layout/Sidebar.tsx` — reverted to its pre-Installation-Project NAV (no `KanbanSquare` import, no separate nav row).
- New `src/components/work-orders/WorkOrdersTabs.tsx` — a 2-tab switcher ("งานซ่อม (Repair Jobs)" ↔ "ติดตั้งกล้องใหม่ (Installation Project)") rendered at the top of `/work-orders` and `/work-orders/installation`. The drill-down pages (`[batchId]`, `installation/[code]`, `installation/timeline`, `installation/rollout`) keep their existing back-arrow instead of the tab bar, to avoid duplicate nav chrome.
- Verified after the move: `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm run build` succeeds (using the `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` workaround for this sandbox's blocked Google Fonts egress) — route table confirms `/work-orders`, `/work-orders/[batchId]`, `/work-orders/installation`, `/work-orders/installation/[code]`, `/work-orders/installation/rollout`, `/work-orders/installation/timeline` all generated, and no `/installation*` route remains.

## Done — old repair/Work-Order data deletion — 2026-10-05
User asked to delete all old repair-pilot production data (maintenance_history, incident_tickets, recovery_stage_history, work_order_batches, related vendor_quotations, and reset the relevant `stores` columns) **after taking a backup first**, to make room for Installation Project. `scripts/delete-recovery-work-order-data.mjs` was run by the user against the real Supabase project:
- Dry-run first: 61 of 194 stores affected (2 `work_order_batches` — more than the original 50-store pilot, grown by a second Job over time), maintenance_history 50, incident_tickets 80, recovery_stage_history 303, vendor_quotations 0 (nothing to protect/delete there).
- `--confirm` run: matched dry-run exactly — **61 stores reset**. Backup saved to `backups/delete-recovery-work-order-data-backup-2026-10-05T08-32-02-357Z.json` on the user's machine (not committed to git — keep it safe for reference/rollback).
- `vendor_quotations` protection logic (exclude rows referenced by `installation_projects.approved_quotation_id`) had nothing to protect this time since the count was 0, but the code path is in place for next time.
- Pushed to `origin/docs/installation-project-plan` as of commit `ba1bb80` (includes both the Work Orders/Installation Project restructure and this script).
- **Awaiting user's live-site check**: `/work-orders` should show "Active Jobs (0)", and the "ติดตั้งกล้องใหม่ (Installation Project)" tab should still work normally.

Note: the old Work Orders list/detail pages (`/work-orders`, `/work-orders/[batchId]`) and their `createWorkOrderBatch`/`closeWorkOrderBatch`/`reopenWorkOrderBatch`/`assignStoreToBatch` code in `AppDataProvider.tsx` were **not removed** — only the data they display will be emptied by the script. After the script runs, "Active Jobs (0)" will show correctly (the page already handles the empty state); the repair-ticket code path itself is left in place so a *new* repair job can still be opened later if needed. If the user wants that code removed entirely (not just emptied of data), that is a separate, larger change (also touches `src/components/work-orders/NewTicketModal.tsx`, `src/app/(portal)/reports/page.tsx`'s batch picker, and `src/lib/mockData.ts`'s batch generation) — flag before doing it.

## Not yet done (next steps)
- Confirm live-site check: `/work-orders` shows 0 Active Jobs, Installation Project tab still works.
- `/test` — no automated tests exist in this repo (matches its existing no-test-suite state); manual test pass needed, including the still-open jsPDF Thai-glyph issue in `exportInstallationPdf.ts` (default fonts have no Thai glyph support — needs a Thai-capable embedded font; not yet fixed).
- Storage quota for verify photos still not estimated (carried over from planning).
- Decide whether/when to merge `docs/installation-project-plan` into `main`.

## /test — 2026-10-05

**Automatic checks** (on `docs/installation-project-plan`, commit `dd2ff5c` + this update): `npx tsc --noEmit` 0 errors · `npm run lint` 0 errors/warnings · `npm run build` succeeds (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` workaround for this sandbox's blocked Google Fonts egress) — route table shows `/work-orders`, `/work-orders/[batchId]`, `/work-orders/installation`, `/work-orders/installation/[code]`, `/work-orders/installation/rollout`, `/work-orders/installation/timeline`, no top-level `/installation*` left.

Per the test skill's rule — a requirement without direct evidence is "Not tested", never "Pass" — most items below are Not tested because the live site the user screenshotted (`bata-cctv-portal.pages.dev`) deploys from `main`, which does not have this feature yet; only the DB layer (shared across branches) could be checked so far.

| # | Requirement | How tested | Result |
|---|---|---|---|
| R1 | `installation_projects` table | Migration 020 run by user (confirmed); `delete-recovery-work-order-data.mjs` successfully queried `installation_projects(id, store_id, approved_quotation_id)` with no error in both dry-run and `--confirm` | **Pass** (schema-level only; full CRUD not exercised live) |
| R2 | `installation_stage_history` table | Same migration, not independently queried | Not tested |
| R3 | Quotation→Permit gate (`approved_quotation_id`, explicit link) | Code reviewed only; 0 `vendor_quotations` rows currently exist for any store (table is empty post-deletion) so nothing to click through yet | Not tested |
| R4 | Kanban board, drag & drop, Wave/region/zone filters | Not opened on a live deploy of this branch yet | Not tested |
| R5 | Store detail page (checklist, 3 install points, attachments, activity log) | Not opened live yet | Not tested |
| R6 | 12-item Verify Checklist, auto-complete at 12/12, 72h rollback | Not opened live yet | Not tested |
| R7 | Excel export (Summary + Timeline, client-side `xlsx`) | Not run live yet | Not tested |
| R8 | PDF export (exec summary + handover) with Thai text | Code inspection: `exportInstallationPdf.ts` uses jsPDF's default fonts (Helvetica/WinAnsi) with no `addFont`/Thai-capable font embedded, same pattern as the pre-existing `exportPdf.ts`. Confirmed earlier via a Node script showing jsPDF's default `getFont()` → `{fontName: 'helvetica', encoding: 'WinAnsiEncoding'}`, which has no Thai glyphs | **Fail** — pre-existing systemic issue (not a regression from this feature; `exportPdf.ts` has the same gap) — needs `/debug` to embed a Thai TTF via `addFileToVFS`/`addFont` |
| R9 | Rollout page — 194-target grid + per-stage/per-zone summary | Not opened live yet | Not tested |
| R10 | RLS — `installation_projects`/`installation_stage_history` read/write = `hq_admin` only | Migration file reviewed (policies present using `current_profile()` pattern from `vendor_quotations`); cannot exercise with a second role since the whole app is currently single-role (`hq_admin` only per `src/lib/rbac.ts`) — so the restriction has no live user to test it against | Not tested (low risk given current single-role state) |

**Edge cases checked**
- Store codes as numbers/spaces — not specific to this feature (reuses existing `stores` data loaded the same way as Recovery/Work Orders); not separately re-tested.
- Region/zone mapping (BKK 511/512/513/550, UPC 520/530/540/560) — `regionFromZone()`/`getAreaLabel()` reused as-is from `src/lib/recovery.ts`, unchanged by this feature.
- Counts adding up — deletion script's dry-run and `--confirm` counts matched exactly (61 stores both times) — **Pass** for that specific flow.
- Soft-deleted rows — not applicable; `installation_projects` has no soft-delete column, and the deletion script operates on real store rows regardless of `is_active`.
- Each role sees only what it should — single-role app, not testable yet (see R10).
- Empty states / 194+ stores — `/work-orders` empty state confirmed working live ("No active jobs. Create one to start tracking work orders.") after deletion. Installation Rollout's 194-grid not yet opened live.
- Thai text in exports — **Fail**, see R8.

**Pass/Fail/Not-tested count**: 2 Pass (R1, counts-adding-up edge case) · 1 Fail (R8) · 8 Not tested.

## Manual test checklist for the user (ทำบน preview ของ branch นี้ หรือหลัง merge main)
1. เปิด `/work-orders` → เห็นแท็บ "งานซ่อม (Repair Jobs)" / "ติดตั้งกล้องใหม่ (Installation Project)" ที่ด้านบนไหม
2. กดแท็บ Installation Project → เห็นบอร์ด Kanban 8 คอลัมน์, การ์ด Wave 1 (20 สาขา) ไหม
3. ลองลากการ์ดจากขั้น "Quotation" ไปขั้นถัดไป (ไม่มีใบเสนอราคา Approved ผูกไว้) → ควรถูกบล็อกพร้อมข้อความเตือน (R3)
4. เปิดการ์ด 1 ใบ → เช็คว่าเห็น stepper, การ์ดผูกใบเสนอราคา, Verify Checklist 12 ข้อ, แนบไฟล์ได้ (R5/R6)
5. ติ๊ก Verify Checklist ครบ 12/12 → การ์ดควรย้ายไป "Completed" อัตโนมัติ (R6)
6. กด Export Excel ที่หน้าบอร์ด → เปิดไฟล์ดูว่ามี 2 ชีต (Summary, Timeline) ตัวเลขถูกไหม (R7)
7. กด Export PDF → **คาดว่าจะเห็นปัญหา**: ข้อความภาษาไทยในไฟล์ PDF จะเพี้ยน/ไม่ขึ้น (ตัว font ไม่รองรับไทย) — ยืนยันตามที่พบไหม แล้วแจ้งกลับมา จะส่งต่อให้ `/debug`
8. เปิด `/work-orders/installation/timeline` และ `/work-orders/installation/rollout` → เช็คว่าตารางเวลา/กริด 194 ช่อง แสดงถูกต้องไม่ error (R9)
9. ยืนยันอีกครั้งว่า `/work-orders` เดิม (Repair Jobs) ยัง "Active Jobs (0)" เหมือนก่อนหน้า

## Next step
รอผลทดสอบคลิกจริงจากคุณ (อาจต้องเปิด preview URL ของ branch `docs/installation-project-plan` ก่อน — Cloudflare Pages ปกติสร้าง preview ให้ทุก branch ที่ push) ถ้าผ่านหมด (ยกเว้น R8 ที่รู้อยู่แล้ว) ไปต่อ `/review`
