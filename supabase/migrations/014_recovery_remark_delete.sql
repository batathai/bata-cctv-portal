-- ============================================================
-- Migration: allow deleting REMARK rows from recovery_stage_history.
--
-- recovery_stage_history was append-only (no delete policy at all) so a
-- remark logged against the wrong stage (see addRecoveryRemarkDb, migration
-- unnumbered comment) could never be removed, only piled on top of. This
-- adds a delete policy scoped ONLY to remark rows — identified by
-- from_stage = to_stage, the same signal the UI uses to render them as
-- "Remark — X" instead of a transition — so a real stage-transition row
-- (from_stage <> to_stage, or the initial from_stage is null) can never be
-- deleted and the actual progress audit trail stays intact.
-- Run this once in the Supabase SQL Editor, after 013.
-- ============================================================

drop policy if exists "recovery_stage_history: scoped delete (remarks only)" on public.recovery_stage_history;
create policy "recovery_stage_history: scoped delete (remarks only)" on public.recovery_stage_history
  for delete using (
    from_stage = to_stage
    and exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
