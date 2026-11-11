-- Writes "old serial -> new serial" history for the Top 20 (Wave 1) stores
-- into device_serial_history (migration 027). Run by the owner 2026-11-11:
-- 18 rows. Old serial = value saved in backup_cctv_assets_serial_20261015
-- before the 15 Oct iVMS serial update; new serial = current nvr_serial;
-- changed_on = actual install date (D2). Safe to re-run (no duplicates).
-- 51438 and 54021 are not covered: their serial did not change on 15 Oct.

-- STEP 1 — look first (changes nothing).
select s.store_code, s.store_name,
       nullif(trim(b.nvr_serial), '') as old_serial,
       a.nvr_serial as new_serial,
       coalesce(p.d2_date, p.d1_date, b.backed_up_at::date) as changed_on
from public.installation_projects p
join public.stores s on s.id = p.store_id
join public.cctv_assets a on a.store_id = s.id
join public.backup_cctv_assets_serial_20261015 b on b.store_id = s.id
where p.wave = 'Wave 1'
  and a.nvr_serial is not null
  and nullif(trim(b.nvr_serial), '') is distinct from a.nvr_serial
order by s.store_code;

-- STEP 2 — write the history rows.
insert into public.device_serial_history (store_id, old_serial, new_serial, changed_on, source, note)
select s.id,
       nullif(trim(b.nvr_serial), ''),
       a.nvr_serial,
       coalesce(p.d2_date, p.d1_date, b.backed_up_at::date),
       'iVMS (15 ต.ค. 2026)',
       'ติดตั้งกล้องใหม่ Wave 1 (Top 20)'
from public.installation_projects p
join public.stores s on s.id = p.store_id
join public.cctv_assets a on a.store_id = s.id
join public.backup_cctv_assets_serial_20261015 b on b.store_id = s.id
where p.wave = 'Wave 1'
  and a.nvr_serial is not null
  and nullif(trim(b.nvr_serial), '') is distinct from a.nvr_serial
  and not exists (
    select 1 from public.device_serial_history h
    where h.store_id = s.id and h.new_serial = a.nvr_serial
  )
returning store_id, old_serial, new_serial, changed_on;
