-- ============================================================
-- Migration: Sprint 2 - Recovery Center.
--
-- Adds the Store Detail page's summary fields directly onto `stores`
-- (rather than reading them from `cctv_assets`) so bkk_manager /
-- country_manager can see them too — those two roles are deliberately
-- blocked from reading `cctv_assets` since migration 004, and this sprint
-- explicitly asks for their Store Detail page to show Online Status and
-- Camera Status alongside what they already see on /status.
--
-- Also widens `recovery_stage` to the 6-value set used by the Recovery
-- Center ("Waiting Repair" and "Verified" are new).
-- Run this once in the Supabase SQL Editor, after 005 and 006.
-- ============================================================

alter table public.stores
  add column if not exists online_status text
    check (online_status in ('Online', 'Offline')),
  add column if not exists camera_status text
    check (camera_status in ('OK', 'Partial', 'Not Work')),
  add column if not exists add_device_status text
    check (add_device_status in ('Registered', 'Not Registered')),
  add column if not exists repair_date date;

alter table public.stores drop constraint if exists stores_recovery_stage_check;
alter table public.stores
  add constraint stores_recovery_stage_check
  check (recovery_stage in (
    'Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed', 'Verified'
  ));
