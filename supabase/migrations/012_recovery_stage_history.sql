-- ============================================================
-- Migration: Sprint 4 - Work Orders (ใบงาน).
--
-- Every recovery_stage change on `stores` is now also logged here, so the
-- Work Order detail page (/recovery/[code]) can render a step-by-step
-- timeline ("Waiting Vendor Quote" -> ... -> "Verified") with a timestamp
-- and optional note per step, instead of only showing the current stage.
-- Append-only: no update/delete policy, matching maintenance_history.
-- Run this once in the Supabase SQL Editor, after 011.
-- ============================================================

create table if not exists public.recovery_stage_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  from_stage text
    check (from_stage in ('Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed', 'Verified')),
  to_stage text not null
    check (to_stage in ('Waiting Vendor Quote', 'Waiting Approval', 'Waiting Repair', 'Repairing', 'Completed', 'Verified')),
  note text,
  changed_at timestamptz not null default now()
);
create index if not exists idx_recovery_stage_history_store on public.recovery_stage_history(store_id);
create index if not exists idx_recovery_stage_history_changed_at on public.recovery_stage_history(changed_at);

alter table public.recovery_stage_history enable row level security;

-- Read: same audience as the Work Order / Recovery Center Store Detail page.
drop policy if exists "recovery_stage_history: scoped read" on public.recovery_stage_history;
create policy "recovery_stage_history: scoped read" on public.recovery_stage_history
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );

-- Write: append-only insert, same scope as read — anyone who can open a
-- store's Work Order can log a stage update for it (mirrors incident_tickets).
drop policy if exists "recovery_stage_history: scoped insert" on public.recovery_stage_history;
create policy "recovery_stage_history: scoped insert" on public.recovery_stage_history
  for insert with check (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
