# Workflow Status

Feature: Installation Project
Phase: planning done
Design approved: no
Updated: 2026-09-30

## Done
- Plan written: docs/workflow/PLAN-installation-project.md
- Repo attached to session (batathai/bata-cctv-portal), read-only for now (push not authorized for this session)
- Confirmed against real schema/code:
  - Budget/quote step can reuse existing `vendor_quotations` table (migration 008) instead of a new one
  - System is single-role (`hq_admin` only) per `src/lib/rbac.ts` — no DM/RM/supplier logins active; DM is contact info, not a user
  - Stage-history pattern to follow: `recovery_stage_history` (migration 012)

## Open issues
- Whether `attachments_storage` (migration 009) already fits Installation Project's file needs, or needs extending
- Storage quota for ~1,200+ verify photos not yet estimated
- Push access: this session cannot push to GitHub (org has not installed the Claude GitHub App / GitHub not reconnected). User must push manually until resolved.

## Next step
`/design` — turn this plan into schema + screens + RLS, then stop for approval.
