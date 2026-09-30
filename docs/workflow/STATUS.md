# Workflow Status

Feature: Installation Project
Phase: design approved, ready for /implement
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

## Next step
`/implement` — build migration 020 + the new pages/lib files listed in DESIGN doc §5, following the approved design above.
