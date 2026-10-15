-- ============================================================
-- ใส่ Serial ของ DVR ให้สาขา (cctv_assets.nvr_serial) จากรายชื่อเครื่องใน iVMS
-- ชุดที่ 1: บัญชี iVMS 56 เครื่อง (ผู้ใช้ส่งมา 15 ต.ค. 2026)
--
-- ทำไม: สคริปต์ ivms-monitor 1.4.0 จับคู่เครื่องที่ชื่อใน iVMS ไม่มีรหัสสาขาด้วย Serial
--       ต้องมี Serial อยู่ในสาขาที่ถูกต้องก่อน
--
-- วิธีใช้ (Supabase SQL Editor) — ทำทีละขั้น
--   ขั้น 1: Run เฉพาะ "ขั้น 1 ดูก่อน" -> ตรวจคอลัมน์ action
--   ขั้น 2: ถ้าถูกต้อง Run "ขั้น 2 เขียนจริง" (backup ค่าเดิมลงตาราง backup ก่อนเขียน, ไม่ลบข้อมูล)
--
-- กติกา:
--   - Serial เดิมว่าง                         -> ใส่ใหม่
--   - Serial เดิมมี serial นี้อยู่แล้ว (เช่นแบบยาว) -> ไม่แตะ
--   - Serial เดิมเป็นค่าอื่น                    -> เปลี่ยน (ค่าเดิมเก็บใน backup)
--   - สาขายังไม่มีแถวใน cctv_assets            -> สร้างแถวใหม่ (nvr_brand = Hikvision)
--   - รหัสสาขาไม่มีใน stores / สาขาปิดแล้ว       -> ไม่เขียน แสดงให้ตรวจ
--   - Serial นี้อยู่ที่สาขาอื่นอยู่แล้ว            -> ไม่เขียน แสดงให้ตรวจ (เครื่องย้ายสาขา?)
-- ============================================================

-- ------------------------------------------------------------
-- ขั้น 1 ดูก่อน (อ่านอย่างเดียว)
-- ------------------------------------------------------------
with input(store_code, serial, ivms_name) as (
  values
    ('54023', 'FM1646055', 'CentralPlaza Chonburi'),
    ('51439', 'G83637875', 'Robinson Ladkrabang'),
    ('51938', 'G83637941', 'Lotus Lat Phrao'),
    ('51948', 'G83637946', 'Lotus Lak Si'),
    ('51435', 'G83638102', 'Homepro Suvarnabhumi'),
    ('51548', 'G83641193', 'Big C Bang Phi'),
    ('54027', 'G83641211', 'Big C Mahachai'),
    ('51960', 'G83641278', 'Big C Rama 2'),
    ('71205', 'G83641286', 'Infinite Mall'),
    ('51550', 'G83641368', 'Big C Susawat'),
    ('54004', 'G83641447', 'Big C Pattaya'),
    ('55044', 'G83641458', 'Huahin Bluport'),
    ('54094', 'G83641468', 'Central Nakornpathom'),
    ('54016', 'G83641479', 'Big C Chonburi 2'),
    ('51906', 'G83641520', 'Seacon Bang Khea'),
    ('54021', 'G83641525', 'Central Festival Pattaya B'),
    ('51546', 'G83641553', 'Lotus Bang Yai'),
    ('51427', 'G83641562', 'Paradise Park'),
    ('54012', 'G83641601', 'Big C Phetchaburi'),
    ('51518', 'G83641624', 'Central Rama3'),
    ('54022', 'G83641638', 'Central Mahachai'),
    ('51438', 'G83641642', 'Central Pinklao'),
    ('51407', 'G83641657', 'The mall 6'),
    ('51968', 'G83641668', 'Lotus Rama 4'),
    ('51524', 'G83641669', 'Lotus Charan Sanit Wong'),
    ('54011', 'G83642797', 'CentralPlaza Ayutthaya'),
    ('54005', 'G83642803', 'CentralPlaza Sriracha'),
    ('51534', 'G83642821', 'Big C Bangpakok'),
    ('54018', 'G83642825', 'Big C Ayutthaya'),
    ('54945', 'G83642833', 'Lotus Suphan Buri'),
    ('51425', 'G83642854', 'CentralPlaza Chaeng Wattana'),
    ('51132', 'G83642856', 'Big C Lopburi'),
    ('74023', 'G83642859', 'Kanokkan'),
    ('51542', 'G83642861', 'Supreme Complex'),
    ('53947', 'G83642862', 'Big C Rayong'),
    ('51418', 'G83642864', 'Lotus Rangsit Klong 7'),
    ('54029', 'G83642866', 'Harbor Mall'),
    ('51431', 'G83642873', 'Mega Bang Na'),
    ('51430', 'G83642878', 'Central Rama 9'),
    ('54007', 'G83642892', 'Lotus North Pattaya'),
    ('51905', 'G83642893', 'Central Rama2'),
    ('54046', 'G83642895', 'CentralPlaza Rayong'),
    ('51530', 'G83642896', 'Big C Pectkasem'),
    ('51508', 'G83642911', 'Tha Phrachan'),
    ('54040', 'G83642913', 'Robinson Suphan Buri'),
    ('51419', 'G83642935', 'Lotus Navanakorn'),
    ('51517', 'G83642939', 'Lotus Salaya'),
    ('51535', 'G83642950', 'Big C Suwinthawong'),
    ('51426', 'GV9426178', 'Big C Ratchadamri'),
    ('55001', 'GV9426180', 'HuaHin Market'),
    ('51403', 'GV9426236', 'Future Park'),
    ('51436', 'GV9426254', 'CentralPlaza Westgate'),
    ('51944', 'GV9426304', 'MBK'),
    ('51428', 'GV9426306', 'MBK 2'),
    ('51404', 'GV9426484', 'Fashion Island'),
    ('52003', 'GV9426486', 'Ayutthaya Park')
),
plan as (
  select i.*, s.id as store_id, s.store_name, coalesce(s.is_active, true) as is_active,
         a.id as asset_id, a.nvr_serial as current_serial,
         (select string_agg(s2.store_code, ',') from public.cctv_assets a2
            join public.stores s2 on s2.id = a2.store_id
           where s2.store_code <> i.store_code
             and upper(regexp_replace(coalesce(a2.nvr_serial,'') || ' ' || coalesce(a2.hik_uid,''), '[^A-Za-z0-9 ]', '', 'g'))
                 like '%' || i.serial || '%') as used_by
  from input i
  left join public.stores s on s.store_code = i.store_code
  left join public.cctv_assets a on a.store_id = s.id
)
select store_code, store_name, ivms_name, serial, current_serial,
  case
    when store_id is null then '❌ ไม่มีรหัสสาขานี้'
    when not is_active then '⚠️ สาขาปิดแล้ว — ไม่เขียน'
    when used_by is not null then '⚠️ Serial อยู่ที่สาขา ' || used_by || ' — ไม่เขียน'
    when asset_id is null then '➕ สร้างแถวใหม่'
    when coalesce(trim(current_serial), '') = '' then '✏️ ใส่ใหม่'
    when upper(regexp_replace(current_serial, '[^A-Za-z0-9]', '', 'g')) like '%' || serial || '%' then '✅ มีแล้ว'
    else '🔁 เปลี่ยนจากค่าเดิม'
  end as action
from plan
order by action, store_code;


-- ------------------------------------------------------------
-- ขั้น 2 เขียนจริง — เลือกตั้งแต่ BEGIN ถึง COMMIT แล้ว Run
-- ------------------------------------------------------------
/*
begin;

create table if not exists public.backup_cctv_assets_serial_20261015 as
  select a.*, now() as backed_up_at from public.cctv_assets a where false;

with input(store_code, serial, ivms_name) as (
  values
    ('54023', 'FM1646055', 'CentralPlaza Chonburi'),
    ('51439', 'G83637875', 'Robinson Ladkrabang'),
    ('51938', 'G83637941', 'Lotus Lat Phrao'),
    ('51948', 'G83637946', 'Lotus Lak Si'),
    ('51435', 'G83638102', 'Homepro Suvarnabhumi'),
    ('51548', 'G83641193', 'Big C Bang Phi'),
    ('54027', 'G83641211', 'Big C Mahachai'),
    ('51960', 'G83641278', 'Big C Rama 2'),
    ('71205', 'G83641286', 'Infinite Mall'),
    ('51550', 'G83641368', 'Big C Susawat'),
    ('54004', 'G83641447', 'Big C Pattaya'),
    ('55044', 'G83641458', 'Huahin Bluport'),
    ('54094', 'G83641468', 'Central Nakornpathom'),
    ('54016', 'G83641479', 'Big C Chonburi 2'),
    ('51906', 'G83641520', 'Seacon Bang Khea'),
    ('54021', 'G83641525', 'Central Festival Pattaya B'),
    ('51546', 'G83641553', 'Lotus Bang Yai'),
    ('51427', 'G83641562', 'Paradise Park'),
    ('54012', 'G83641601', 'Big C Phetchaburi'),
    ('51518', 'G83641624', 'Central Rama3'),
    ('54022', 'G83641638', 'Central Mahachai'),
    ('51438', 'G83641642', 'Central Pinklao'),
    ('51407', 'G83641657', 'The mall 6'),
    ('51968', 'G83641668', 'Lotus Rama 4'),
    ('51524', 'G83641669', 'Lotus Charan Sanit Wong'),
    ('54011', 'G83642797', 'CentralPlaza Ayutthaya'),
    ('54005', 'G83642803', 'CentralPlaza Sriracha'),
    ('51534', 'G83642821', 'Big C Bangpakok'),
    ('54018', 'G83642825', 'Big C Ayutthaya'),
    ('54945', 'G83642833', 'Lotus Suphan Buri'),
    ('51425', 'G83642854', 'CentralPlaza Chaeng Wattana'),
    ('51132', 'G83642856', 'Big C Lopburi'),
    ('74023', 'G83642859', 'Kanokkan'),
    ('51542', 'G83642861', 'Supreme Complex'),
    ('53947', 'G83642862', 'Big C Rayong'),
    ('51418', 'G83642864', 'Lotus Rangsit Klong 7'),
    ('54029', 'G83642866', 'Harbor Mall'),
    ('51431', 'G83642873', 'Mega Bang Na'),
    ('51430', 'G83642878', 'Central Rama 9'),
    ('54007', 'G83642892', 'Lotus North Pattaya'),
    ('51905', 'G83642893', 'Central Rama2'),
    ('54046', 'G83642895', 'CentralPlaza Rayong'),
    ('51530', 'G83642896', 'Big C Pectkasem'),
    ('51508', 'G83642911', 'Tha Phrachan'),
    ('54040', 'G83642913', 'Robinson Suphan Buri'),
    ('51419', 'G83642935', 'Lotus Navanakorn'),
    ('51517', 'G83642939', 'Lotus Salaya'),
    ('51535', 'G83642950', 'Big C Suwinthawong'),
    ('51426', 'GV9426178', 'Big C Ratchadamri'),
    ('55001', 'GV9426180', 'HuaHin Market'),
    ('51403', 'GV9426236', 'Future Park'),
    ('51436', 'GV9426254', 'CentralPlaza Westgate'),
    ('51944', 'GV9426304', 'MBK'),
    ('51428', 'GV9426306', 'MBK 2'),
    ('51404', 'GV9426484', 'Fashion Island'),
    ('52003', 'GV9426486', 'Ayutthaya Park')
),
plan as (
  select i.*, s.id as store_id, a.id as asset_id, a.nvr_serial as current_serial
  from input i
  join public.stores s on s.store_code = i.store_code and coalesce(s.is_active, true)
  left join public.cctv_assets a on a.store_id = s.id
  where not exists (
    select 1 from public.cctv_assets a2 join public.stores s2 on s2.id = a2.store_id
    where s2.store_code <> i.store_code
      and upper(regexp_replace(coalesce(a2.nvr_serial,'') || ' ' || coalesce(a2.hik_uid,''), '[^A-Za-z0-9 ]', '', 'g'))
          like '%' || i.serial || '%')
),
todo as (
  select * from plan
  where asset_id is null
     or coalesce(trim(current_serial), '') = ''
     or upper(regexp_replace(current_serial, '[^A-Za-z0-9]', '', 'g')) not like '%' || serial || '%'
),
backup as (
  insert into public.backup_cctv_assets_serial_20261015
  select a.*, now() from public.cctv_assets a join todo t on t.asset_id = a.id
  returning 1
),
upd as (
  update public.cctv_assets a set nvr_serial = t.serial, updated_at = now()
  from todo t where t.asset_id = a.id
  returning a.store_id
),
ins as (
  insert into public.cctv_assets (store_id, nvr_brand, nvr_serial)
  select store_id, 'Hikvision', serial from todo where asset_id is null
  returning store_id
)
select (select count(*) from backup) as backed_up,
       (select count(*) from upd) as updated,
       (select count(*) from ins) as inserted;

commit;
*/

-- ย้อนกลับ (ถ้าจำเป็น): คืนค่า nvr_serial เดิมจาก backup
-- update public.cctv_assets a set nvr_serial = b.nvr_serial
-- from public.backup_cctv_assets_serial_20261015 b where b.id = a.id;
-- แถวที่ "สร้างใหม่" ไม่อยู่ใน backup: ดูจาก created/updated_at = เวลาที่รัน
