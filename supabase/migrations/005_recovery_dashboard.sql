-- ============================================================
-- Migration: Sprint 1 - Recovery Dashboard (first 50 priority stores).
--
-- Adds the columns needed to track each store's recovery status/stage
-- through the DVR/Camera repair cycle, separate from the existing
-- `overall_status` (Healthy/Partial/Offline/Unknown), which continues to
-- drive the original Dashboard / Asset Register unchanged.
--
-- Region grouping for the Recovery Dashboard (BKK vs Country) is computed
-- in application code from `zone` (see src/lib/recovery.ts) rather than
-- stored here, since it's a pure function of zone and keeping it out of the
-- database avoids a second place that can drift out of sync.
-- Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.stores
  add column if not exists is_recovery50 boolean not null default false,
  add column if not exists recovery_status text
    check (recovery_status in ('Normal', 'Camera Issue', 'DVR Failure', 'Device Not Registered')),
  add column if not exists recovery_stage text
    check (recovery_stage in ('Waiting Vendor Quote', 'Waiting Approval', 'Repairing', 'Completed')),
  add column if not exists cause text,
  add column if not exists required_action text;

create index if not exists idx_stores_recovery50 on public.stores(is_recovery50);
create index if not exists idx_stores_recovery_status on public.stores(recovery_status);

-- No new RLS policy needed: the Recovery Dashboard (and the Recovery Stage
-- editor on the Store Detail page) is only reachable via /dashboard and
-- /assets/[code], both already hq_admin-only in src/lib/rbac.ts's
-- ROUTE_ACCESS. The existing "stores: hq_admin update" policy already covers
-- writing these new columns for that role.
