-- ============================================================================
-- ตรวจและล้าง "ต้องซ่อมกล้อง" (camera_issue) ที่ค้างมาจากสมัย Survey — 2026-10-12
-- รันใน Supabase SQL Editor ทีละขั้น (เลือกเฉพาะขั้นนั้นแล้วกด Run)
-- ขั้นที่แก้ข้อมูล (3, 4) ถูกปิดไว้ด้วย /* */ — กด Run ทั้งไฟล์จะไม่แก้อะไรนอกจากสร้างตารางสำรอง
-- จะใช้ขั้น 3/4 ให้ลบบรรทัด /* และ */ ของขั้นนั้นออกก่อน
--
-- ทำไมต้องตรวจ: migration 024 ตั้ง camera_issue = true ให้ทุกสาขาที่เป็น Partial
-- ณ วันที่ 11 ต.ค. แต่หลายสาขาเป็น Partial มาตั้งแต่ Survey ด้วยเหตุผลอื่น
-- (เช่น "ยังไม่ลงทะเบียน iVMS" ซึ่งตอนนี้ sync เจอแล้ว) จึงขึ้น "ต้องซ่อมกล้อง"
-- และนับเป็น Repair (ประแจเหลือง) ทั้งที่กล้องอาจดูได้ปกติ
--
-- ขั้น 1 อ่านอย่างเดียว · ขั้น 2 สำรองข้อมูล · ขั้น 3 ล้างเฉพาะรหัสที่ทีมยืนยัน
-- ขั้น 4 (ไม่บังคับ) ล้างสาเหตุเก่า "Device Not Registered" ของสาขาที่ sync เจอแล้ว
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ขั้น 1 — ดูรายชื่อ (อ่านอย่างเดียว ไม่แก้อะไร)
-- คอลัมน์ suggest: "ล้างได้" = ไม่มีใบงานเปิด และเหตุผลเดิมไม่ใช่เรื่องกล้อง
--                  "ตรวจก่อน" = ต้องให้คนเช็กกล้องจริง (เปิดดูใน iVMS)
-- ---------------------------------------------------------------------------
with latest_note as (
  select distinct on (store_id) store_id, note, changed_at
  from public.recovery_stage_history
  where note is not null and btrim(note) <> ''
  order by store_id, changed_at desc
),
open_tickets as (
  select store_id, count(*) as n, string_agg(distinct issue_type, ', ') as types
  from public.incident_tickets
  where status in ('Open', 'Assigned', 'In Progress', 'Waiting Parts')
  group by store_id
)
select
  s.store_code,
  s.store_name,
  s.zone,
  m.state                         as dvr_state,
  to_char(m.last_checked_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI') as last_sync,
  s.overall_status,
  s.recovery_status,
  coalesce(n.note, s.cause)       as last_remark,
  s.recovery_notes,
  coalesce(t.n, 0)                as open_tickets,
  t.types                         as ticket_types,
  case
    when coalesce(t.n, 0) > 0 then 'ตรวจก่อน (มีใบงาน)'
    when s.recovery_status = 'Device Not Registered'
      or coalesce(n.note, s.cause, '') ilike '%regist%' then 'ล้างได้ (เหตุผลเดิม = ยังไม่ลงทะเบียน)'
    else 'ตรวจก่อน'
  end                             as suggest
from public.stores s
left join public.store_monitor m on m.store_id = s.id
left join latest_note n on n.store_id = s.id
left join open_tickets t on t.store_id = s.id
where s.camera_issue
order by suggest, s.store_code;


-- ---------------------------------------------------------------------------
-- ขั้น 2 — สำรองข้อมูลก่อนแก้ (รันครั้งเดียว ถ้ามีตารางนี้อยู่แล้วจะข้าม)
-- ---------------------------------------------------------------------------
create table if not exists public.backup_camera_issue_20261012 as
select id, store_code, overall_status, camera_issue, camera_issue_at, recovery_status, now() as backed_up_at
from public.stores
where camera_issue or recovery_status = 'Device Not Registered';

select count(*) as backed_up_rows from public.backup_camera_issue_20261012;


-- ---------------------------------------------------------------------------
-- ขั้น 3 — ล้าง "ต้องซ่อมกล้อง" เฉพาะรหัสที่ทีมยืนยันแล้วว่ากล้องดูได้
-- ใส่รหัสในวงเล็บแทนตัวอย่าง แล้วรันทั้งก้อน
-- ตั้ง overall_status = 'Healthy' → trigger ของ migration 024 ล้าง camera_issue ให้เอง
-- เฉพาะสาขาที่ DVR Online อยู่ (สาขาที่ DVR Offline ไม่แตะ ปล่อยให้ sync จัดการ)
-- ---------------------------------------------------------------------------
/*  ← ลบบรรทัดนี้เพื่อเปิดใช้ขั้น 3
update public.stores s
set overall_status = 'Healthy'
from public.store_monitor m
where m.store_id = s.id
  and m.state = 'Online'
  and s.camera_issue
  and s.store_code in ('51132', '51403')   -- ← แก้เป็นรายชื่อจริง
returning s.store_code, s.store_name, s.overall_status, s.camera_issue;
*/  -- ← และบรรทัดนี้


-- ---------------------------------------------------------------------------
-- ขั้น 4 (ไม่บังคับ) — ล้างสาเหตุเก่า "Device Not Registered" ของสาขาที่ iVMS sync
-- เจอแล้ว (แปลว่าลงทะเบียนแล้วจริง) ข้อความ Remark "Device never registered to
-- Hik-Connect / iVMS" ในรายการสาขาจะหายไป ไม่กระทบสถานะ DVR หรือใบงาน
-- ---------------------------------------------------------------------------
/*  ← ลบบรรทัดนี้เพื่อเปิดใช้ขั้น 4
update public.stores s
set recovery_status = null
from public.store_monitor m
where m.store_id = s.id
  and m.last_checked_at is not null
  and s.recovery_status = 'Device Not Registered'
returning s.store_code, s.store_name;
*/  -- ← และบรรทัดนี้


-- ---------------------------------------------------------------------------
-- ย้อนกลับ (ถ้าต้องการ) — คืนค่าจากตารางสำรอง
-- ---------------------------------------------------------------------------
-- update public.stores s
-- set overall_status = b.overall_status, camera_issue = b.camera_issue,
--     camera_issue_at = b.camera_issue_at, recovery_status = b.recovery_status
-- from public.backup_camera_issue_20261012 b
-- where b.id = s.id;
