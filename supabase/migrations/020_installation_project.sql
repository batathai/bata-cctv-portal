-- ============================================================
-- Migration: Installation Project.
--
-- Tracks new-CCTV installation progress per store, from Floor Plan
-- through Verify, across the 194-store rollout (Wave 1 = first 20).
-- Separate from the Recovery/Work Order flow (recovery_stage on
-- `stores`, work_order_batches): installation is a first-time build-out,
-- not a repair, so it gets its own stage machine and history table,
-- following the same append-only pattern as recovery_stage_history
-- (migration 012).
--
-- Reused as-is (no schema change needed):
--   - vendor_quotations (migration 008) for the budget/quote step
--   - work_order_batches (migration 017) for "Wave" grouping, via the
--     `wave` text column below rather than a second FK on `stores`,
--     since stores.batch_id already belongs to repair batches
--   - attachments + its Storage bucket (migration 009) — just widening
--     the `folder` check constraint below for installation file types
--
-- Run this once in the Supabase SQL Editor, after 019.
-- Design doc: docs/workflow/DESIGN-installation-project.md
-- ============================================================

-- ---------- INSTALLATION PROJECTS (1 row per store) ----------
create table if not exists public.installation_projects (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade unique,
  wave text not null,
  current_stage text not null default 'Floor Plan'
    check (current_stage in (
      'Floor Plan', 'Layout', 'Quotation', 'Permit',
      'Scheduled', 'Installing', 'Verify', 'Completed'
    )),
  approved_quotation_id uuid references public.vendor_quotations(id),
  permit_submitted_at date,
  d1_date date,                                -- วันนัดติดตั้ง (scheduled)
  d2_date date,                                -- วันติดตั้งจริง (actual)
  verify_checked jsonb not null default '[]',  -- e.g. ["A1","A2",...] — checked item keys
  verify_total int not null default 0,          -- 0-12, kept in sync with verify_checked by the app
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_install_projects_stage on public.installation_projects(current_stage);
create index if not exists idx_install_projects_wave on public.installation_projects(wave);

create trigger trg_install_projects_updated_at before update on public.installation_projects
  for each row execute procedure public.set_updated_at();

-- ---------- INSTALLATION STAGE HISTORY (append-only) ----------
create table if not exists public.installation_stage_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  from_stage text
    check (from_stage in (
      'Floor Plan', 'Layout', 'Quotation', 'Permit',
      'Scheduled', 'Installing', 'Verify', 'Completed'
    )),
  to_stage text not null
    check (to_stage in (
      'Floor Plan', 'Layout', 'Quotation', 'Permit',
      'Scheduled', 'Installing', 'Verify', 'Completed'
    )),
  note text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists idx_install_history_store on public.installation_stage_history(store_id, changed_at desc);

-- ---------- ATTACHMENTS: widen folder categories for Installation ----------
alter table public.attachments drop constraint if exists attachments_folder_check;
alter table public.attachments
  add constraint attachments_folder_check
  check (folder in (
    'DVR Photos', 'NVR Photos', 'HDD Photos', 'Serial Sticker Photos',
    'Audit Reports', 'Repair Reports',
    'Site Survey Photos', 'Permit Documents', 'Camera Install Photos', 'Verify Photos'
  ));

-- ---------- RLS ----------
alter table public.installation_projects enable row level security;
alter table public.installation_stage_history enable row level security;

-- hq_admin only for both tables, for now — this app is single-role
-- (src/lib/rbac.ts). Left as its own policy (not can_access_store) so it's
-- a one-line change to widen to zone-scoped read later, same as migration
-- 004 did for other tables, without needing to touch this table's shape.
drop policy if exists "installation_projects: hq_admin read" on public.installation_projects;
create policy "installation_projects: hq_admin read" on public.installation_projects
  for select using ((select role from public.current_profile()) = 'hq_admin');

drop policy if exists "installation_projects: hq_admin insert" on public.installation_projects;
create policy "installation_projects: hq_admin insert" on public.installation_projects
  for insert with check ((select role from public.current_profile()) = 'hq_admin');

drop policy if exists "installation_projects: hq_admin update" on public.installation_projects;
create policy "installation_projects: hq_admin update" on public.installation_projects
  for update using ((select role from public.current_profile()) = 'hq_admin');

drop policy if exists "installation_stage_history: hq_admin read" on public.installation_stage_history;
create policy "installation_stage_history: hq_admin read" on public.installation_stage_history
  for select using ((select role from public.current_profile()) = 'hq_admin');

drop policy if exists "installation_stage_history: hq_admin insert" on public.installation_stage_history;
create policy "installation_stage_history: hq_admin insert" on public.installation_stage_history
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
