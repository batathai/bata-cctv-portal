-- ============================================================
-- Migration: Sprint 4 - Asset Register Device Identity.
--
-- Adds Hik UID and QR Code reference to cctv_assets. QR Code is stored here
-- (not in the generic `attachments` table) because it's device identity,
-- uploaded once and kept for the device's lifetime — see the FINAL
-- REQUIREMENT doc's "QR Code" section. The file itself still lives in the
-- same `attachments` Storage bucket (migration 009); this column just
-- points at it directly instead of going through the attachments table.
--
-- Device relocation ("Current Store") reuses the existing unique
-- constraint from migration 001 (cctv_assets_store_id_unique): moving a
-- device to a store that already has one will fail with a constraint
-- violation, which the app surfaces as a friendly error rather than
-- silently overwriting the other device's record.
-- Run this once in the Supabase SQL Editor, after 009.
-- ============================================================

alter table public.cctv_assets
  add column if not exists hik_uid text,
  add column if not exists qr_code_path text;
