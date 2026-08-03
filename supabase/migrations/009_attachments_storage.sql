-- ============================================================
-- Migration: Sprint 3 - Asset Register file uploads.
--
-- 1. Widens `attachments.folder` to include the new categories the Asset
--    Register's upload UI uses (Camera Photos, Invoice, Warranty, Manual)
--    on top of the ones already in schema.sql.
-- 2. Creates the private Storage bucket the uploads are written to
--    (src/lib/attachmentWrite.ts). Files are served via signed URLs, not
--    public URLs, so the bucket stays private.
--
-- Storage RLS below is intentionally simple (authenticated users only) —
-- this app is internal-only (no public signup), so it doesn't yet mirror
-- the same per-zone/per-supplier scoping as the `stores` RLS. Tighten this
-- if/when that distinction matters for file access specifically.
-- Run this once in the Supabase SQL Editor, after 008.
-- ============================================================

alter table public.attachments drop constraint if exists attachments_folder_check;
alter table public.attachments
  add constraint attachments_folder_check
  check (folder in (
    'DVR Photos', 'NVR Photos', 'HDD Photos', 'Camera Photos', 'Serial Sticker Photos',
    'Audit Reports', 'Repair Reports', 'Invoice', 'Warranty', 'Manual'
  ));

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments bucket: authenticated read" on storage.objects;
create policy "attachments bucket: authenticated read" on storage.objects
  for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments bucket: authenticated upload" on storage.objects;
create policy "attachments bucket: authenticated upload" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments bucket: authenticated delete" on storage.objects;
create policy "attachments bucket: authenticated delete" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');
