# PLAN — Installation Project

Status: Planning done — awaiting `/design`
Repo checked: batathai/bata-cctv-portal @ 80232ce (2026-09-30)

## Goal
เพิ่มโมดูล "Installation Project" ใน BATA CCTV Command Center เพื่อติดตามความคืบหน้าการติดตั้งกล้อง CCTV ใหม่รายสาขา แบบบอร์ด Kanban ตั้งแต่เปิดงาน Top 20 สาขาแรก ไปจนครบ 194 สาขา แทนการติดตามผ่านแชท/Excel แยกกัน

## Users and roles
ระบบปัจจุบันเป็น **single-role deployment** (`src/lib/rbac.ts`): มีแต่ role `hq_admin` (ทีม IT/Support) ที่ล็อกอินได้ ทุกคนสิทธิ์เท่ากันทั้งดูและแก้ไขทุกสาขา — ตรงกับคำตอบ "ย้ายการ์ด/แก้สถานะได้เฉพาะทีม IT/Support"

- **hq_admin (ทีม IT/Support):** ย้ายการ์ด แก้สถานะ ติ๊ก Verify Checklist ทุกข้อ เปิด/ปิดงาน — สิทธิ์เดียวที่มีในระบบตอนนี้
- **DM / ช่าง / RM:** ไม่ใช่ผู้ใช้ระบบ (ไม่มี login) — สื่อสารผ่านช่องทางเดิม (แชท/อีเมล) เหมือนที่ทำอยู่ ระบบเก็บ "ชื่อ DM" เป็นข้อมูลข้อความ ไม่ใช่บัญชีผู้ใช้

**หมายเหตุ:** DB ยังมี RLS scaffolding สำหรับ `bkk_manager`/`country_manager`/`supplier` ค้างอยู่ (migrations 004, 008, 012) เผื่ออนาคตเปิดให้ login หลาย role — Installation Project จะตาม pattern เดิม (เขียนได้เฉพาะ hq_admin ผ่าน policy คล้าย `vendor_quotations: hq_admin write`) โดยไม่รื้อ scaffolding นี้ทิ้ง

## Scope
**อยู่ในรอบนี้:**
- บอร์ด Kanban 8 ขั้น (เพิ่มขั้นงบประมาณตามที่ตอบ):
  Floor Plan → Layout & จุดติดตั้ง → **ขอใบเสนอราคา/อนุมัติงบ** → ขออนุญาตห้าง → นัดติดตั้ง → ติดตั้ง → Verify → Completed
- หน้า Timeline (Gantt) ต่อสาขา
- หน้ารายละเอียดการ์ด + Verify Checklist 12 ข้อ → ครบ 12/12 เปลี่ยนเป็น Completed อัตโนมัติ
- หน้า Rollout ภาพรวม 194 สาขา แบ่งตาม Wave และเขต
- Export Excel (Summary + Timeline 2 ชีต) และ PDF (Executive Summary, ใบส่งมอบงานรายสาขา)
- ผูกกับตาราง `stores` เดิม, ใช้ตาราง `vendor_quotations` เดิมสำหรับขั้นงบประมาณ (ไม่สร้างซ้ำ)

**นอกขอบเขตรอบนี้:**
- สถานะ Online/Offline อัตโนมัติแบบเรียลไทม์ (ยังไม่มี API Hikvision — ใช้ยืนยันมือในขั้น Verify)
- แจ้งเตือนอัตโนมัติผ่านอีเมล/LINE
- เปิด login ให้ role อื่นนอกจาก hq_admin (ทำได้ในอนาคตถ้าต้องการ เพราะ RLS scaffolding มีอยู่แล้ว)
- Bulk actions เปิดงานทีละ Wave จาก Excel
- แอปมือถือแยกสำหรับช่าง

## Requirements
- **R1** ตาราง `installation_projects` (ใหม่) 1 แถวต่อ 1 สาขา, FK `store_id → stores.id`: `wave`, `current_stage`, `permit_submitted_at`, `d1_date`, `d2_date`, `verify_checked` (jsonb หรือ int array 12 ช่อง), `verify_total`, `completed_at`
- **R2** ตาราง `installation_stage_history` (ใหม่) — append-only, รูปแบบเดียวกับ `recovery_stage_history` (migration 012): `store_id`, `from_stage`, `to_stage`, `note`, `changed_at`
- **R3** ขั้น "ขอใบเสนอราคา/อนุมัติงบ" **อ่าน/เขียนจากตาราง `vendor_quotations` เดิม** — การ์ดย้ายเข้าขั้นถัดไปได้เมื่อมีแถวที่ `approval_status = 'Approved'`
- **R4** หน้าบอร์ด: ลากการ์ดย้ายคอลัมน์ (hq_admin เท่านั้น ตาม pattern เดิมของระบบ) พร้อม filter ตาม Wave/ภาค/เขต
- **R5** หน้ารายละเอียดการ์ด: เช็คลิสต์ตามขั้นปัจจุบัน, จุดติดตั้ง 3 จุด, ไฟล์แนบ (ใช้ pattern เดียวกับ migration 009 attachments_storage), Activity log จาก R2
- **R6** Verify Checklist 12 ข้อ (กลุ่ม A หน้างาน 6 / B ส่วนกลาง 3 / C ติดตามหลังปิดงาน 3) — ครบ 12/12 → `current_stage = 'Completed'` อัตโนมัติ; ถ้าหลุด Offline ระหว่าง 72 ชม. ต้องมีทางล้างข้อ 10–11 และย้อนกลับไปขั้น "ติดตั้ง" พร้อม log ใน R2
- **R7** Export Excel 2 ชีต (Summary + Timeline) ใช้สูตรจริง ไม่ hardcode
- **R8** Export PDF: Executive Summary 1 หน้า, ใบส่งมอบงานรายสาขา
- **R9** หน้า Rollout: กริด 194 ช่อง + สรุปจำนวนต่อขั้น + จำนวนสาขาต่อเขต (511/512/513/550/520/530/540/560)
- **R10** RLS ตาราง `installation_projects`/`installation_stage_history`: read/write = `hq_admin` เท่านั้น (ตาม policy pattern ของ `vendor_quotations`) — พร้อมโครงไว้ขยายเป็น zone-scoped read ให้ `bkk_manager`/`country_manager` ในอนาคตถ้าต้องการ

## Data
- ใช้ตาราง `stores` เดิม — **ต้องเคลียร์ก่อน implement:** รหัสสาขาในแบบแปลนไม่ตรงกับรหัสจริงอย่างน้อย 2 สาขา (Fashion Island 51401→51404, Central Udon 53031→53012)
- `vendor_quotations` มีอยู่แล้ว ใช้ต่อได้เลยสำหรับขั้นงบประมาณ
- ไฟล์แนบ: เช็ค migration 009 (`attachments_storage`) ว่ารองรับ bucket/policy สำหรับไฟล์ Installation ได้เลย หรือต้องเพิ่ม
- สถานะ Online/Offline: ยังไม่มีแหล่งข้อมูลอัตโนมัติ — ยืนยันมือในขั้น Verify

## Risks and open questions
1. **[เปิดอยู่]** ตาราง `attachments_storage` (migration 009) รองรับไฟล์ประเภท Installation (Floor Plan, รูปหน้างาน Verify) ได้เลยหรือต้องขยาย — ต้องอ่านไฟล์ migration ก่อนเข้า `/design`
2. **[เปิดอยู่]** โควตา Supabase Storage สำหรับรูปหน้างาน ~1,200+ ไฟล์ (194 สาขา × 6 ข้อ Verify กลุ่ม A) ยังไม่ได้ประเมิน
3. Push ขึ้น GitHub จาก session นี้ยังทำไม่ได้ (ต้องติดตั้ง Claude GitHub App ให้ org หรือเชื่อม GitHub ใหม่ใน claude.ai settings) — ระหว่างนี้ commit/push ต้องทำจากเครื่องคุณเอง

## Milestones
1. เคลียร์ open question เรื่อง attachments_storage
2. `/design` — schema (installation_projects, installation_stage_history), หน้าจอ (ต่อยอด Canvas เดิม + เพิ่มคอลัมน์งบประมาณ), RLS
3. USER APPROVAL
4. `/implement`
5. `/test`, `/review`, `/security`, `/audit`
6. `/release` (Wave 1 ก่อน)
7. `/document`
