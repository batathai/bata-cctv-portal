-- ============================================================
-- Migration: Installation Project — drop "Floor Plan" and "Layout" from
-- the stage pipeline.
--
-- Per the project owner: those two steps happen before a store enters
-- this tracker (floor plan/site layout work is done elsewhere), so they
-- were never going to be used here. Confirmed safe to drop outright
-- rather than just hide in the UI — no existing installation_projects
-- row uses either value (Wave 1's real 20-store import started every
-- row at Scheduled/Installing/Verify, never Floor Plan/Layout).
--
-- New pipeline (6 stages, was 8):
--   Quotation -> Permit -> Scheduled -> Installing -> Verify -> Completed
--
-- Safe to run even if a stray row somehow has 'Floor Plan'/'Layout' —
-- it gets bumped forward to 'Quotation' first so the new check
-- constraint never rejects existing data.
--
-- Run this once in the Supabase SQL Editor, after 020.
-- ============================================================

update public.installation_projects
set current_stage = 'Quotation'
where current_stage in ('Floor Plan', 'Layout');

alter table public.installation_projects
  alter column current_stage set default 'Quotation';

alter table public.installation_projects
  drop constraint if exists installation_projects_current_stage_check;

alter table public.installation_projects
  add constraint installation_projects_current_stage_check
  check (current_stage in (
    'Quotation', 'Permit', 'Scheduled', 'Installing', 'Verify', 'Completed'
  ));

-- installation_stage_history.to_stage/from_stage are free-text (not
-- constrained), so old history rows that recorded "Floor Plan"/"Layout"
-- transitions are left as-is — they're an accurate historical record,
-- just for stages that no longer exist going forward.
