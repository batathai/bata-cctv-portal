-- ============================================================
-- Migration: backfill overall_status for already-finished work orders.
--
-- overall_status (what Reports/Dashboard/Asset Register/the status badge
-- actually read) is a completely separate field from recovery_stage — the
-- only thing that ever wrote to it was the manual pencil-edit badge, or the
-- original bulk import. Marking a Work Order "Verified" never touched it at
-- all. As of this migration, updateRecoveryStage() syncs overall_status to
-- 'Healthy' automatically the moment a store reaches "Verified" going
-- forward — but stores that were ALREADY Completed/Verified before that
-- code shipped are still stuck showing whatever stale status/score they had
-- at import time in every report. This backfills those specifically.
--
-- Only touches stores whose recovery work is actually finished — does not
-- touch any store still mid-repair, and does not touch stores with no
-- recovery_stage at all (never part of a Work Order).
-- Run this once in the Supabase SQL Editor, after 017.
-- ============================================================

update public.stores
  set overall_status = 'Healthy'
  where recovery_stage in ('Completed', 'Verified')
    and overall_status <> 'Healthy';

-- Sanity check — lists any store still showing a non-Healthy status despite
-- being marked Completed/Verified. Should return 0 rows after the update
-- above; if it doesn't, the update itself failed silently somewhere.
select store_code, store_name, recovery_stage, overall_status
  from public.stores
  where recovery_stage in ('Completed', 'Verified') and overall_status <> 'Healthy';
