-- ============================================================
-- Migration 026: remove the "Verified" work-order stage.
--
-- Decision 2026-11-09: repair Work Orders end at "Completed" — the extra
-- "Verified" step was too much. Stages are now:
--   Waiting Vendor Quote -> Waiting Approval -> Waiting Repair
--   -> Repairing -> Completed
-- (The Installation Project's own "Verify" stage / checklist is a different
-- flow and is NOT touched here.)
--
-- The app already reads a stored "Verified" as "Completed", so it is safe to
-- deploy the new app version first. Run this once in the Supabase SQL Editor
-- to clean up the data and tighten the constraints. Safe to re-run.
--
-- What it does:
--   1. history: removes the bare Completed -> Verified / Verified -> Completed
--      steps (no note). Once both ends read "Completed" they would turn into
--      empty "remarks" in the timeline. Steps that carry a note are kept and
--      become remarks on "Completed".
--   2. every remaining 'Verified' (stores + history) becomes 'Completed'.
--   3. the stage CHECK constraints no longer allow 'Verified'.
-- overall_status is not touched (migration 018 already set Healthy for
-- every Completed/Verified store).
-- ============================================================

begin;

-- 1. History: drop the bare "verify" steps.
delete from public.recovery_stage_history
 where ((from_stage = 'Completed' and to_stage = 'Verified')
     or (from_stage = 'Verified' and to_stage = 'Completed'))
   and (note is null or btrim(note) = '');

-- 2. Rewrite remaining Verified rows.
update public.stores
   set recovery_stage = 'Completed'
 where recovery_stage = 'Verified';

update public.recovery_stage_history set from_stage = 'Completed' where from_stage = 'Verified';
update public.recovery_stage_history set to_stage   = 'Completed' where to_stage   = 'Verified';

-- 3. Tighten the constraints.
alter table public.stores drop constraint if exists stores_recovery_stage_check;
alter table public.stores
  add constraint stores_recovery_stage_check
  check (recovery_stage in (
    'Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed'
  ));

alter table public.recovery_stage_history drop constraint if exists recovery_stage_history_from_stage_check;
alter table public.recovery_stage_history drop constraint if exists recovery_stage_history_to_stage_check;
alter table public.recovery_stage_history
  add constraint recovery_stage_history_from_stage_check
  check (from_stage in ('Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed'));
alter table public.recovery_stage_history
  add constraint recovery_stage_history_to_stage_check
  check (to_stage in ('Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed'));

commit;

-- Check (should return 0 rows):
--   select store_code, recovery_stage from public.stores where recovery_stage = 'Verified';
