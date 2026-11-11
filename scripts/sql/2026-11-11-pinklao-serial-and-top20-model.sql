-- From the Hik-Partner Pro export of 2026-11-11 17:04 (9 sites / 129 devices).
-- 18 of the Top 20 serials already match the portal. Two fixes below.
-- Run in the Supabase SQL Editor, one step at a time.

-- STEP 1 — 51438 Central Pinklao: portal still holds the old DVR serial
-- (G83641642); Hik-Partner Pro shows the new NVR GV9426266. Updates the
-- current serial and writes the history row together. Does nothing if the
-- portal serial is no longer G83641642 (safe to re-run). Expect 1 row.
with upd as (
  update public.cctv_assets a
  set nvr_serial = 'GV9426266', updated_at = now()
  from public.stores s
  where s.id = a.store_id
    and s.store_code = '51438'
    and a.nvr_serial = 'G83641642'
  returning a.store_id
)
insert into public.device_serial_history (store_id, old_serial, new_serial, changed_on, source, note)
select u.store_id, 'G83641642', 'GV9426266',
       coalesce(p.d2_date, p.d1_date, current_date),
       'Hik-Partner Pro (11 พ.ย. 2026)',
       'ติดตั้งกล้องใหม่ Wave 1 (Top 20)'
from upd u
left join public.installation_projects p on p.store_id = u.store_id
returning store_id, old_serial, new_serial, changed_on;

-- STEP 2 (optional) — the 19 Top 20 stores that now run the new NVR still
-- show the old DVR's model and install date. Sets the model seen in
-- Hik-Partner Pro and the install date = actual install date (D2).
-- 54021 is excluded: it still runs the old DS-7204HGHI-K1. Expect 19 rows.
update public.cctv_assets a
set nvr_model = 'DS-7604NXI-K1/4P(D)',
    nvr_install_date = coalesce(p.d2_date, a.nvr_install_date),
    updated_at = now()
from public.installation_projects p
join public.stores s on s.id = p.store_id
where a.store_id = p.store_id
  and p.wave = 'Wave 1'
  and s.store_code <> '54021'
returning s.store_code, s.store_name, a.nvr_serial, a.nvr_model, a.nvr_install_date;
