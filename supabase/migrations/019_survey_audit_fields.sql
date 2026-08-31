-- ============================================================
-- Migration: Survey checklist fields on audit_history.
--
-- Adds the extra columns the new /survey feature needs that audit_history
-- didn't already have: why a store came back Partial or Offline during a
-- survey (a fixed reason, not just free-text notes), and how many days of
-- playback the surveyor actually saw (to sanity-check against the HDD
-- Capacity reference table in src/lib/recovery.ts). The survey's *live*
-- status (Online/Partial/Offline) and the cctv_assets fields it's based on
-- (nvr_online, camera_working/failed, playback_status, hdd_status,
-- hdd_capacity) are NOT duplicated here — the Survey writes those straight
-- into `stores`/`cctv_assets` via the existing editAssetDetails() action,
-- same as a manual Edit Detail, so Asset Register stays the single live
-- source of truth. This table is only the historical log of each check.
--
-- No RLS changes needed — audit_history already has "audit: scoped read"
-- and "audit: hq_admin write" policies (migration 004) that cover these
-- new columns automatically.
--
-- Run this once in the Supabase SQL Editor, after 018.
-- ============================================================

alter table public.audit_history
  add column if not exists partial_reason text,
  add column if not exists offline_reason text,
  add column if not exists retention_days_seen int;
