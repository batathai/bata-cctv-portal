-- ============================================================
-- BATA CCTV Management Portal — Core Schema
-- Target: Supabase (PostgreSQL)
-- Scales from 50 pilot stores to 500+ stores.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- SUPPLIERS ----------
create table if not exists public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  contact_name text,
  contact_email text,
  contact_phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- ROLES & USERS ----------
create type user_role as enum ('hq_admin', 'bkk_manager', 'country_manager', 'supplier');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique not null,
  role user_role not null default 'supplier',
  assigned_zones text[] default '{}',      -- e.g. {'511','512','513'}
  supplier_id uuid references public.suppliers(id),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- STORES ----------
create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  store_code text unique not null,          -- e.g. '51101'
  store_name text not null,
  region text not null check (region in ('Bangkok','Upcountry')),
  zone text not null,                        -- '511','512','513','520','530','540','550','560'
  province text,
  address text,
  phone text,
  store_group text,                          -- e.g. 'Tourist', 'City', 'Family'
  supplier_id uuid references public.suppliers(id),
  overall_status text not null default 'Unknown'
    check (overall_status in ('Healthy','Partial','Offline','Unknown')),
  latitude numeric,
  longitude numeric,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_stores_zone on public.stores(zone);
create index if not exists idx_stores_region on public.stores(region);
create index if not exists idx_stores_status on public.stores(overall_status);

-- ---------- CCTV ASSETS (NVR / Camera / Storage / Network) ----------
create table if not exists public.cctv_assets (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade unique,
  nvr_brand text,
  nvr_model text,
  nvr_serial text,
  nvr_firmware text,
  nvr_mac text,
  nvr_install_date date,
  nvr_online boolean default false,
  camera_total int default 0,
  camera_working int default 0,
  camera_failed int default 0,
  camera_status text check (camera_status in ('OK', 'Partial', 'Not Work')),
  hdd_capacity text,
  hdd_status text check (hdd_status in ('Healthy','Warning','Failed')),
  hdd_install_date date,
  playback_status text check (playback_status in ('Working','Not Working')),
  isp text,
  router_model text,
  internet_type text,
  updated_at timestamptz default now()
);
create index if not exists idx_assets_store on public.cctv_assets(store_id);

-- ---------- HIK-CONNECT / iVMS ----------
create table if not exists public.hikconnect_devices (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_name text,
  hikconnect_status text check (hikconnect_status in ('Online','Offline')),
  owner_account text,       -- 'BATA CCTV BKK' | 'BATA CCTV COUNTRY'
  shared_accounts jsonb default '[]',
  verification_code text,
  last_verified_date date,
  ivms_account text,
  updated_at timestamptz default now()
);
create index if not exists idx_hikconnect_store on public.hikconnect_devices(store_id);

-- ---------- HEALTH SCORE HISTORY ----------
create table if not exists public.health_scores (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  score int not null check (score between 0 and 100),
  nvr_online boolean, playback_working boolean, hdd_healthy boolean, camera_complete boolean,
  recorded_at timestamptz default now()
);
create index if not exists idx_health_store_date on public.health_scores(store_id, recorded_at desc);

-- ---------- MAINTENANCE HISTORY ----------
create table if not exists public.maintenance_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid references public.suppliers(id),
  ticket_ref text,
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  issue_date date not null,        -- date the issue was reported
  started_date date,               -- date a technician began work
  completed_date date,             -- date the repair was finished
  vendor text,
  problem text,
  root_cause text,
  resolution text,
  cost numeric(12,2) default 0,
  technician text,
  attachment_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_maintenance_store on public.maintenance_history(store_id);
create index if not exists idx_maintenance_status on public.maintenance_history(status);

-- ---------- AUDIT HISTORY ----------
create table if not exists public.audit_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  audit_date date not null,
  auditor text,
  playback_result text,
  hdd_result text,
  camera_result text,
  hikconnect_result text,
  overall_status text,
  audit_score int check (audit_score between 0 and 100),
  notes text,
  created_at timestamptz default now()
);

-- ---------- INCIDENT TICKETS ----------
create table if not exists public.incident_tickets (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  issue_type text check (issue_type in
    ('Camera Failure','Playback Failure','HDD Failure','NVR Offline','Network Failure','Hik-Connect Failure')),
  status text default 'Open' check (status in
    ('Open','Assigned','In Progress','Waiting Parts','Completed','Closed')),
  assigned_supplier_id uuid references public.suppliers(id),
  description text,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

-- ---------- ASSET LIFECYCLE ----------
create table if not exists public.asset_lifecycle (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  equipment_type text check (equipment_type in ('NVR','HDD','Camera','Network Equipment')),
  install_date date,
  warranty_end_date date,
  recommended_replacement_date date
);

-- ---------- SPARE PART INVENTORY ----------
create table if not exists public.inventory (
  id uuid primary key default uuid_generate_v4(),
  part_type text check (part_type in ('HDD','Camera','Power Supply','PoE Switch','NVR')),
  current_stock int default 0,
  minimum_stock int default 0,
  reorder_level int default 0,
  updated_at timestamptz default now()
);

-- ---------- FILE REPOSITORY ----------
create table if not exists public.attachments (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores(id) on delete cascade,
  folder text check (folder in
    ('DVR Photos','NVR Photos','HDD Photos','Serial Sticker Photos','Audit Reports','Repair Reports')),
  file_path text not null,          -- Supabase Storage path
  file_name text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ---------- NOTIFICATIONS ----------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores(id) on delete cascade,
  type text check (type in
    ('Store Offline','HDD Failure','Playback Failure','Audit Due','Warranty Expiry','Critical Health Score')),
  channel text check (channel in ('Email','Microsoft Teams','LINE')),
  message text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- IMPORT / BULK UPDATE + ROLLBACK SUPPORT
-- Every bulk CSV/Excel import is grouped into a batch.
-- Each affected row's *previous* values are snapshotted so a
-- batch can be rolled back exactly.
-- ============================================================
create table if not exists public.import_batches (
  id uuid primary key default uuid_generate_v4(),
  target_table text not null,             -- e.g. 'stores', 'cctv_assets'
  file_name text,
  column_mapping jsonb not null,          -- { "Store Code": "store_code", ... }
  row_count int default 0,
  status text default 'completed' check (status in ('completed','rolled_back','failed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  rolled_back_at timestamptz
);

create table if not exists public.import_batch_rows (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  target_table text not null,
  record_id uuid,                          -- null if row was newly inserted
  operation text not null check (operation in ('insert','update')),
  previous_values jsonb,                   -- snapshot before the import (null for inserts)
  new_values jsonb not null,
  created_at timestamptz default now()
);
create index if not exists idx_import_rows_batch on public.import_batch_rows(batch_id);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_stores_updated_at before update on public.stores
  for each row execute procedure public.set_updated_at();
create trigger trg_assets_updated_at before update on public.cctv_assets
  for each row execute procedure public.set_updated_at();
create trigger trg_maintenance_updated_at before update on public.maintenance_history
  for each row execute procedure public.set_updated_at();
