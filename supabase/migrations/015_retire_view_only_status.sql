-- ============================================================
-- Migration: retire "View Only" as an overall_status value.
--
-- "View Only" used to mean "camera OK, but recording/playback broken" — a
-- real distinction, but hdd_status/playback_status (the fields that used to
-- distinguish it from "Partial") haven't been editable through any UI for a
-- while now, so a status nobody could ever set or fix just added confusion.
-- The app code no longer writes or renders "View Only" at all (OverallStatus
-- type dropped it) — this migration folds any store still carrying the old
-- value into "Partial" so nothing is left pointing at a status the UI can't
-- display.
-- Run this once in the Supabase SQL Editor, after 014.
-- ============================================================

update public.stores
  set overall_status = 'Partial'
  where overall_status = 'View Only';

-- Also tighten the CHECK constraint back down (migration 011 had widened it
-- to allow 'View Only') so nothing can write that value again either.
alter table public.stores drop constraint if exists stores_overall_status_check;
alter table public.stores
  add constraint stores_overall_status_check
  check (overall_status in ('Healthy', 'Partial', 'Offline', 'Unknown'));
