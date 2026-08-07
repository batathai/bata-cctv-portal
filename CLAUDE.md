# CLAUDE.md

คู่มือบริบทโปรเจกต์นี้สำหรับ Claude (หรือคนอื่น) ที่เข้ามาดูแล/แก้โค้ดต่อในอนาคต

## 1. ภาพรวมโปรเจกต์

**BATA Store — ส่ง Payslip** เป็นระบบให้พนักงานสาขาของ BATA Thailand กรอกฟอร์มรายงาน "ยอดเงินนำส่งประจำวัน" (daily cash deposit) ผ่านมือถือ พร้อมแนบรูปสลิปการนำฝากธนาคาร/เคาน์เตอร์เซอร์วิส แล้วให้ฝ่ายบัญชี/HQ ดูสรุปสถานะการส่งของทุกสาขาผ่านหน้า Dashboard

ใช้แก้ปัญหาการติดตามว่าสาขาไหนนำเงินยอดขายเข้าธนาคารแล้วหรือยัง ส่งช้าหรือไม่ ยอดตรงกับระบบ POS (Xstore/Oracle) หรือไม่ และมีการส่งซ้ำ (duplicate) หรือเปล่า — แทนการติดตามด้วยมือ/แชท

**ผู้ใช้งาน 2 กลุ่ม:**
- **พนักงานสาขา**: เปิด `index.html` บนมือถือ เลือกเขต/รหัสสาขา กรอกยอดฝาก เลือกช่องทาง แนบรูปสลิป แล้วกดส่ง
- **ฝ่ายบัญชี/HQ**: เปิด `dashboard/index.html` ดูสถานะการส่งของทุกสาขา (ส่งแล้ว/ยังไม่ส่ง/ส่งช้า/ส่งซ้ำ), เทียบยอดกับ Xstore Cash, export Excel, และมี URL parameter `?zone=XXX` สำหรับให้ DM (District Manager) แต่ละเขตดูได้เฉพาะสาขาในเขตตัวเอง

## 2. สถานะปัจจุบัน

ระบบ **ใช้งานจริงแล้ว** (production) หน้าฟอร์มและ dashboard ทำงานผ่าน Supabase โดยตรง (client-side, ไม่มี backend ของตัวเอง) และมีระบบแจ้งเตือนผ่าน LINE OA ทำงานคู่กันอยู่ (รันบน Pipedream ภายนอก repo นี้ — ดูหัวข้อ 5 และ 6)

**อัปเดต (2026-07-18):** ทำความสะอาด repo ทั้งหมด — ลบเอกสารที่ไม่เกี่ยวข้อง (ระบบคนละโปรเจกต์ และแนวทาง Google Apps Script/Sheets ที่ถูกทิ้งไปตั้งแต่ต้น) และย้ายเอกสารที่เกี่ยวข้องจริง (`BATA_LINE_...md`) ออกมาไว้ที่ root แล้วลบโฟลเดอร์ `docs/` ทิ้ง (ดูหัวข้อ 8 สำหรับรายละเอียด) ตอนนี้ repo เหลือเฉพาะไฟล์ที่ใช้งานจริง

## 3. โครงสร้างไฟล์/โฟลเดอร์หลัก

```
Store_payslip/
├── index.html          # หน้าฟอร์ม "ส่ง Payslip" ที่สาขาใช้งานจริง (production)
│                        # เชื่อม Supabase โดยตรง (ตาราง payin_records, storage bucket payin-slips)
├── dashboard/
│   └── index.html       # หน้า Dashboard สำหรับ HQ/DM ดูสถานะการส่งของทุกสาขา
│                        # เชื่อม Supabase (payin_records, stores) + เรียก Xstore Cash API ภายนอก
├── CNAME                # กำหนด custom domain ของ GitHub Pages: store-payslip.batathai.com
├── BATA_LINE_แจ้งเตือนยอดขาย_คู่มืออ้างอิง.md
│                        # อธิบายระบบแจ้งเตือน LINE OA ที่รันบน Pipedream (นอก repo นี้)
│                        # คอยเช็คสาขาที่ยังไม่ส่งยอด แล้วส่งเข้ากลุ่ม LINE — ย้ายมาจาก docs/ เมื่อ 2026-07-18
└── CLAUDE.md            # ไฟล์นี้
```

> **ลบ/ย้ายไปแล้วเมื่อ 2026-07-18** (ดูรายละเอียด/เหตุผลในหัวข้อ 8):
> - `docs/PROJECT_CONTEXT.md`, `docs/DATABASE.md`, `docs/DEPLOYMENT.md`, `docs/README.md`, `docs/CHANGELOG.md`, `docs/TODO.md` — ลบทิ้ง เพราะเป็นเอกสารของระบบแจกจ่าย Invoice ไปสาขาแฟรนไชส์ผ่าน Foxpro/Xstore POS (repo คนละตัว)
> - `code.gs`, `SETUP_GUIDE.md` (root), `docs/SETUP_GUIDE.md` (สำเนา) — ลบทิ้ง เพราะเป็นแนวทาง Google Apps Script/Sheets ที่ถูกทิ้งไปตั้งแต่ต้นโปรเจกต์ ไม่เคยใช้งานจริงคู่กับ `index.html` เวอร์ชัน Supabase ปัจจุบัน
> - `docs/BATA_LINE_แจ้งเตือนยอดขาย_คู่มืออ้างอิง.md` — ย้ายออกมาไว้ที่ root แล้วลบโฟลเดอร์ `docs/` ทิ้ง (เป็นไฟล์สุดท้ายในโฟลเดอร์)

## 4. Tech Stack

- **Frontend**: Static HTML/CSS/JavaScript ล้วน (vanilla JS, ไม่มี framework, ไม่มี build step)
- **Hosting**: GitHub Pages พร้อม custom domain `store-payslip.batathai.com` (ดูไฟล์ `CNAME`)
- **Backend/Database**: [Supabase](https://supabase.com) (Postgres + REST API + Storage) เรียกตรงจาก client ผ่าน `@supabase/supabase-js@2` (โหลดจาก CDN `jsdelivr`)
  - Project URL ที่ใช้งานจริง: `https://hdgwhhimqugfhhwjakkb.supabase.co`
  - Anon key hardcode อยู่ใน `<script>` ของทั้ง `index.html` และ `dashboard/index.html` (ไม่ใช่ความลับระดับสูง เพราะออกแบบมาให้ใช้ client-side ได้ แต่ต้องพึ่ง RLS policy คุมสิทธิ์)
- **Storage**: Supabase Storage bucket ชื่อ `payin-slips` สำหรับเก็บรูปสลิป (มีการบีบอัดรูปฝั่ง client ก่อนอัปโหลด — resize ให้กว้างไม่เกิน 1280px และแปลงเป็น JPEG quality 0.75 เพื่อลดขนาดไฟล์)
- **Chart/Export ใน Dashboard**: [Chart.js 4.4.1](https://www.chartjs.org/) (กราฟ trend/district/donut), [SheetJS (xlsx) 0.18.5](https://sheetjs.com/) (export Excel) — โหลดจาก `cdnjs`
- **External API**: Xstore/Oracle Cash — `2_sales_api.py` (Flask/Python, ไม่ได้อยู่ใน repo นี้) รันบน server ภายในองค์กร (`192.1.36.59:5001`) query Oracle โดยตรงแล้ว **push ยอด Cash เข้าตาราง `xstore_cash_daily` ใน Supabase อัตโนมัติทุก ~3 นาที ผ่าน background thread** (อัปเดต 2026-08-06 — ดูหัวข้อ 8) `dashboard/index.html` อ่านค่าจากตาราง `xstore_cash_daily` นี้ผ่าน Supabase client เหมือนตารางอื่นๆ **ไม่ได้ fetch ตรงไปที่ `2_sales_api.py` อีกต่อไป**
- **Automation ภายนอก**: [Pipedream](https://pipedream.com) รัน scheduled workflow เรียก Supabase + LINE Messaging API เพื่อแจ้งเตือนสาขาที่ยังไม่ส่งยอด (ดูหัวข้อ 6)
- **ไม่มี**: build tool, package manager (npm/yarn), test suite, CI/CD ใดๆ — deploy คือ push ไฟล์ HTML ขึ้น GitHub Pages ตรงๆ

## 5. เหตุผลการออกแบบสำคัญที่ควรรู้ก่อนแก้โค้ด

1. **ทำไมเป็น static HTML ไม่มี backend เอง** — ใช้ Supabase เป็นทั้งฐานข้อมูลและ API ชั้นเดียว เพื่อไม่ต้องดูแล server, deploy ผ่าน GitHub Pages ได้ฟรี ความปลอดภัยพึ่ง RLS policy ของ Supabase (ยังไม่ได้ตรวจสอบ policy จริงจาก dashboard ของ Supabase — ควรตรวจก่อนแก้ logic ที่เกี่ยวกับสิทธิ์) โปรเจกต์เคยลองแนวทาง Google Apps Script + Sheets มาก่อนช่วงเริ่มต้น (17 มิ.ย. 2569) แต่ถูกทิ้งภายใน 2 วันเพื่อมาใช้ Supabase แทน (ดูหัวข้อ 8)

2. **`payin_records` เป็นตารางหลัก** เก็บ 1 แถวต่อการส่งฟอร์ม 1 ครั้ง คอลัมน์สำคัญที่พบในโค้ด: `zone_code`, `store_code`, `deposit_date`, `sales_date`, `amount`, `channel`, `channel_detail`, `slip_path`, `slip_url`, `submitted_at`, `duplicate_status`, `duplicate_group_id`, `duplicate_reason` — schema นี้อนุมานจากโค้ด JS เท่านั้น ไม่มีเอกสาร schema อย่างเป็นทางการใน repo

3. **การจัดการ "ส่งซ้ำ" ไม่ได้ป้องกันด้วย unique constraint แบบ block แต่ปล่อยให้บันทึกซ้ำแล้วให้คนตรวจทีหลัง** — ถ้าสาขาส่งยอดวันเดียวกันมากกว่า 1 ครั้ง ระบบจะไม่ error แต่ dashboard จะจัดกลุ่มเป็น "Duplicate" ให้ HQ กดเลือกว่ารายการไหนถูกต้อง (ผ่าน RPC `resolve_duplicate` และ `detect_and_group_duplicates` ซึ่งเป็น Postgres function ที่ตั้งไว้ฝั่ง Supabase — โค้ดฟังก์ชันเหล่านี้ไม่ได้เก็บอยู่ใน repo นี้ ถ้าต้องแก้ logic การจับ duplicate ต้องเข้าไปดู/แก้ที่ Supabase SQL Editor โดยตรง)

4. **Deadline/สถานะการส่งคำนวณจาก sales_date + 1 วัน เวลา 14:00 ไทย (07:00 UTC)** — ดู logic ใน `getStoreStatus()` ของ `dashboard/index.html` สถานะมี 5 แบบ: `sent` (ส่งตรงเวลา), `late` (ส่งช้ากว่า deadline), `missing` (ยังไม่ถึง deadline และยังไม่ส่ง), `delay` (เลย deadline แล้วยังไม่ส่ง), `duplicate` (ส่งมากกว่า 1 ครั้งในวันเดียว)

5. **Dashboard รองรับ 2 โหมดผ่าน URL parameter `?zone=`** — ถ้าไม่มี parameter = โหมด "Accounting" (เห็นทุกเขต, filter ได้อิสระ) ถ้ามี `?zone=530` เช่น = โหมด "DM" (District Manager) ที่ล็อกให้เห็นเฉพาะสาขาในเขตนั้น และซ่อน UI บางส่วน (district chart, zone filter) — เวลาแจก link ให้ DM แต่ละคน ต้องแนบ query string นี้ให้ถูกเขต

6. **รูปสลิปถูกบีบอัดฝั่ง client ก่อนอัปโหลดเสมอ** (`compressImage()`) เพื่อลด storage/bandwidth และแปลงเป็น `.jpg` เสมอไม่ว่าไฟล์ต้นทางเป็นนามสกุลอะไร — ถ้า browser บีบอัดไม่ได้ (พบบ่อยกับไฟล์ HEIC จาก iPhone) จะแจ้ง error ให้ผู้ใช้ถ่ายใหม่แทนที่จะพยายามอัปโหลดไฟล์ดิบ

7. **(เดิม — ไม่ใช้แล้วตั้งแต่ 2026-08-06) Xstore Cash API ใช้ HTTPS self-signed certificate** — เดิมผู้ใช้ dashboard ต้องเปิด `https://192.1.36.59:5001/api/health` ในเบราว์เซอร์อย่างน้อย 1 ครั้งเพื่อกด "Advanced → Proceed" ยอมรับ certificate ก่อน ไม่งั้นการเรียก fetch จาก dashboard จะถูกเบราว์เซอร์บล็อกเงียบๆ ทำให้คอลัมน์ Xstore Cash ว่างเปล่าบนเครื่องที่ไม่เคยกด accept — **แก้แล้วโดยเปลี่ยนให้ `2_sales_api.py` push ข้อมูลเข้า Supabase เอง แทนที่ dashboard จะ fetch ตรง** ดูหัวข้อ 8 (Changelog) และหัวข้อ 6.4 (อัปเดตแล้ว)

8. **จำกัดวันย้อนหลังที่กรอกได้ไม่เกิน 7 วัน** (`MAX_BACKDATE_DAYS`) ในฟอร์ม `index.html` เพื่อกันการกรอกข้อมูลเก่าเกินไป

9. **ข้อมูลเขต/รหัสสาขา/ชื่อสาขา (`ZONE_BRANCHES`, `STORE_NAMES`) hardcode ซ้ำอยู่ทั้งใน `index.html` และ `dashboard/index.html` แยกกันคนละชุด** — สังเกตว่ารายชื่อสาขาในสองไฟล์ "ไม่เหมือนกันทุกตัว" (เช่น `51201` vs `51410` ในเขต 513) ถ้าเพิ่ม/ย้ายสาขาใหม่ ต้องแก้ทั้ง 2 ไฟล์ให้ตรงกัน ไม่งั้น dashboard กับฟอร์มจะเห็นรายชื่อสาขาไม่ตรงกัน

## 6. จุดที่ต้องระวัง / Known Issues

1. **Anon key ของ Supabase hardcode อยู่ในโค้ด client-side ทั้งสองไฟล์หลัก** — ตามการออกแบบของ Supabase เรื่องนี้ยอมรับได้ถ้า RLS policy ตั้งไว้รัดกุม แต่ยังไม่มีเอกสารยืนยัน RLS policy ที่ใช้งานจริงกับ `payin_records`/`stores`/`storage.objects` ใน repo นี้ — ควรตรวจสอบใน Supabase Dashboard ก่อนเชื่อว่าปลอดภัย

2. **ไม่มีการทดสอบอัตโนมัติ (no tests) และไม่มี CI/CD** — การเปลี่ยนแปลงใดๆ ต้องทดสอบมือผ่านการเปิดหน้าเว็บจริงและกรอกฟอร์มทดสอบ

3. **โค้ด schema ของฐานข้อมูล/ฟังก์ชัน RPC (`resolve_duplicate`, `detect_and_group_duplicates`) ไม่ได้เก็บเป็นไฟล์ migration ใน repo นี้** — อยู่ในฝั่ง Supabase เท่านั้น ถ้าต้อง reproduce ฐานข้อมูลใหม่หรือ debug logic การจับ duplicate จะต้องเข้าถึง Supabase Dashboard/SQL Editor โดยตรง

4. **(อัปเดต 2026-08-06) Xstore Cash ตอนนี้พึ่งพา 2 อย่าง: (ก) `2_sales_api.py` ต้องรันอยู่ตลอดเวลาบน server ภายในองค์กร (`192.1.36.59`) เพื่อให้ background sync thread push ข้อมูลเข้า Supabase ทุก ~3 นาที ถ้า process ตาย ข้อมูลจะหยุดอัปเดต (แต่ข้อมูลเก่าที่เคย sync ไว้ยังอยู่ ไม่หายไปทันที) และ (ข) ต้องตั้งค่า environment variable `SUPABASE_SERVICE_ROLE_KEY` บนเครื่องที่รัน server นั้นก่อนสตาร์ท ไม่งั้น sync thread จะไม่ถูกสร้างขึ้นเลย (ดู log ตอนสตาร์ท: `[xstore-sync] ข้ามการ sync อัตโนมัติ...`)** — ถ้าเปลี่ยนเครื่อง/ย้าย server ต้องตั้งค่า `SUPABASE_SERVICE_ROLE_KEY` ใหม่บนเครื่องนั้นด้วย (ไม่ต้องแก้อะไรใน `dashboard/index.html` อีกแล้ว เพราะ dashboard อ่านจาก Supabase ไม่ได้ผูกกับ IP ของ server นี้โดยตรง) service_role key **ห้ามใส่ในโค้ด client-side (`index.html`/`dashboard/index.html`) เด็ดขาด**

5. **รายชื่อ/รหัสสาขาใน `ZONE_BRANCHES`/`STORE_NAMES` ต่างกันเล็กน้อยระหว่าง `index.html` และ `dashboard/index.html`** (ดูหัวข้อ 5.9) — เป็นความเสี่ยงที่ข้อมูลจะ drift ห่างกันมากขึ้นเรื่อยๆ ถ้าไม่มี process อัปเดตพร้อมกันทั้ง 2 ไฟล์

6. **ระบบแจ้งเตือน LINE (Pipedream) อยู่นอก repo นี้ทั้งหมด** — โค้ด `bata_payslip_combined.js`, workflow schedule, secrets (LINE token, Supabase service role key) ถูกเก็บไว้ใน Pipedream ไม่ได้ version control ร่วมกับ repo นี้ ถ้าต้องแก้ไขต้องเข้า Pipedream โดยตรง (ดูรายละเอียดใน `BATA_LINE_แจ้งเตือนยอดขาย_คู่มืออ้างอิง.md`)

## 7. วิธีรัน / Build / Deploy

**ไม่มี build step** — เป็น static HTML ล้วน

### รันดูตอน dev (local)
เปิดไฟล์ `index.html` หรือ `dashboard/index.html` ตรงๆ ในเบราว์เซอร์ หรือรัน local server ง่ายๆ เช่น:
```bash
python3 -m http.server 8000
# แล้วเปิด http://localhost:8000/index.html หรือ http://localhost:8000/dashboard/index.html
```
หมายเหตุ: เนื่องจากเชื่อม Supabase จริงตรงๆ การทดสอบ local จะเขียน/อ่านข้อมูลจริงในฐานข้อมูล production ไม่มี environment แยกสำหรับ staging — ควรระวังเวลาทดสอบการส่งฟอร์ม

### Deploy
Deploy ผ่าน **GitHub Pages**:
1. Push การเปลี่ยนแปลงขึ้น branch `main`
2. GitHub Pages (ตั้งค่าใน repo Settings → Pages) จะ build/serve อัตโนมัติภายในไม่กี่นาที
3. Custom domain `store-payslip.batathai.com` ผูกไว้ผ่านไฟล์ `CNAME` แล้ว

### Checklist ก่อน deploy
1. ตรวจสอบว่า Supabase project (`hdgwhhimqugfhhwjakkb.supabase.co`) status เป็น Active
2. ทดสอบส่งฟอร์มจริง 1 รายการจาก `index.html` แล้วเช็คว่าขึ้นในตาราง `payin_records`
3. เปิด `dashboard/index.html` เช็คว่าเห็นรายการที่เพิ่งส่งไป และกราฟ/metric อัปเดตถูกต้อง
4. ถ้าแก้รายชื่อ/รหัสสาขา ต้องแก้ทั้ง `index.html` และ `dashboard/index.html` ให้ตรงกัน (ดูหัวข้อ 6.5)

### Rollback
GitHub Pages ใช้ git history ปกติ — ถ้า deploy แล้วมีปัญหา ให้ revert commit ล่าสุดแล้ว push ใหม่

## 8. Changelog

- **2026-08-06** — เพิ่มฟีเจอร์ Zoom ในหน้าดูรูปสลิป (`openSlip()` ใน `dashboard/index.html`) ใช้งานร่วมกับ Rotate เดิมได้: ปุ่ม +/− (50%-600%), scroll wheel, ลากภาพ (drag) ตอนซูมเข้า, ดับเบิลคลิก/ปุ่ม ⤾ เพื่อรีเซ็ต
- **2026-08-06** — เปลี่ยนสถาปัตยกรรม Xstore Cash เพื่อแก้ปัญหา "คอลัมน์ Xstore Cash ไม่ขึ้นข้อมูลบนเครื่องใหม่" (สาเหตุเดิม: ต้อง accept self-signed certificate เองทุกเครื่อง — ดูหัวข้อ 5.7 เดิม):
  - `2_sales_api.py` (นอก repo นี้) เพิ่ม background thread (`xstore_cash_sync_loop`) query Oracle เองทุก 3 นาที แล้ว push เข้าตาราง `xstore_cash_daily` ใน Supabase ผ่าน REST API (ต้องตั้งค่า env var `SUPABASE_SERVICE_ROLE_KEY` บนเครื่องที่รัน server)
  - สร้างตาราง `xstore_cash_daily` ใหม่ใน Supabase (SQL อยู่ใน `xstore_cash_daily_setup.sql` ที่ส่งให้เจ้าของโปรเจกต์แยกจาก repo นี้ — เปิด RLS อ่านได้อย่างเดียวด้วย anon key, เขียนได้เฉพาะ service_role)
  - `dashboard/index.html`: `loadXstoreCash()` และ `openHistoryModal()` เปลี่ยนจาก `fetch()` ตรงไปที่ `XSTORE_API_BASE` (ลบ constant นี้ทิ้งแล้ว) เป็น query ตาราง `xstore_cash_daily` ผ่าน Supabase client (`sb`) แทน — ผลคือเครื่องใหม่ใช้งานได้ทันทีโดยไม่ต้อง accept certificate เอง เพราะไม่ได้คุยกับ `192.1.36.59:5001` ตรงๆ อีกต่อไป
  - endpoint `/api/xstore-cash` ใน `2_sales_api.py` ยังอยู่เหมือนเดิม (ใช้ debug/เรียกเองเฉพาะกิจได้) แต่ dashboard ไม่เรียกแล้ว
- **2026-07-18** — ย้าย `docs/BATA_LINE_แจ้งเตือนยอดขาย_คู่มืออ้างอิง.md` ออกมาไว้ที่ root ของ repo แล้วลบโฟลเดอร์ `docs/` ทิ้ง (เป็นไฟล์สุดท้ายที่เหลืออยู่ในนั้น) ตามคำขอของเจ้าของโปรเจกต์
- **2026-07-18** — ลบ `code.gs`, `SETUP_GUIDE.md` (root), `docs/SETUP_GUIDE.md` (สำเนา) — ตรวจสอบ git history แล้วพบว่าทั้ง 3 ไฟล์ถูกอัปโหลดครั้งเดียวเมื่อ 17 มิ.ย. 2569 และไม่เคยถูกแก้ไขอีกเลย ขณะที่ `index.html` เวอร์ชัน Supabase ที่ใช้งานจริงเริ่มพัฒนาแยกต่างหากตั้งแต่ 19 มิ.ย. 2569 (2 วันถัดมา) และถูกพัฒนาต่อเนื่องเรื่อยมาโดยไม่เคยอ้างอิง Google Apps Script เลย สรุปว่าเป็นแนวทางแรกเริ่ม (Google Sheets/Drive) ที่ถูกทิ้งเพื่อมาใช้ Supabase แทน จึงลบตามคำขอของเจ้าของโปรเจกต์
- **2026-07-18** — ลบไฟล์เอกสารเก่าที่ไม่เกี่ยวกับระบบนี้ 6 ไฟล์ออกจาก `docs/`: `PROJECT_CONTEXT.md`, `DATABASE.md`, `DEPLOYMENT.md`, `README.md`, `CHANGELOG.md`, `TODO.md` — ทั้งหมดบรรยายระบบแจกจ่าย Invoice ไปสาขาแฟรนไชส์ผ่าน Foxpro/Xstore POS (repo `Supply-franchise`, Supabase project `ohoropbhdypmomgsqjwt.supabase.co`) ซึ่งเป็นคนละโปรเจกต์กับ `Store_payslip` นี้โดยสิ้นเชิง สันนิษฐานว่าถูก copy มาผิด repo จึงลบทิ้งตามคำขอของเจ้าของโปรเจกต์
- **สร้างไฟล์นี้ครั้งแรกวันที่ 18 กรกฎาคม 2569 (2026-07-18)** โดย Claude — สร้างจากการอ่านโค้ดทั้งหมดใน repo ณ ขณะนั้น (commit `1de16e9`) เพื่อบันทึกบริบทโปรเจกต์ให้คนที่เข้ามาดูแลต่อเข้าใจภาพรวมได้เร็วขึ้น และตั้งข้อสังเกตสำคัญเรื่องเอกสารใน `docs/` ที่ไม่ตรงกับระบบจริง
