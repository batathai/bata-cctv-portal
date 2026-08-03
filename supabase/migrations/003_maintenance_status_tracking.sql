-- ============================================================
-- Migration: adds repair tracking (status, start/completion dates)
-- to maintenance_history, and the RLS policy that lets scoped
-- users update an existing repair record (e.g. mark it Completed).
-- Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.maintenance_history
  add column if not exists status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed')),
  add column if not exists started_date date,
  add column if not exists completed_date date,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_maintenance_status on public.maintenance_history(status);

-- updated_at trigger (skip if it already exists in your project)
create trigger trg_maintenance_updated_at before update on public.maintenance_history
  for each row execute procedure public.set_updated_at();

-- Allow the same scoped users who can insert repair records to update them too
-- (e.g. changing status from Pending -> In Progress -> Completed).
create policy "maintenance: scoped update" on public.maintenance_history
  for update using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
