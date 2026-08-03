-- ============================================================
-- Migration: Sprint 2 - Recovery Center, Task 3: Vendor Information.
--
-- UI + DB structure only — no approval workflow yet (per the sprint notes).
-- One store can have multiple quotations over time (e.g. re-quote after a
-- rejection), so this is its own table rather than columns on `stores`.
-- Run this once in the Supabase SQL Editor, after 007.
-- ============================================================

create table if not exists public.vendor_quotations (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  vendor_name text,
  quotation_number text,
  estimated_cost numeric,
  quotation_date date,
  approval_status text not null default 'Pending'
    check (approval_status in ('Pending', 'Approved', 'Rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_vendor_quotations_store on public.vendor_quotations(store_id);

drop trigger if exists trg_vendor_quotations_updated_at on public.vendor_quotations;
create trigger trg_vendor_quotations_updated_at before update on public.vendor_quotations
  for each row execute procedure public.set_updated_at();

alter table public.vendor_quotations enable row level security;

-- Read: same audience as the Recovery Center Store Detail page
-- (hq_admin sees all; bkk_manager / country_manager scoped to their zone).
-- Suppliers aren't included yet — no supplier-facing quoting workflow exists
-- this sprint; revisit if/when suppliers get their own quoting UI.
drop policy if exists "vendor_quotations: scoped read" on public.vendor_quotations;
create policy "vendor_quotations: scoped read" on public.vendor_quotations
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );

-- Write: hq_admin only for now, consistent with other master-data-ish tables
-- (stores, suppliers) until an approval workflow is designed.
drop policy if exists "vendor_quotations: hq_admin write" on public.vendor_quotations;
create policy "vendor_quotations: hq_admin write" on public.vendor_quotations
  for all using ((select role from public.current_profile()) = 'hq_admin');
