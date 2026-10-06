# CLAUDE.md

คู่มือบริบทโปรเจกต์ **BATA CCTV Command Center** สำหรับ Claude หรือคนที่เข้ามาดูแลโค้ดต่อ
อ่านไฟล์นี้ก่อนแก้โค้ด แล้วอ่าน `docs/workflow/STATUS.md` เพื่อดูว่างานล่าสุดค้างอยู่ตรงไหน

> หมายเหตุ (2026-10-06): ไฟล์นี้เดิมเป็นเนื้อหาของอีกโปรเจกต์หนึ่ง (ระบบ "BATA Store — ส่ง Payslip")
> ที่ถูก copy มาผิด repo จึงเขียนใหม่ทั้งหมดให้ตรงกับระบบนี้

## 1. ภาพรวม

พอร์ทัลกลางของ BATA Thailand สำหรับดูแลกล้องวงจรปิดของสาขา ได้แก่ ทะเบียนอุปกรณ์ (DVR/กล้อง),
สถานะออนไลน์และคะแนนสุขภาพ, งานซ่อม (Work Orders), การสำรวจ (Survey), รายงาน
และงานติดตั้งกล้องใหม่ (Installation Project) ซึ่งเริ่ม Wave 1 ที่ 20 สาขาจากเป้าหมาย 194 สาขา

ผู้ใช้มีกลุ่มเดียวคือทีม IT ของ Bata (role `hq_admin`) โดยทุกคนเห็นทุกเขตและทุกสาขา
DM/RM/ซัพพลายเออร์ **ไม่ได้ล็อกอิน** เป็นเพียงข้อมูลติดต่อเท่านั้น (ดู `src/lib/rbac.ts`)

## 2. Tech stack

- Next.js 15 (App Router) · React 18 · TypeScript · Tailwind CSS
- Supabase (Postgres + Auth + Storage) เรียกจากฝั่ง client ผ่าน `src/lib/supabase/`
- Deploy บน Cloudflare Pages ผ่าน `@cloudflare/next-on-pages` (`wrangler.toml`)
- Export: `xlsx` (Excel ฝั่ง client, `json_to_sheet`, ไม่มีสูตร), `jspdf` + `jspdf-autotable` (PDF)
- กราฟ: `recharts` · ไอคอน: `lucide-react`

## 3. โครงสร้างหลัก

```
src/app/(portal)/
  dashboard/                    ภาพรวม
  work-orders/                  แท็บ "งานซ่อม (Repair Jobs)"
  work-orders/[batchId]/        รายละเอียด Job ซ่อม
  work-orders/installation/     แท็บ "ติดตั้งกล้องใหม่" — Kanban 6 ขั้น
    [code]/                     รายละเอียดสาขา: stepper, ใบเสนอราคา, Verify Checklist 12 ข้อ, ไฟล์แนบ
    timeline/                   Gantt ตามวัน D1/D2 + เส้น "วันนี้" + แก้วันที่ inline
    rollout/                    กริด 194 สาขา + สรุปตามขั้น/เขต
  assets/  survey/  reports/  recovery/  status/
src/lib/
  data.ts                       ชั้นอ่านข้อมูล (Supabase → fallback เป็น mock)
  *Write.ts                     ชั้นเขียนข้อมูลแยกตามโดเมน (installationWrite, workOrderBatchWrite, ...)
  installation.ts               ขั้นตอน, Verify Checklist, กฎการเลื่อนขั้น
  recovery.ts                   regionFromZone()/getAreaLabel() — ใช้ร่วมหลายหน้า
  reports/                      export Excel/PDF
src/components/providers/AppDataProvider.tsx   state กลาง + action ทั้งหมดที่หน้าจอเรียก
supabase/migrations/            migration เรียงเลข (ล่าสุด 021)
scripts/                        สคริปต์จัดการข้อมูลจริง (Node .mjs)
docs/workflow/                  PLAN / DESIGN / STATUS ของฟีเจอร์ที่กำลังทำ
```

## 4. เรื่องที่ต้องรู้ก่อนแก้โค้ด

1. **Demo mode** — ถ้าไม่ได้ตั้ง `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
   แอปจะใช้ mock data จาก `src/lib/mockData.ts` และถ้า query Supabase พังก็จะ fallback เป็น mock
   เหมือนกัน ระวังเรื่องนี้เวลาตรวจตัวเลข เพราะ error อาจถูกกลบด้วย mock data
2. **Migration รันมือ** — ไม่มีระบบรัน migration อัตโนมัติ เจ้าของโปรเจกต์ต้อง copy ไปรันใน
   Supabase SQL Editor เอง ให้บันทึกใน STATUS.md เสมอว่า migration ไหนรันแล้วหรือยัง
   (ไฟล์ 016 หายไปจาก repo)
3. **สคริปต์แก้ข้อมูลจริง** ใน `scripts/` ใช้รูปแบบเดียวกันทุกตัว: รันแบบ dry-run ก่อน
   แล้วค่อยรัน `--confirm` ซึ่งจะ backup ลงโฟลเดอร์ `backups/` ก่อนเขียนทุกครั้ง สคริปต์ใหม่ควรทำตามแบบนี้
4. **Installation Project** มีตาราง `installation_projects` + `installation_stage_history`
   - ขั้นตอน 6 ขั้น: Quotation → Permit → Scheduled → Installing → Verify → Completed
     (ตัด Floor Plan/Layout ออกถาวรตั้งแต่ migration 021)
   - `d1_date` = วันนัดติดตั้ง, `d2_date` = วันติดตั้งจริง
   - การผ่านขั้น Quotation ต้องผูก `approved_quotation_id` ไว้ชัดเจน เพราะตาราง `vendor_quotations`
     ใช้ร่วมกับงานซ่อม จึงห้ามเดาจาก "มีใบเสนอราคา Approved อยู่แล้ว"
   - Wave เก็บเป็นคอลัมน์ข้อความ `wave` ไม่ได้ผูก FK กับ `stores.batch_id` ซึ่งเป็นของงานซ่อม
5. **รหัสเขต**: BKK = 511/512/513/550, UPC = 520/530/540/560 ให้ใช้ฟังก์ชันใน `src/lib/recovery.ts`
   อย่าเขียน mapping ซ้ำในที่อื่น
6. **PDF ภาษาไทยยังไม่แสดง** — jsPDF ใช้ฟอนต์ตั้งต้นที่ไม่มีอักษรไทย ปัญหานี้มีทั้งใน
   `exportPdf.ts` และ `exportInstallationPdf.ts` และต้องฝังฟอนต์ TTF ภาษาไทยจึงจะแก้ได้
7. **Cloudflare Pages / edge**: หน้าที่เป็น dynamic route ต้องมี `export const runtime = "edge"`
   ไม่งั้น build บน Cloudflare จะพัง

## 5. รัน / ตรวจ / deploy

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # ตรวจ type
npm run lint
npm run build
```

- ไม่มีชุดทดสอบอัตโนมัติ ต้องทดสอบด้วยมือบน preview
- ใน sandbox ที่ออกเน็ตไปหา Google Fonts ไม่ได้ ให้ build ด้วย `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`
- GitHub Actions (`.github/workflows/deploy.yml`) จะ deploy ขึ้น Cloudflare Pages
  - push เข้า `main` → ขึ้น production (`bata-cctv-portal.pages.dev`)
  - เปิด PR เข้า `main` → ได้ preview URL แยก โดยไม่กระทบ production
- ขั้นตอนการทำงานใช้ plugin `bata-dev-flow`: `/planning → /design → /implement → /test →
  /review → /security → /audit → /release → /document` และ `/status` ใช้ดูว่างานถึงไหนแล้ว

## 6. ข้อควรระวัง

- `backups/` มีไฟล์ backup ข้อมูลจริงของสาขาที่ถูก commit เข้า repo ไว้แล้ว (ชุด 2026-08-05)
  ไฟล์ backup ใหม่ไม่ควร commit
- `README.md` บางส่วนเก่าแล้ว เช่นระบุว่าใช้ Next.js 14 และมีหลาย role ให้ยึดไฟล์นี้กับโค้ดจริงเป็นหลัก
