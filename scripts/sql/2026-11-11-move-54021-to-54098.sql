-- 54021 Central Pattaya closed and moved to the new code 54098 Central Pattaya
-- Beach 26 (owner, 2026-11-11). Moves the Wave 1 installation card to 54098,
-- creates its asset row with the new NVR, writes the serial history and puts
-- 54021's camera count back to 2. Run by the owner 2026-11-11 (verified).
begin;

update public.installation_projects p
set store_id = n.id
from public.stores o, public.stores n
where o.store_code = '54021' and n.store_code = '54098'
  and p.store_id = o.id;

update public.installation_stage_history h
set store_id = n.id
from public.stores o, public.stores n
where o.store_code = '54021' and n.store_code = '54098'
  and h.store_id = o.id;

insert into public.cctv_assets (store_id, nvr_brand, nvr_serial, nvr_model, nvr_install_date, camera_total)
select id, 'Hikvision', 'GV9426312', 'DS-7604NXI-K1/4P(D)', date '2026-11-02', 3
from public.stores where store_code = '54098'
on conflict (store_id) do update
set nvr_serial = excluded.nvr_serial,
    nvr_model = excluded.nvr_model,
    nvr_install_date = excluded.nvr_install_date,
    camera_total = excluded.camera_total;

insert into public.device_serial_history (store_id, old_serial, new_serial, changed_on, source, note)
select s.id, 'G83641525', 'GV9426312', date '2026-11-02',
       'Hik-Partner Pro (11 พ.ย. 2026)',
       'ย้ายร้านจาก 54021 Central Pattaya — ติดตั้งกล้องใหม่ Wave 1 (Top 20)'
from public.stores s
where s.store_code = '54098'
  and not exists (
    select 1 from public.device_serial_history h
    where h.store_id = s.id and h.new_serial = 'GV9426312'
  );

update public.cctv_assets a
set camera_total = 2
from public.stores s
where s.id = a.store_id and s.store_code = '54021';

commit;
