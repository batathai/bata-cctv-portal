-- ============================================================
-- Migration 027: device serial history.
--
-- Request 2026-11-11: when a store's DVR is replaced (new CCTV installation,
-- starting with the Top 20 / Wave 1 stores), the store's Detail page must
-- show "old serial -> new serial". cctv_assets keeps only the current
-- nvr_serial, so the previous value was lost on every change.
--
-- One row per change. The portal only READS this table; rows are written
-- from the Supabase SQL Editor / service-role scripts (the new serial comes
-- from the Hik-Partner Pro export). Safe to re-run.
-- Run this once in the Supabase SQL Editor, after 026.
-- ============================================================

create table if not exists public.device_serial_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  old_serial text,                              -- null = no serial was recorded before
  new_serial text not null,
  changed_on date not null default current_date, -- day the device was swapped
  source text not null default 'Hik-Partner Pro',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists device_serial_history_store_idx
  on public.device_serial_history (store_id, changed_on desc);

alter table public.device_serial_history enable row level security;

revoke all on public.device_serial_history from anon;
revoke insert, update, delete on public.device_serial_history from authenticated;
grant select on public.device_serial_history to authenticated;

drop policy if exists "device_serial_history: hq_admin read" on public.device_serial_history;
create policy "device_serial_history: hq_admin read" on public.device_serial_history
  for select using ((select role from public.current_profile()) = 'hq_admin');
