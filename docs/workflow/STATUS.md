# Workflow Status

Feature: Installation Project
Phase: implemented — ready for /test
Design approved: yes — 2026-09-30 — DESIGN-installation-project.md (schema `installation_projects`/`installation_stage_history`, 8-stage flow, RLS, screens, exports)
Updated: 2026-09-30

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

## Not yet done (next steps)
- Migration 020 has not been run against the real Supabase project — user must run it in the SQL Editor before this feature works against real data
- `/test` — no automated tests exist in this repo (matches its existing no-test-suite state); manual test pass needed
- Storage quota for verify photos still not estimated (carried over from planning)

## Next step
`/test` — manually verify the flow end-to-end once migration 020 is run, per the `bata-dev-flow:test` skill.
