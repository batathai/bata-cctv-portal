-- ============================================================
-- Migration: adds fields needed for the pilot-50 store address
-- list and CCTV diagnostic summary (Store_Address.xlsx /
-- 50-store CCTV summary imports).
-- Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.stores
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists store_group text; -- e.g. 'Tourist', 'City', 'Family'

alter table public.cctv_assets
  add column if not exists camera_status text
    check (camera_status in ('OK', 'Partial', 'Not Work'));
