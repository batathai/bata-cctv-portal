-- Current NVR serial of every Top 20 (Wave 1) store, as stored in the portal.
-- Read-only. Run in the Supabase SQL Editor and send the result back, to be
-- compared with the Hik-Partner Pro export before writing serial history.
select s.store_code, s.store_name, a.nvr_serial, a.hik_uid, a.nvr_model, a.nvr_install_date
from public.installation_projects p
join public.stores s on s.id = p.store_id
left join public.cctv_assets a on a.store_id = s.id
where p.wave = 'Wave 1'
order by s.store_code;
