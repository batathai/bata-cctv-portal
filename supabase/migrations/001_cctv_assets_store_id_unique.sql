-- ============================================================
-- Migration: required if you ran supabase/schema.sql before the
-- CCTV Asset bulk-import feature was added.
--
-- The import feature upserts cctv_assets rows keyed by store_id, which
-- requires a unique constraint on that column. Run this once in the
-- Supabase SQL Editor.
-- ============================================================

alter table public.cctv_assets
  add constraint cctv_assets_store_id_unique unique (store_id);
