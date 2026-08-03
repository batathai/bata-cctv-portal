-- ============================================================
-- Row Level Security — implements the role matrix:
--   hq_admin         -> all stores, all data, user management
--   bkk_manager      -> zones assigned per-user via profiles.assigned_zones
--                        (currently 511/512/513/550)
--   country_manager  -> zones assigned per-user via profiles.assigned_zones
--                        (currently 520/530/540/560)
--   supplier         -> only stores assigned to their supplier_id,
--                        can write maintenance activity, cannot
--                        touch master data (stores/assets/users)
-- ============================================================

alter table public.stores enable row level security;
alter table public.cctv_assets enable row level security;
alter table public.hikconnect_devices enable row level security;
alter table public.health_scores enable row level security;
alter table public.maintenance_history enable row level security;
alter table public.audit_history enable row level security;
alter table public.incident_tickets enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_batch_rows enable row level security;
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;

-- Helper: current user's profile
create or replace function public.current_profile()
returns public.profiles as $$
  select * from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- Helper: can the current user see this store?
create or replace function public.can_access_store(store_zone text, store_supplier uuid)
returns boolean as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p is null then return false; end if;
  if p.role = 'hq_admin' then return true; end if;
  if p.role in ('bkk_manager','country_manager') then
    return store_zone = any(p.assigned_zones);
  end if;
  if p.role = 'supplier' then
    return store_supplier = p.supplier_id;
  end if;
  return false;
end;
$$ language plpgsql stable security definer;

-- Helper: can the current user see *technical detail* tables (cctv_assets,
-- health_scores, maintenance_history, audit_history)? bkk_manager /
-- country_manager are deliberately excluded here — they only get
-- online/offline status (stores.overall_status) and Hik-Connect quick
-- access (hikconnect_devices), not NVR/HDD internals, repair history, or
-- audit results. Only hq_admin (everything) and supplier (their own
-- assigned stores, so they can log repairs) get through.
create or replace function public.can_access_detail(store_zone text, store_supplier uuid)
returns boolean as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p is null then return false; end if;
  if p.role = 'hq_admin' then return true; end if;
  if p.role = 'supplier' then
    return store_supplier = p.supplier_id;
  end if;
  return false;
end;
$$ language plpgsql stable security definer;

-- ---------- profiles ----------
create policy "profiles: self or hq_admin read" on public.profiles
  for select using (id = auth.uid() or (select role from public.current_profile()) = 'hq_admin');
create policy "profiles: hq_admin manage" on public.profiles
  for all using ((select role from public.current_profile()) = 'hq_admin');

-- ---------- suppliers ----------
create policy "suppliers: readable by authenticated" on public.suppliers
  for select using (auth.role() = 'authenticated');
create policy "suppliers: hq_admin manage" on public.suppliers
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
create policy "suppliers: hq_admin update" on public.suppliers
  for update using ((select role from public.current_profile()) = 'hq_admin');

-- ---------- stores ----------
create policy "stores: scoped read" on public.stores
  for select using (public.can_access_store(zone, supplier_id));
create policy "stores: hq_admin write" on public.stores
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
create policy "stores: hq_admin update" on public.stores
  for update using ((select role from public.current_profile()) = 'hq_admin');
create policy "stores: hq_admin delete" on public.stores
  for delete using ((select role from public.current_profile()) = 'hq_admin');

-- ---------- cctv_assets ----------
-- Technical detail (NVR/HDD/camera specifics) — hq_admin + supplier only.
create policy "assets: scoped read" on public.cctv_assets
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );
create policy "assets: hq_admin write" on public.cctv_assets
  for all using ((select role from public.current_profile()) = 'hq_admin');

-- ---------- hikconnect_devices ----------
create policy "hikconnect: scoped read" on public.hikconnect_devices
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
create policy "hikconnect: hq_admin write" on public.hikconnect_devices
  for all using ((select role from public.current_profile()) = 'hq_admin');

-- ---------- health_scores ----------
create policy "health: scoped read" on public.health_scores
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

-- ---------- maintenance_history (suppliers CAN write; hq_admin manages) ----------
create policy "maintenance: scoped read" on public.maintenance_history
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );
create policy "maintenance: scoped insert" on public.maintenance_history
  for insert with check (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );
create policy "maintenance: scoped update" on public.maintenance_history
  for update using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

-- ---------- audit_history ----------
create policy "audit: scoped read" on public.audit_history
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );
create policy "audit: hq_admin write" on public.audit_history
  for insert with check ((select role from public.current_profile()) = 'hq_admin');

-- ---------- incident_tickets ----------
create policy "incidents: scoped read" on public.incident_tickets
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
create policy "incidents: scoped write" on public.incident_tickets
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );

-- ---------- attachments / notifications ----------
create policy "attachments: scoped read" on public.attachments
  for select using (
    store_id is null or exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );
create policy "notifications: scoped read" on public.notifications
  for select using (
    store_id is null or exists (select 1 from public.stores s where s.id = store_id and public.can_access_store(s.zone, s.supplier_id))
  );

-- ---------- import batches (master-data feature, HQ Admin only) ----------
create policy "import_batches: hq_admin only" on public.import_batches
  for all using ((select role from public.current_profile()) = 'hq_admin');
create policy "import_batch_rows: hq_admin only" on public.import_batch_rows
  for all using ((select role from public.current_profile()) = 'hq_admin');
