-- ============================================================
-- Migration: scopes down bkk_manager / country_manager to just
-- online/offline status + Hik-Connect quick access.
--
-- Before this migration, both roles could read cctv_assets (NVR/HDD/
-- camera technical detail), health_scores, maintenance_history (repair
-- history + cost), and audit_history for stores in their zone — the UI
-- didn't show it, but it was reachable directly via the Supabase API.
--
-- After this migration:
--   - hq_admin        -> unchanged, sees everything
--   - supplier        -> unchanged, sees/writes their own assigned stores
--   - bkk_manager /
--     country_manager -> stores + hikconnect_devices only (zone-scoped,
--                         via can_access_store, unchanged). No more
--                         cctv_assets / health_scores / maintenance_history
--                         / audit_history read access.
--
-- Run this once in the Supabase SQL Editor on an existing project. Fresh
-- installs get this automatically since supabase/policies.sql already
-- reflects it.
-- ============================================================

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

drop policy if exists "assets: scoped read" on public.cctv_assets;
create policy "assets: scoped read" on public.cctv_assets
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "health: scoped read" on public.health_scores;
create policy "health: scoped read" on public.health_scores
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "maintenance: scoped read" on public.maintenance_history;
create policy "maintenance: scoped read" on public.maintenance_history
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "maintenance: scoped insert" on public.maintenance_history;
create policy "maintenance: scoped insert" on public.maintenance_history
  for insert with check (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "maintenance: scoped update" on public.maintenance_history;
create policy "maintenance: scoped update" on public.maintenance_history
  for update using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "audit: scoped read" on public.audit_history;
create policy "audit: scoped read" on public.audit_history
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and public.can_access_detail(s.zone, s.supplier_id))
  );

drop policy if exists "audit: hq_admin write" on public.audit_history;
create policy "audit: hq_admin write" on public.audit_history
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
