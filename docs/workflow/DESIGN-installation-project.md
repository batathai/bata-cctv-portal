# DESIGN — Installation Project

Status: Design ready — awaiting USER APPROVAL
Base plan: `docs/workflow/PLAN-installation-project.md`
Repo checked: `batathai/bata-cctv-portal` @ `80232ce` (main, 2026-09-30)

## 1. Screens / UI

ต่อยอด Canvas mockup เดิม (`Installation Board – BATA CCTV`,
`claude.ai/artifact/AEQyPcAxwoG4Wc1fykbAV9`) โดยปรับให้ตรงกับข้อมูล/สิทธิ์จริง:

| Mockup artboard | หน้าจริงในแอป | สิ่งที่ต้องปรับจาก mockup |
|---|---|---|
| `Main.dc.html` | `/installation` (Kanban board) | 8 คอลัมน์คงเดิม; เพิ่ม badge "รออนุมัติงบ" อ่านจาก `vendor_quotations.approval_status` แทนข้อมูลสมมติ; ปุ่ม Export ยิง `exportInstallationExcel()` / `exportInstallationPdf()` จริง |
| `Timeline.dc.html` | `/installation/timeline` (Gantt) | แกนเวลาใช้ `d1_date`/`d2_date`/`completed_at` จริงจาก `installation_projects` แทนตัวเลขสมมติ |
| `Detail.dc.html` | `/installation/[code]` | stepper 8 ขั้นผูกกับ `current_stage`; เช็คลิสต์ผูกกับ `verify_checked`; แนบไฟล์ใช้ตาราง `attachments` เดิม (bucket เดิม, เพิ่ม `folder` หมวดใหม่); activity log อ่านจาก `installation_stage_history` |
| `Rollout.dc.html` | `/installation/rollout` | กริด 194 ช่องผูกกับ `stores` + `installation_projects` จริง; สรุปตาม wave/เขต |
| `Verify.dc.html` | ฝังในหน้า `/installation/[code]` เป็น section "Verify Checklist" (ไม่แยกหน้า) | 12 ข้อ/3 กลุ่มคงเดิม; เพิ่มปุ่ม "ล้างข้อ 10–11 (Offline ใน 72 ชม.)" เฉพาะช่วง 72 ชม. หลัง Completed |

ทุกหน้าใหม่เป็น route ภายใต้ `(portal)` group เดิม, ใช้ `Card`/`SectionTitle`/`Badge`
component เดิม, สีตาม BATA brand เดิม (แดง #D71920) — ไม่สร้าง design system ใหม่

Sidebar (`src/components/layout/Sidebar.tsx`): เพิ่มรายการที่ 6 "Installation
Project" ต่อจาก "Reports"

## 2. Data model

### 2.1 ตารางใหม่ — `installation_projects` (1 แถวต่อ 1 สาขา)

```sql
create table if not exists public.installation_projects (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade unique,
  wave text not null,                         -- e.g. 'Wave 1: Top 20'
  current_stage text not null default 'Floor Plan'
    check (current_stage in (
      'Floor Plan', 'Layout', 'Quotation', 'Permit',
      'Scheduled', 'Installing', 'Verify', 'Completed'
    )),
  approved_quotation_id uuid references public.vendor_quotations(id),
  permit_submitted_at date,
  d1_date date,                               -- วันนัดติดตั้ง (scheduled)
  d2_date date,                                -- วันติดตั้งจริง (actual)
  verify_checked jsonb not null default '[]', -- array ของ item key ที่ติ๊กแล้ว เช่น ["A1","A2",...]
  verify_total int not null default 0,        -- 0-12, อัปเดตพร้อม verify_checked
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_install_projects_stage on public.installation_projects(current_stage);
create index if not exists idx_install_projects_wave on public.installation_projects(wave);

create trigger trg_install_projects_updated_at before update on public.installation_projects
  for each row execute procedure public.set_updated_at();
```

**หมายเหตุ — สมมติฐานที่ต้องยืนยัน:** `d1_date`/`d2_date` ตีความว่า
D1 = วันนัดติดตั้ง, D2 = วันติดตั้งจริง (ตรงกับคอลัมน์ในแบบ Timeline mockup)
ถ้าจริง ๆ หมายถึงอย่างอื่น (เช่น D1/D2 = ช่างชุดที่ 1/2) แจ้งก่อน `/implement`

### 2.2 ตารางใหม่ — `installation_stage_history` (append-only, ตาม pattern migration 012)

```sql
create table if not exists public.installation_stage_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  from_stage text,
  to_stage text not null
    check (to_stage in (
      'Floor Plan', 'Layout', 'Quotation', 'Permit',
      'Scheduled', 'Installing', 'Verify', 'Completed'
    )),
  note text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists idx_install_history_store on public.installation_stage_history(store_id, changed_at desc);
```

### 2.3 ตารางเดิมที่ใช้ต่อ (ไม่แก้ schema)

- **`vendor_quotations`** — ขั้น Quotation อ่าน/เขียนตรงนี้ ไม่สร้างตารางซ้ำ (R3)
  เงื่อนไขย้ายออกจากขั้น Quotation: มีแถว `store_id` เดียวกันที่ `approval_status = 'Approved'`
- **`work_order_batches`** — ใช้แทนแนวคิด "Wave" ได้ทันทีโดยไม่ต้องแก้ schema:
  สร้าง batch ใหม่ต่อ wave (เช่น `'Wave 1: Top 20 (Installation)'`) แล้วอ้างอิงชื่อ
  ผ่านคอลัมน์ `wave` (text) ข้างต้น — เลือกใช้ text แทน FK ตรง ๆ เพราะ
  `stores.batch_id` เป็น FK เดี่ยวที่ผูกกับ batch งานซ่อมอยู่แล้ว
  (ดู migration 017) การผูก FK ซ้อนจะชนกับของเดิม ถ้าต้องการ FK จริงจัง
  แนะนำแยกเป็น `installation_waves` ในรอบถัดไป — รอบนี้ใช้ text พอสำหรับ filter/group
- **`attachments`** — ต้อง**ขยาย** check constraint ของ `folder` (migration ใหม่)
  เพิ่ม 4 หมวด: `'Site Survey Photos'`, `'Permit Documents'`,
  `'Camera Install Photos'`, `'Verify Photos'` — bucket/Storage policy เดิม
  (migration 009) ใช้ต่อได้เลย ไม่ต้องสร้าง bucket ใหม่

### 2.4 Migration ไฟล์ใหม่: `supabase/migrations/020_installation_project.sql`

รวม 2.1 + 2.2 + ALTER ของ 2.3 (attachments.folder) + RLS (หัวข้อ 4) ไว้ไฟล์เดียว
(เลขถัดไปที่ว่าง ยืนยันแล้วจาก `ls supabase/migrations/` ล่าสุดคือ `019_survey_audit_fields.sql`)

## 3. Flow — stage transitions

| จาก | ไป | ใครกดได้ | เงื่อนไข |
|---|---|---|---|
| Floor Plan | Layout | hq_admin | ลากการ์ดเอง (manual) |
| Layout | Quotation | hq_admin | ลากการ์ดเอง |
| Quotation | Permit | hq_admin | **บล็อกจนกว่า** จะมีแถว `vendor_quotations` ของสาขานั้น `approval_status='Approved'` (R3) — ถ้ายังไม่อนุมัติ ระบบเตือนไม่ให้ลาก |
| Permit | Scheduled | hq_admin | ลากการ์ดเอง (ตั้งใจไม่บล็อกอัตโนมัติ เพราะยังไม่มี API ขออนุญาตห้าง — ยืนยันมือ) |
| Scheduled | Installing | hq_admin | ลากการ์ดเอง / หรือถึง `d1_date` |
| Installing | Verify | hq_admin | ลากการ์ดเอง |
| Verify | **Completed** | ระบบ (อัตโนมัติ) | `verify_total = 12` (ครบ 12/12) → auto-transition, เขียน `completed_at = now()`, log เข้า `installation_stage_history` |
| Completed | Installing (**ย้อนกลับ**) | hq_admin | เฉพาะภายใน 72 ชม. หลัง `completed_at`, เมื่อกดปุ่ม "ล้างข้อ 10–11" (สาขาหลุด Offline) — ล้าง 2 item ใน `verify_checked`, `verify_total -= 2`, `current_stage = 'Installing'`, log เหตุผลลงหมายเหตุ (R6) |

ทุกการเปลี่ยน stage (manual หรือ auto) เขียน 1 แถวใน `installation_stage_history`
เสมอ — นี่คือ activity log ที่ `/installation/[code]` แสดง

สิทธิ์: ทั้งหมด **hq_admin เท่านั้น** ที่ล็อกอินเข้าระบบได้ (`src/lib/rbac.ts`
เป็น single-role อยู่แล้ว — `canAccessRoute`/`canLogMaintenance` return true
เสมอ ไม่ต้องแก้โค้ด RBAC) DM/ช่าง/RM ไม่ใช่ผู้ใช้ระบบ ตามที่ระบุใน PLAN

## 4. RLS (migration 020)

```sql
alter table public.installation_projects enable row level security;
alter table public.installation_stage_history enable row level security;

create policy "installation_projects: hq_admin read" on public.installation_projects
  for select using ((select role from public.current_profile()) = 'hq_admin');
create policy "installation_projects: hq_admin write" on public.installation_projects
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
create policy "installation_projects: hq_admin update" on public.installation_projects
  for update using ((select role from public.current_profile()) = 'hq_admin');

create policy "installation_stage_history: hq_admin read" on public.installation_stage_history
  for select using ((select role from public.current_profile()) = 'hq_admin');
create policy "installation_stage_history: hq_admin insert" on public.installation_stage_history
  for insert with check ((select role from public.current_profile()) = 'hq_admin');
```

ตรงตาม R10 — เผื่อโครงไว้ขยายเป็น zone-scoped read ให้ `bkk_manager`/
`country_manager` ในอนาคต (แค่เปลี่ยน `using` clause เป็น `can_access_store()`
แบบ migration 004 ทำไว้กับตารางอื่น ไม่ต้องรื้อ table)

## 5. Files to touch

**ใหม่:**
- `supabase/migrations/020_installation_project.sql`
- `src/lib/installation.ts` — stage list + labels (Thai), checklist template
  (12 item: group A 6 / B 3 / C 3 พร้อม key เช่น `A1..A6, B1..B3, C1..C3`),
  helper `canAdvance(project, quotations)`, `isChecklistComplete()`,
  `getStageLabel()`
- `src/app/(portal)/installation/page.tsx` — Kanban board (pattern เดียวกับ
  `work-orders/page.tsx`: `useAppData()`, filter bar, grid การ์ด)
- `src/app/(portal)/installation/timeline/page.tsx` — Gantt view
- `src/app/(portal)/installation/rollout/page.tsx` — ภาพรวม 194 สาขา
- `src/app/(portal)/installation/[code]/page.tsx` — รายละเอียด + stepper +
  checklist + attachments + activity log (pattern เดียวกับ `recovery/[code]`)
- `src/lib/reports/exportInstallationExcel.ts` — client-side `xlsx` (ดูหัวข้อ 6)
- `src/lib/reports/exportInstallationPdf.ts` — `jsPDF`/`jspdf-autotable`
  (pattern เดียวกับ `exportPdf.ts` ที่มีอยู่: brand header/footer)

**แก้ไข:**
- `src/components/layout/Sidebar.tsx` — เพิ่มเมนู "Installation Project"
- `src/components/providers/AppDataProvider.tsx` — เพิ่ม state
  `installationProjects`, query จาก Supabase, ฟังก์ชัน `advanceStage()`,
  `updateVerifyChecklist()`, `resetVerifyItems()` (สำหรับ flow ย้อนกลับ 72 ชม.)
- `src/types/database.ts` — เพิ่ม type `InstallationProject`,
  `InstallationStageHistory`

## 6. Exports / reports

**ข้อค้นพบสำคัญจากการอ่านโค้ดจริง:** แอปตัวจริง export Excel ด้วย
`src/lib/reports/exportExcel.ts` ผ่าน npm package `xlsx` ฝั่ง client
(`XLSX.utils.json_to_sheet` + `XLSX.writeFile`) — **ไม่ใช่** แบบที่ทำ demo
ให้ดูก่อนหน้านี้ด้วย Python/`openpyxl` (สูตร Excel จริง + conditional
formatting) นั้นเป็นแค่ตัวอย่างภาพให้ดูรูปแบบหน้าตาเท่านั้น

**อนุมัติแล้ว (2026-09-30) — เลือก (ก):** ทำตาม pattern จริงของแอป (`xlsx`
client-side) เพื่อความสม่ำเสมอของโค้ดเบส ไม่มีสูตร Excel/conditional
formatting ในไฟล์ export จริง — **ปรับ R7 จาก "ใช้สูตรจริง" เป็น "คำนวณค่า
ที่ต้องใช้ (เช่น days elapsed) ด้วย JS ก่อนใส่ลงชีต ไม่ hardcode ค่าที่ควร
เป็นสูตร"** เพื่อให้ตรงกับสถาปัตยกรรม client-only ของระบบจริง (ไม่เพิ่ม
backend ใหม่)

**Sheet 1 — Summary:** 1 แถวต่อสาขา — store_code, store_name, region, zone,
wave, current_stage, quotation status, d1_date, d2_date, verify_total (x/12),
completed_at

**Sheet 2 — Timeline:** 1 แถวต่อสาขา — store_code, store_name, wave,
permit_submitted_at, d1_date, d2_date, completed_at, days elapsed (คำนวณ
ใน JS ก่อนใส่ cell ไม่ใช่สูตร Excel ถ้าเลือกทาง (ก))

**PDF:** Executive Summary (สรุปจำนวนต่อ stage + ต่อเขต, brand header/
footer แบบ `exportPdf.ts` เดิม) และใบส่งมอบงานรายสาขา (per-store handover
sheet, ใช้ `jspdf-autotable` เดิม)

## 7. Traceability (R1–R10)

| Req | ครอบคลุมใน |
|---|---|
| R1 | §2.1 ตาราง `installation_projects` |
| R2 | §2.2 ตาราง `installation_stage_history` |
| R3 | §2.3 (reuse `vendor_quotations`) + §3 (เงื่อนไขย้ายขั้น Quotation→Permit) |
| R4 | §1 หน้า `/installation` (filter bar ตาม wave/ภาค/เขต) + §3 (สิทธิ์ hq_admin) |
| R5 | §1 หน้า `/installation/[code]` (checklist, จุดติดตั้ง, attachments, activity log) |
| R6 | §2.1 (`verify_checked`/`verify_total`) + §3 (auto-complete + flow ย้อนกลับ 72 ชม.) |
| R7 | §6 — เลือกแนวทาง (ก) client-side `xlsx` ไม่มีสูตร (อนุมัติแล้ว 2026-09-30) |
| R8 | §6 PDF exports |
| R9 | §1 หน้า `/installation/rollout` |
| R10 | §4 RLS |

## 8. Design approved — 2026-09-30

ทั้ง 3 ข้อที่เปิดไว้ก่อนหน้านี้ได้รับคำตอบแล้ว:
1. `d1_date`/`d2_date` — ยืนยัน: D1 = วันนัดติดตั้ง, D2 = วันติดตั้งจริง ตามที่สมมติไว้
2. Export Excel — เลือก **(ก)** client-side `xlsx` ตาม pattern จริงของแอป (ไม่มีสูตร, ไม่เพิ่ม backend)
3. รหัสสาขาผิด (Fashion Island, Central Udon) — **ไม่บล็อก implement**: แก้เป็นงาน data-cleanup แยกทีหลัง เพราะข้อมูลสาขาเปลี่ยนแปลงตลอดเวลาอยู่แล้ว ไม่ใช่ one-time fix ก่อน seed

ดีไซน์นี้อนุมัติแล้ว พร้อมเข้า `/implement`

## 9. Amendment — 2026-10-05: ตัดขั้น "Floor Plan" และ "Layout" ออกถาวร

หลังจาก import ตาราง Wave 1 จริง (20 สาขา) เข้าระบบแล้วพบว่าทุกสาขาเริ่มที่ขั้น Scheduled/Installing/Verify เป็นต้นไปเสมอ — งาน Floor Plan และ Layout ทำเสร็จก่อนสาขาจะเข้าสู่การติดตามในระบบนี้แล้ว เจ้าของโปรเจกต์ยืนยันให้ตัดทั้ง 2 ขั้นออกจาก flow ถาวร (ไม่ใช่แค่ซ่อนในหน้าจอ):

**flow ใหม่ (6 ขั้น, เดิม 8 ขั้น):** Quotation → Permit → Scheduled → Installing → Verify → Completed

การเปลี่ยนแปลง:
- `supabase/migrations/021_installation_remove_floorplan_layout.sql` — ย้ายแถวที่ยังเป็น Floor Plan/Layout (ถ้ามี) ไป Quotation ก่อน แล้วแก้ check constraint + default ของ `current_stage`
- `src/lib/installation.ts` — `INSTALLATION_STAGES`/`INSTALLATION_STAGE_LABELS` เหลือ 6 ขั้น
- `src/types/database.ts` — `InstallationStage` union เหลือ 6 ค่า
- โปรเจกต์ใหม่ (`createInstallationProject`/`createInstallationProjectDb`) เริ่มที่ **Quotation** แทน Floor Plan
- `src/lib/mockData.ts`, หน้า Rollout (`STAGE_DOT`) ปรับให้ตรงกับ 6 ขั้น

ตารางในหัวข้อ 3 (Flow) และ SQL ในหัวข้อ 2.1/2.4 ด้านบนเป็น**บันทึกของดีไซน์ ณ วันที่อนุมัติ (2026-09-30)** — ไม่แก้ย้อนหลัง เพื่อรักษาประวัติไว้ว่าดีไซน์เดิมอนุมัติอะไร การเปลี่ยนแปลงจริงให้ยึดหัวข้อนี้แทน
