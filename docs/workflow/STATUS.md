# Workflow Status

Feature: Installation Project
Phase: design ready, awaiting approval
Design approved: no
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
- **Design decisions pending user approval** (see DESIGN doc §7 "สิ่งที่ยังไม่ปิด"):
  1. Meaning of `d1_date`/`d2_date` (assumed: scheduled vs actual install date)
  2. Export approach: (ก) client-side `xlsx`, no formulas — matches real app pattern vs (ข) formula-based like the demo — needs a new backend/Edge Function
  3. Store code corrections (Fashion Island 51401→51404, Central Udon 53031→53012) must land before seeding 194 stores

## Next step
Awaiting USER APPROVAL of the design. Once approved, record "Design approved: yes — <date> — <what>" here, then proceed to `/implement`.
