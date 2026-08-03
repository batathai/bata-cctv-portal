-- ============================================================
-- Migration: Sprint 5 - "View Only" device status.
--
-- Adds a 5th overall_status value for stores that can still be watched live
-- (NVR online, camera OK) but have no working recording — playback broken
-- or HDD failed. Previously these were lumped into "Partial", which reads
-- the same as an actual camera problem; this gives them a distinct, more
-- accurate label everywhere overall_status is shown (Device Status, Asset
-- Register, Store Detail, Store List filter).
-- Run this once in the Supabase SQL Editor, after 010.
-- ============================================================

alter table public.stores drop constraint if exists stores_overall_status_check;
alter table public.stores
  add constraint stores_overall_status_check
  check (overall_status in ('Healthy', 'Partial', 'View Only', 'Offline', 'Unknown'));
