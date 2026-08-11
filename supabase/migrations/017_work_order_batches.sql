-- ============================================================
-- Migration: Work Order "Jobs" (batches).
--
-- Replaces is_recovery50 (a single true/false flag — could only ever
-- represent ONE batch, so a second round of work orders had nowhere to go
-- and stray tickets on non-pilot stores had no way to be grouped/labelled
-- at all, they just leaked onto the one Work Orders list) with a proper
-- batch/job entity: each round of work is its own row here, and every
-- store points at whichever batch it currently belongs to. The Work Orders
-- page becomes a list of these batches; clicking one shows just its stores
-- (what used to be the entire page). Closing a batch moves it to History
-- without touching any of the underlying store/ticket/stage data — it's
-- purely a grouping/visibility concept.
--
-- Run this once in the Supabase SQL Editor, after 016.
-- ============================================================

create table if not exists public.work_order_batches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  status text not null default 'Active' check (status in ('Active', 'Closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.work_order_batches enable row level security;

drop policy if exists "work_order_batches: authenticated read" on public.work_order_batches;
create policy "work_order_batches: authenticated read" on public.work_order_batches
  for select using (auth.role() = 'authenticated');

drop policy if exists "work_order_batches: authenticated write" on public.work_order_batches;
create policy "work_order_batches: authenticated insert" on public.work_order_batches
  for insert with check (auth.role() = 'authenticated');
create policy "work_order_batches: authenticated update" on public.work_order_batches
  for update using (auth.role() = 'authenticated');

alter table public.stores
  add column if not exists batch_id uuid references public.work_order_batches(id) on delete set null;

-- --- Backfill: split today's 63 into "Job 1: 50-Store Pilot" (the real 50,
-- same roster as migration 016's is_recovery50) and "Ad-hoc / Unscheduled"
-- (the 13 that leaked in via New Ticket / the per-store Repair Tickets card
-- without ever being part of a formal batch) — per your decision to keep
-- them visibly separate rather than quietly folding them into Job 1. ---

insert into public.work_order_batches (name, status)
values ('Job 1: 50-Store Pilot', 'Active'), ('Ad-hoc / Unscheduled', 'Active');

update public.stores
  set batch_id = (select id from public.work_order_batches where name = 'Job 1: 50-Store Pilot')
  where store_code in (
    '51403', '51404', '51407', '51416', '51426', '51428', '51430', '51431', '51434', '51436',
    '51438', '51506', '51511', '51512', '51518', '51550', '51905', '51906', '51944', '52002',
    '52003', '52007', '52010', '52025', '52037', '53003', '53011', '53012', '53022', '53031',
    '53046', '53905', '53953', '53955', '54017', '54021', '54022', '54023', '54035', '54046',
    '54048', '54094', '55001', '55008', '55012', '55030', '55035', '55038', '55043', '55950'
  );

-- Any store not in the pilot 50 above that still has an open ticket
-- (Open/Assigned/In Progress/Waiting Parts) gets swept into the Ad-hoc
-- batch, so it stays visible somewhere instead of disappearing.
update public.stores
  set batch_id = (select id from public.work_order_batches where name = 'Ad-hoc / Unscheduled')
  where batch_id is null
    and exists (
      select 1 from public.incident_tickets t
      where t.store_id = stores.id
        and t.status in ('Open', 'Assigned', 'In Progress', 'Waiting Parts')
    );

-- Sanity check — first row should read 50, second should read however many
-- stray tickets actually exist right now (13 as of this writing, could
-- differ if more were opened since).
select
  (select count(*) from public.stores where batch_id = (select id from public.work_order_batches where name = 'Job 1: 50-Store Pilot')) as job1_count,
  (select count(*) from public.stores where batch_id = (select id from public.work_order_batches where name = 'Ad-hoc / Unscheduled')) as adhoc_count;
