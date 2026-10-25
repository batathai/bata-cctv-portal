-- ============================================================
-- Migration 025: remove stores.is_recovery50.
--
-- The "first 50 priority stores" flag from migration 005. Unused since
-- migration 017 (Work Order Jobs / batch_id is how stores are picked for
-- a round of work). Decision 2026-10-13: which stores go into a round is
-- chosen by Retail through Work Order Jobs, not a hard-coded flag.
--
-- Deploy the app version that no longer reads the column FIRST, then run
-- this once in the Supabase SQL Editor. Drops the column and its index.
-- ============================================================

drop index if exists public.idx_stores_recovery50;
alter table public.stores drop column if exists is_recovery50;
