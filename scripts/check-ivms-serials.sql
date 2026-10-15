-- ============================================================
-- เช็กว่า Serial ของเครื่องใน iVMS (หน้า Cloud P2P Device) ผูกกับสาขาไหนใน portal
-- อ่านอย่างเดียว ไม่แก้ข้อมูล — วางใน Supabase SQL Editor แล้ว Run
--
-- ใช้เมื่อ: ชื่อเครื่องใน iVMS ไม่มีรหัสสาขา (เช่น "DS-7204HGHI-K1(G83641193)")
-- สคริปต์ ivms-monitor 1.4.0 จะจับคู่ด้วย Serial แทน ต้องมี Serial อยู่ใน
-- cctv_assets.nvr_serial หรือ cctv_assets.hik_uid ของสาขาที่ถูกต้อง
--
-- ผลลัพธ์ต่อ serial:
--   ✅ ผูกแล้ว        = เจอสาขาเดียว สคริปต์จับคู่ได้
--   ❌ ยังไม่มีในสาขาใด = ต้องกรอก NVR Serial ใน Asset Register ของสาขานั้น
--   ⚠️ ซ้ำหลายสาขา    = serial เดียวกันอยู่หลายสาขา ต้องแก้ให้เหลือสาขาเดียว
--   ⚠️ สาขาปิดแล้ว     = serial อยู่ในสาขาที่ is_active = false (สคริปต์จะไม่จับคู่)
--
-- รายการด้านล่าง: บัญชี iVMS 56 เครื่อง (ผู้ใช้ส่งมา 15 ต.ค.) — เพิ่มอีกบัญชีได้ในวงเล็บเดียวกัน
-- ============================================================
with ivms(serial) as (
  values
    ('FM1646055'), ('G83637875'), ('G83637941'), ('G83637946'), ('G83638102'),
    ('G83641193'), ('G83641211'), ('G83641278'), ('G83641286'), ('G83641368'),
    ('G83641447'), ('G83641458'), ('G83641468'), ('G83641479'), ('G83641520'),
    ('G83641525'), ('G83641553'), ('G83641562'), ('G83641601'), ('G83641624'),
    ('G83641638'), ('G83641642'), ('G83641657'), ('G83641668'), ('G83641669'),
    ('G83642797'), ('G83642803'), ('G83642821'), ('G83642825'), ('G83642833'),
    ('G83642854'), ('G83642856'), ('G83642859'), ('G83642861'), ('G83642862'),
    ('G83642864'), ('G83642866'), ('G83642873'), ('G83642878'), ('G83642892'),
    ('G83642893'), ('G83642895'), ('G83642896'), ('G83642911'), ('G83642913'),
    ('G83642935'), ('G83642939'), ('G83642950'), ('GV9426178'), ('GV9426180'),
    ('GV9426236'), ('GV9426254'), ('GV9426304'), ('GV9426306'), ('GV9426484'),
    ('GV9426486')
),
assets as (
  select a.store_id,
         s.store_code, s.store_name, coalesce(s.is_active, true) as is_active,
         upper(regexp_replace(coalesce(a.nvr_serial, '') || ' ' || coalesce(a.hik_uid, ''), '[^A-Za-z0-9 ]', '', 'g')) as sn
  from public.cctv_assets a
  join public.stores s on s.id = a.store_id
),
hits as (
  select i.serial, x.store_code, x.store_name, x.is_active
  from ivms i
  left join assets x on x.sn like '%' || i.serial || '%'
)
select
  serial,
  case
    when count(store_code) = 0 then '❌ ยังไม่มีในสาขาใด'
    when count(store_code) filter (where is_active) = 0 then '⚠️ สาขาปิดแล้ว'
    when count(store_code) filter (where is_active) > 1 then '⚠️ ซ้ำหลายสาขา'
    else '✅ ผูกแล้ว'
  end as result,
  string_agg(store_code || ' ' || store_name || case when is_active then '' else ' (ปิด)' end, ' | ') as stores
from hits
group by serial
order by result desc, serial;

-- ------------------------------------------------------------
-- (เสริม) สาขาที่เปิดอยู่แต่ยังไม่มี Serial เลย — ถ้า DVR ของสาขาเหล่านี้อยู่ใน iVMS
-- และชื่อไม่มีรหัสสาขา สคริปต์จะจับคู่ไม่ได้
-- ------------------------------------------------------------
-- select s.store_code, s.store_name, s.zone
-- from public.stores s
-- left join public.cctv_assets a on a.store_id = s.id
-- where coalesce(s.is_active, true)
--   and coalesce(nullif(trim(a.nvr_serial), ''), nullif(trim(a.hik_uid), '')) is null
-- order by s.zone, s.store_code;
