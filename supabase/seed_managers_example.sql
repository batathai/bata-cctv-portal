-- ============================================================
-- Run this in the Supabase SQL Editor AFTER each manager has an
-- auth.users account (i.e. after they've been invited / signed up
-- at least once via /login — Supabase Auth must know their email
-- before a profiles row can reference it).
--
-- Replace the two email placeholders below with the real work
-- emails, then run.
-- ============================================================

-- BKK Manager — zones 511, 512, 513, 550
insert into public.profiles (id, email, full_name, role, assigned_zones, is_active)
select id, email, 'BKK Manager', 'bkk_manager', array['511','512','513','550'], true
from auth.users
where email = 'bkk.manager@bata.co.th'   -- <-- replace with the real email
on conflict (id) do update set
  role = excluded.role,
  assigned_zones = excluded.assigned_zones,
  is_active = true;

-- Country Manager — zones 520, 530, 540, 560
insert into public.profiles (id, email, full_name, role, assigned_zones, is_active)
select id, email, 'Country Manager', 'country_manager', array['520','530','540','560'], true
from auth.users
where email = 'country.manager@bata.co.th'   -- <-- replace with the real email
on conflict (id) do update set
  role = excluded.role,
  assigned_zones = excluded.assigned_zones,
  is_active = true;

-- Verify:
select email, role, assigned_zones from public.profiles
where role in ('bkk_manager', 'country_manager');
