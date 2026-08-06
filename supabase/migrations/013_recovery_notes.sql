-- ============================================================
-- Migration: Recovery Info "Details" field.
--
-- The Recovery Center Store Detail page (/recovery/[code]) had no way to
-- write anything to Cause / Required Action / Repair Date — they were
-- read-only, and nothing in the UI ever wrote to them outside of the bulk
-- import script. This adds a free-text `recovery_notes` column for a
-- general "Details" field, and the Store Detail page now lets HQ Admin
-- edit Cause / Required Action / Repair Date / Details directly.
-- Run this once in the Supabase SQL Editor, after 012.
-- ============================================================

alter table public.stores
  add column if not exists recovery_notes text;
