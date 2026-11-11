-- Set "Cameras" (cctv_assets.camera_total) to 3 for every Top 20 store
-- (= installation Wave 1, 20 stores). Requested by the owner 2026-11-11.
-- Run in the Supabase SQL Editor, one step at a time.

-- STEP 1 — look first (changes nothing). Expect 20 rows; keep this result
-- as the record of the old values.
select s.store_code, s.store_name, a.camera_total, a.camera_working, a.camera_failed
from public.installation_projects p
join public.stores s on s.id = p.store_id
left join public.cctv_assets a on a.store_id = s.id
where p.wave = 'Wave 1'
order by s.store_code;

-- STEP 2 — apply. Returns the rows it changed (expect 20).
update public.cctv_assets a
set camera_total = 3
from public.installation_projects p
join public.stores s on s.id = p.store_id
where a.store_id = p.store_id
  and p.wave = 'Wave 1'
returning s.store_code, s.store_name, a.camera_total;
