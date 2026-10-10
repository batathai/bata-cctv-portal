-- ============================================================
-- Migration: Device Offline Monitoring (iVMS reader).
--
-- A script on the 24/7 HQ PC (tools/ivms-monitor/monitor.py) reads the
-- iVMS-4200 "Cloud P2P Device" page every few minutes and writes the
-- result here with the service_role key. The portal only reads these
-- tables and edits a handful of per-store settings (monitored flag,
-- business hours, mute) plus the global settings row.
--
-- Numbered 022 on purpose: 020/021 are already used on the unmerged
-- `docs/installation-project-plan` branch.
--
-- Design: docs/workflow/DESIGN-device-offline-monitoring.md
-- Run this once in the Supabase SQL Editor, after 019 (and after 021 if
-- the Installation Project branch has been merged first — they don't
-- touch the same tables, so the order between them does not matter).
-- ============================================================

-- ---------- helper: is the caller an HQ admin? ----------
create or replace function public.is_hq_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'hq_admin' and coalesce(p.is_active, true)
  );
$$ language sql stable security definer;

-- ---------- outage history ----------
create table if not exists public.device_outages (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  started_at timestamptz not null,          -- = last seen Online before the outage
  detected_at timestamptz not null,         -- cycle that confirmed Offline
  ended_at timestamptz,                     -- null = still offline
  duration_minutes int generated always as (
    case when ended_at is null then null
         else (extract(epoch from (ended_at - started_at)) / 60)::int end
  ) stored,
  during_business_hours boolean not null,
  muted boolean not null default false,
  central_suspect boolean not null default false,
  alert_sent_at timestamptz,
  recovery_alert_sent_at timestamptz,
  late_open_alert_sent_at timestamptz,
  summary_sent_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_device_outages_store_started on public.device_outages(store_id, started_at desc);
create index if not exists idx_device_outages_started on public.device_outages(started_at desc);
create index if not exists idx_device_outages_open on public.device_outages(store_id) where ended_at is null;

-- ---------- current state, one row per store ----------
create table if not exists public.store_monitor (
  store_id uuid primary key references public.stores(id) on delete cascade,
  monitored boolean not null default false,
  state text not null default 'Unknown' check (state in ('Online', 'Offline', 'Unknown')),
  state_since timestamptz,
  last_seen_at timestamptz,
  offline_streak int not null default 0,
  current_outage_id uuid references public.device_outages(id) on delete set null,
  ivms_device_name text,
  first_seen_at timestamptz,
  open_time time,                           -- null = use monitor_settings.default_open_time
  close_time time,                          -- null = use monitor_settings.default_close_time
  muted_until timestamptz,
  mute_reason text,
  muted_by uuid references public.profiles(id) on delete set null,
  note text,
  updated_at timestamptz not null default now(),
  constraint store_monitor_mute_reason check (muted_until is null or coalesce(trim(mute_reason), '') <> ''),
  constraint store_monitor_hours_pair check ((open_time is null) = (close_time is null))
);
create index if not exists idx_store_monitor_monitored on public.store_monitor(monitored);

drop trigger if exists trg_store_monitor_updated_at on public.store_monitor;
create trigger trg_store_monitor_updated_at before update on public.store_monitor
  for each row execute procedure public.set_updated_at();

-- Every store gets a row, so the portal only ever UPDATEs (no insert grant).
insert into public.store_monitor (store_id)
select s.id from public.stores s
on conflict (store_id) do nothing;

create or replace function public.create_store_monitor_row()
returns trigger as $$
begin
  insert into public.store_monitor (store_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_stores_create_monitor_row on public.stores;
create trigger trg_stores_create_monitor_row after insert on public.stores
  for each row execute procedure public.create_store_monitor_row();

-- Starting monitored list: stores already registered to an iVMS account.
-- The script also auto-ticks any store it sees in iVMS, and the Rollout tab
-- lets HQ tick the rest by hand.
update public.store_monitor m
set monitored = true
from public.hikconnect_devices h
where h.store_id = m.store_id
  and coalesce(trim(h.ivms_account), '') <> '';

-- ---------- monitor run log = heartbeat of the HQ script ----------
create table if not exists public.monitor_runs (
  id uuid primary key default uuid_generate_v4(),
  ran_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'partial', 'suspect', 'failed')),
  ivms_total int,
  offline_count int,
  page_full boolean,
  monitored_count int,
  unmatched text[] not null default '{}',
  error text,
  duration_ms int,
  script_version text
);
create index if not exists idx_monitor_runs_ran_at on public.monitor_runs(ran_at desc);

-- ---------- settings (single row) ----------
create table if not exists public.monitor_settings (
  id int primary key default 1 check (id = 1),
  check_interval_minutes int not null default 5 check (check_interval_minutes between 1 and 60),
  confirm_cycles int not null default 2 check (confirm_cycles between 1 and 10),
  default_open_time time not null default '10:00',
  default_close_time time not null default '22:00',
  late_open_grace_minutes int not null default 30 check (late_open_grace_minutes between 0 and 240),
  mass_alert_threshold int not null default 10 check (mass_alert_threshold between 2 and 500),
  suspect_ratio numeric(3,2) not null default 0.80 check (suspect_ratio > 0 and suspect_ratio <= 1),
  stale_after_minutes int not null default 15 check (stale_after_minutes between 5 and 240),
  alert_recipients text[] not null default '{}',
  admin_recipients text[] not null default '{}',
  morning_summary_time time not null default '10:00',
  emails_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.monitor_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_monitor_settings_updated_at on public.monitor_settings;
create trigger trg_monitor_settings_updated_at before update on public.monitor_settings
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS + privileges. The HQ script uses service_role, which bypasses both.
-- ============================================================
alter table public.store_monitor enable row level security;
alter table public.device_outages enable row level security;
alter table public.monitor_runs enable row level security;
alter table public.monitor_settings enable row level security;

revoke all on public.store_monitor, public.device_outages, public.monitor_runs, public.monitor_settings from anon;
revoke insert, update, delete on public.store_monitor, public.device_outages, public.monitor_runs, public.monitor_settings from authenticated;
grant select on public.store_monitor, public.device_outages, public.monitor_runs, public.monitor_settings to authenticated;

-- Portal may change only these columns; state/last_seen/outage links stay script-only.
grant update (monitored, open_time, close_time, muted_until, mute_reason, muted_by, note)
  on public.store_monitor to authenticated;
grant update (note) on public.device_outages to authenticated;
grant update (check_interval_minutes, confirm_cycles, default_open_time, default_close_time,
              late_open_grace_minutes, mass_alert_threshold, suspect_ratio, stale_after_minutes,
              alert_recipients, admin_recipients, morning_summary_time, emails_enabled, updated_by)
  on public.monitor_settings to authenticated;

-- store_monitor
drop policy if exists "store_monitor: scoped read" on public.store_monitor;
create policy "store_monitor: scoped read" on public.store_monitor
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
drop policy if exists "store_monitor: hq update" on public.store_monitor;
create policy "store_monitor: hq update" on public.store_monitor
  for update using (public.is_hq_admin()) with check (public.is_hq_admin());

-- device_outages
drop policy if exists "device_outages: scoped read" on public.device_outages;
create policy "device_outages: scoped read" on public.device_outages
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
drop policy if exists "device_outages: hq note" on public.device_outages;
create policy "device_outages: hq note" on public.device_outages
  for update using (public.is_hq_admin()) with check (public.is_hq_admin());

-- monitor_runs (read only from the portal)
drop policy if exists "monitor_runs: hq read" on public.monitor_runs;
create policy "monitor_runs: hq read" on public.monitor_runs
  for select using (public.is_hq_admin());

-- monitor_settings
drop policy if exists "monitor_settings: hq read" on public.monitor_settings;
create policy "monitor_settings: hq read" on public.monitor_settings
  for select using (public.is_hq_admin());
drop policy if exists "monitor_settings: hq update" on public.monitor_settings;
create policy "monitor_settings: hq update" on public.monitor_settings
  for update using (public.is_hq_admin()) with check (public.is_hq_admin());
