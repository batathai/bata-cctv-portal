-- ============================================================
-- ใส่ Serial ของ DVR ให้สาขา (cctv_assets.nvr_serial) จากรายชื่อเครื่องใน iVMS
-- ครบ 2 บัญชี iVMS: BKK 56 เครื่อง + UPC 68 เครื่อง = 124 เครื่อง (ผู้ใช้ส่งมา 15 ต.ค. 2026)
-- ivms_name ขึ้นต้นด้วย [BKK]/[UPC] = มาจากบัญชีไหน
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
    ('54023', 'FM1646055', '[BKK] CentralPlaza Chonburi'),
    ('51439', 'G83637875', '[BKK] Robinson Ladkrabang'),
    ('51938', 'G83637941', '[BKK] Lotus Lat Phrao'),
    ('51948', 'G83637946', '[BKK] Lotus Lak Si'),
    ('51435', 'G83638102', '[BKK] Homepro Suvarnabhumi'),
    ('51548', 'G83641193', '[BKK] Big C Bang Phi'),
    ('54027', 'G83641211', '[BKK] Big C Mahachai'),
    ('51960', 'G83641278', '[BKK] Big C Rama 2'),
    ('71205', 'G83641286', '[BKK] Infinite Mall'),
    ('51550', 'G83641368', '[BKK] Big C Susawat'),
    ('54004', 'G83641447', '[BKK] Big C Pattaya'),
    ('55044', 'G83641458', '[BKK] Huahin Bluport'),
    ('54094', 'G83641468', '[BKK] Central Nakornpathom'),
    ('54016', 'G83641479', '[BKK] Big C Chonburi 2'),
    ('51906', 'G83641520', '[BKK] Seacon Bang Khea'),
    ('54021', 'G83641525', '[BKK] Central Festival Pattaya B'),
    ('51546', 'G83641553', '[BKK] Lotus Bang Yai'),
    ('51427', 'G83641562', '[BKK] Paradise Park'),
    ('54012', 'G83641601', '[BKK] Big C Phetchaburi'),
    ('51518', 'G83641624', '[BKK] Central Rama3'),
    ('54022', 'G83641638', '[BKK] Central Mahachai'),
    ('51438', 'G83641642', '[BKK] Central Pinklao'),
    ('51407', 'G83641657', '[BKK] The mall 6'),
    ('51968', 'G83641668', '[BKK] Lotus Rama 4'),
    ('51524', 'G83641669', '[BKK] Lotus Charan Sanit Wong'),
    ('54011', 'G83642797', '[BKK] CentralPlaza Ayutthaya'),
    ('54005', 'G83642803', '[BKK] CentralPlaza Sriracha'),
    ('51534', 'G83642821', '[BKK] Big C Bangpakok'),
    ('54018', 'G83642825', '[BKK] Big C Ayutthaya'),
    ('54945', 'G83642833', '[BKK] Lotus Suphan Buri'),
    ('51425', 'G83642854', '[BKK] CentralPlaza Chaeng Wattana'),
    ('51132', 'G83642856', '[BKK] Big C Lopburi'),
    ('74023', 'G83642859', '[BKK] Kanokkan'),
    ('51542', 'G83642861', '[BKK] Supreme Complex'),
    ('53947', 'G83642862', '[BKK] Big C Rayong'),
    ('51418', 'G83642864', '[BKK] Lotus Rangsit Klong 7'),
    ('54029', 'G83642866', '[BKK] Harbor Mall'),
    ('51431', 'G83642873', '[BKK] Mega Bang Na'),
    ('51430', 'G83642878', '[BKK] Central Rama 9'),
    ('54007', 'G83642892', '[BKK] Lotus North Pattaya'),
    ('51905', 'G83642893', '[BKK] Central Rama2'),
    ('54046', 'G83642895', '[BKK] CentralPlaza Rayong'),
    ('51530', 'G83642896', '[BKK] Big C Pectkasem'),
    ('51508', 'G83642911', '[BKK] Tha Phrachan'),
    ('54040', 'G83642913', '[BKK] Robinson Suphan Buri'),
    ('51419', 'G83642935', '[BKK] Lotus Navanakorn'),
    ('51517', 'G83642939', '[BKK] Lotus Salaya'),
    ('51535', 'G83642950', '[BKK] Big C Suwinthawong'),
    ('51426', 'GV9426178', '[BKK] Big C Ratchadamri'),
    ('55001', 'GV9426180', '[BKK] HuaHin Market'),
    ('51403', 'GV9426236', '[BKK] Future Park'),
    ('51436', 'GV9426254', '[BKK] CentralPlaza Westgate'),
    ('51944', 'GV9426304', '[BKK] MBK'),
    ('51428', 'GV9426306', '[BKK] MBK 2'),
    ('51404', 'GV9426484', '[BKK] Fashion Island'),
    ('52003', 'GV9426486', '[BKK] Ayutthaya Park'),
    ('52007', 'G83637755', '[UPC] Lotus Chiang Mai'),
    ('55901', 'G83637818', '[UPC] Robinson Trang'),
    ('52036', 'G83637892', '[UPC] Lotus Ruam Chok'),
    ('52017', 'G83637901', '[UPC] Lotus Maesot'),
    ('55036', 'G83638059', '[UPC] Big C Trang'),
    ('53009', 'G83638068', '[UPC] The Mall Korat'),
    ('52098', 'G83638146', '[UPC] Chaing Mai Destination'),
    ('53037', 'G83638186', '[UPC] Asawann Nong Khai'),
    ('53023', 'G83638192', '[UPC] TOPS Plaza Phol'),
    ('52043', 'G83638225', '[UPC] Big C Phetchabun'),
    ('53021', 'G83638232', '[UPC] Lotus Udon Thani'),
    ('53032', 'G83638235', '[UPC] Robinson Sakon Nakhon'),
    ('55035', 'G83641333', '[UPC] Central Hatyai'),
    ('55018', 'G83641345', '[UPC] Lotus Phatthalung'),
    ('55042', 'G83641349', '[UPC] Lotus Songkhla'),
    ('55030', 'G83641374', '[UPC] Central Suratthani'),
    ('55040', 'G83641389', '[UPC] Lotus Chana'),
    ('53953', 'G83641398', '[UPC] Big C Ubon Ratchathani'),
    ('55949', 'G83641412', '[UPC] Big C Suratthani'),
    ('55902', 'G83641413', '[UPC] Big C Nakhonsithammarat'),
    ('55033', 'G83641416', '[UPC] Lotus Wiangsa'),
    ('53047', 'G83641435', '[UPC] Lotus Ubol Ratchathani'),
    ('52019', 'G83641436', '[UPC] Lotus Payao'),
    ('55046', 'G83641439', '[UPC] Big C Phangnga'),
    ('53002', 'G83641445', '[UPC] Big C Udon Thani'),
    ('53049', 'G83641452', '[UPC] Robinson Chaiyapum'),
    ('55005', 'G83641456', '[UPC] Lotus Surat'),
    ('53026', 'G83641459', '[UPC] Fairy Plaza'),
    ('53030', 'G83641460', '[UPC] Big C Roi Et'),
    ('53029', 'G83641470', '[UPC] Serm Thai Complex'),
    ('53010', 'G83641493', '[UPC] Surin Plaza'),
    ('75012', 'G83641496', '[UPC] Vogue Krabi'),
    ('52042', 'G83641500', '[UPC] Uttaradit'),
    ('52005', 'G83641522', '[UPC] Big C Chiang Mai'),
    ('52010', 'G83641556', '[UPC] CentralPlaza Phitsanulok'),
    ('53958', 'G83641558', '[UPC] Big C Khon Kaen'),
    ('52031', 'G83641561', '[UPC] CentralPlaza Lampang'),
    ('52023', 'G83641567', '[UPC] Phare'),
    ('52902', 'G83641597', '[UPC] Big C Chiang Mai 2'),
    ('55906', 'G83641599', '[UPC] Big C Satun'),
    ('52942', 'G83641600', '[UPC] Big C Chiang Rai'),
    ('52943', 'G83641629', '[UPC] Big C Lampang'),
    ('52048', 'G83641637', '[UPC] Lotus Nan'),
    ('53003', 'G83642794', '[UPC] Taweekit 2'),
    ('52018', 'G83642804', '[UPC] Robinson Kamphaeng Phetch'),
    ('52040', 'G83642811', '[UPC] Big C Phitsanulok'),
    ('54039', 'G83642818', '[UPC] Lotus Nakhon Nayok'),
    ('51434', 'G83642823', '[UPC] Sukhumvit 15'),
    ('53036', 'G83642827', '[UPC] Robinson Mukdahan'),
    ('52032', 'G83642841', '[UPC] Lotus Phitsanulok'),
    ('53011', 'G83642846', '[UPC] Kalasin Plaza'),
    ('54044', 'G83642851', '[UPC] Robinson Chachoengsao'),
    ('54013', 'G83642857', '[UPC] Big C Chachoengsao'),
    ('54045', 'G83642863', '[UPC] Robinson Pranchinburi'),
    ('54038', 'G83642867', '[UPC] Big C Si Maha Phot'),
    ('53006', 'G83642875', '[UPC] Lotus That Bo'),
    ('54019', 'G83642882', '[UPC] Big C Sa Kaeo'),
    ('52033', 'G83642894', '[UPC] Happy Plaza'),
    ('52901', 'G83642941', '[UPC] Big C Kamphaeng Petch'),
    ('53022', 'GS2403010', '[UPC] Central Khon Kaen'),
    ('52037', 'GV9426134', '[UPC] Central Chiang Mai'),
    ('52002', 'GV9426214', '[UPC] Central Chiang Rai'),
    ('55008', 'GV9426218', '[UPC] Jungceylon'),
    ('53031', 'GV9426272', '[UPC] Central Ubon'),
    ('55012', 'GV9426274', '[UPC] Central Phuket'),
    ('53012', 'GV9426324', '[UPC] Central Udon'),
    ('53955', 'GV9426344', '[UPC] Lotus Nong Khai'),
    ('51506', 'GV9426510', '[UPC] Imperial Samrong')
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
    ('54023', 'FM1646055', '[BKK] CentralPlaza Chonburi'),
    ('51439', 'G83637875', '[BKK] Robinson Ladkrabang'),
    ('51938', 'G83637941', '[BKK] Lotus Lat Phrao'),
    ('51948', 'G83637946', '[BKK] Lotus Lak Si'),
    ('51435', 'G83638102', '[BKK] Homepro Suvarnabhumi'),
    ('51548', 'G83641193', '[BKK] Big C Bang Phi'),
    ('54027', 'G83641211', '[BKK] Big C Mahachai'),
    ('51960', 'G83641278', '[BKK] Big C Rama 2'),
    ('71205', 'G83641286', '[BKK] Infinite Mall'),
    ('51550', 'G83641368', '[BKK] Big C Susawat'),
    ('54004', 'G83641447', '[BKK] Big C Pattaya'),
    ('55044', 'G83641458', '[BKK] Huahin Bluport'),
    ('54094', 'G83641468', '[BKK] Central Nakornpathom'),
    ('54016', 'G83641479', '[BKK] Big C Chonburi 2'),
    ('51906', 'G83641520', '[BKK] Seacon Bang Khea'),
    ('54021', 'G83641525', '[BKK] Central Festival Pattaya B'),
    ('51546', 'G83641553', '[BKK] Lotus Bang Yai'),
    ('51427', 'G83641562', '[BKK] Paradise Park'),
    ('54012', 'G83641601', '[BKK] Big C Phetchaburi'),
    ('51518', 'G83641624', '[BKK] Central Rama3'),
    ('54022', 'G83641638', '[BKK] Central Mahachai'),
    ('51438', 'G83641642', '[BKK] Central Pinklao'),
    ('51407', 'G83641657', '[BKK] The mall 6'),
    ('51968', 'G83641668', '[BKK] Lotus Rama 4'),
    ('51524', 'G83641669', '[BKK] Lotus Charan Sanit Wong'),
    ('54011', 'G83642797', '[BKK] CentralPlaza Ayutthaya'),
    ('54005', 'G83642803', '[BKK] CentralPlaza Sriracha'),
    ('51534', 'G83642821', '[BKK] Big C Bangpakok'),
    ('54018', 'G83642825', '[BKK] Big C Ayutthaya'),
    ('54945', 'G83642833', '[BKK] Lotus Suphan Buri'),
    ('51425', 'G83642854', '[BKK] CentralPlaza Chaeng Wattana'),
    ('51132', 'G83642856', '[BKK] Big C Lopburi'),
    ('74023', 'G83642859', '[BKK] Kanokkan'),
    ('51542', 'G83642861', '[BKK] Supreme Complex'),
    ('53947', 'G83642862', '[BKK] Big C Rayong'),
    ('51418', 'G83642864', '[BKK] Lotus Rangsit Klong 7'),
    ('54029', 'G83642866', '[BKK] Harbor Mall'),
    ('51431', 'G83642873', '[BKK] Mega Bang Na'),
    ('51430', 'G83642878', '[BKK] Central Rama 9'),
    ('54007', 'G83642892', '[BKK] Lotus North Pattaya'),
    ('51905', 'G83642893', '[BKK] Central Rama2'),
    ('54046', 'G83642895', '[BKK] CentralPlaza Rayong'),
    ('51530', 'G83642896', '[BKK] Big C Pectkasem'),
    ('51508', 'G83642911', '[BKK] Tha Phrachan'),
    ('54040', 'G83642913', '[BKK] Robinson Suphan Buri'),
    ('51419', 'G83642935', '[BKK] Lotus Navanakorn'),
    ('51517', 'G83642939', '[BKK] Lotus Salaya'),
    ('51535', 'G83642950', '[BKK] Big C Suwinthawong'),
    ('51426', 'GV9426178', '[BKK] Big C Ratchadamri'),
    ('55001', 'GV9426180', '[BKK] HuaHin Market'),
    ('51403', 'GV9426236', '[BKK] Future Park'),
    ('51436', 'GV9426254', '[BKK] CentralPlaza Westgate'),
    ('51944', 'GV9426304', '[BKK] MBK'),
    ('51428', 'GV9426306', '[BKK] MBK 2'),
    ('51404', 'GV9426484', '[BKK] Fashion Island'),
    ('52003', 'GV9426486', '[BKK] Ayutthaya Park'),
    ('52007', 'G83637755', '[UPC] Lotus Chiang Mai'),
    ('55901', 'G83637818', '[UPC] Robinson Trang'),
    ('52036', 'G83637892', '[UPC] Lotus Ruam Chok'),
    ('52017', 'G83637901', '[UPC] Lotus Maesot'),
    ('55036', 'G83638059', '[UPC] Big C Trang'),
    ('53009', 'G83638068', '[UPC] The Mall Korat'),
    ('52098', 'G83638146', '[UPC] Chaing Mai Destination'),
    ('53037', 'G83638186', '[UPC] Asawann Nong Khai'),
    ('53023', 'G83638192', '[UPC] TOPS Plaza Phol'),
    ('52043', 'G83638225', '[UPC] Big C Phetchabun'),
    ('53021', 'G83638232', '[UPC] Lotus Udon Thani'),
    ('53032', 'G83638235', '[UPC] Robinson Sakon Nakhon'),
    ('55035', 'G83641333', '[UPC] Central Hatyai'),
    ('55018', 'G83641345', '[UPC] Lotus Phatthalung'),
    ('55042', 'G83641349', '[UPC] Lotus Songkhla'),
    ('55030', 'G83641374', '[UPC] Central Suratthani'),
    ('55040', 'G83641389', '[UPC] Lotus Chana'),
    ('53953', 'G83641398', '[UPC] Big C Ubon Ratchathani'),
    ('55949', 'G83641412', '[UPC] Big C Suratthani'),
    ('55902', 'G83641413', '[UPC] Big C Nakhonsithammarat'),
    ('55033', 'G83641416', '[UPC] Lotus Wiangsa'),
    ('53047', 'G83641435', '[UPC] Lotus Ubol Ratchathani'),
    ('52019', 'G83641436', '[UPC] Lotus Payao'),
    ('55046', 'G83641439', '[UPC] Big C Phangnga'),
    ('53002', 'G83641445', '[UPC] Big C Udon Thani'),
    ('53049', 'G83641452', '[UPC] Robinson Chaiyapum'),
    ('55005', 'G83641456', '[UPC] Lotus Surat'),
    ('53026', 'G83641459', '[UPC] Fairy Plaza'),
    ('53030', 'G83641460', '[UPC] Big C Roi Et'),
    ('53029', 'G83641470', '[UPC] Serm Thai Complex'),
    ('53010', 'G83641493', '[UPC] Surin Plaza'),
    ('75012', 'G83641496', '[UPC] Vogue Krabi'),
    ('52042', 'G83641500', '[UPC] Uttaradit'),
    ('52005', 'G83641522', '[UPC] Big C Chiang Mai'),
    ('52010', 'G83641556', '[UPC] CentralPlaza Phitsanulok'),
    ('53958', 'G83641558', '[UPC] Big C Khon Kaen'),
    ('52031', 'G83641561', '[UPC] CentralPlaza Lampang'),
    ('52023', 'G83641567', '[UPC] Phare'),
    ('52902', 'G83641597', '[UPC] Big C Chiang Mai 2'),
    ('55906', 'G83641599', '[UPC] Big C Satun'),
    ('52942', 'G83641600', '[UPC] Big C Chiang Rai'),
    ('52943', 'G83641629', '[UPC] Big C Lampang'),
    ('52048', 'G83641637', '[UPC] Lotus Nan'),
    ('53003', 'G83642794', '[UPC] Taweekit 2'),
    ('52018', 'G83642804', '[UPC] Robinson Kamphaeng Phetch'),
    ('52040', 'G83642811', '[UPC] Big C Phitsanulok'),
    ('54039', 'G83642818', '[UPC] Lotus Nakhon Nayok'),
    ('51434', 'G83642823', '[UPC] Sukhumvit 15'),
    ('53036', 'G83642827', '[UPC] Robinson Mukdahan'),
    ('52032', 'G83642841', '[UPC] Lotus Phitsanulok'),
    ('53011', 'G83642846', '[UPC] Kalasin Plaza'),
    ('54044', 'G83642851', '[UPC] Robinson Chachoengsao'),
    ('54013', 'G83642857', '[UPC] Big C Chachoengsao'),
    ('54045', 'G83642863', '[UPC] Robinson Pranchinburi'),
    ('54038', 'G83642867', '[UPC] Big C Si Maha Phot'),
    ('53006', 'G83642875', '[UPC] Lotus That Bo'),
    ('54019', 'G83642882', '[UPC] Big C Sa Kaeo'),
    ('52033', 'G83642894', '[UPC] Happy Plaza'),
    ('52901', 'G83642941', '[UPC] Big C Kamphaeng Petch'),
    ('53022', 'GS2403010', '[UPC] Central Khon Kaen'),
    ('52037', 'GV9426134', '[UPC] Central Chiang Mai'),
    ('52002', 'GV9426214', '[UPC] Central Chiang Rai'),
    ('55008', 'GV9426218', '[UPC] Jungceylon'),
    ('53031', 'GV9426272', '[UPC] Central Ubon'),
    ('55012', 'GV9426274', '[UPC] Central Phuket'),
    ('53012', 'GV9426324', '[UPC] Central Udon'),
    ('53955', 'GV9426344', '[UPC] Lotus Nong Khai'),
    ('51506', 'GV9426510', '[UPC] Imperial Samrong')
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
