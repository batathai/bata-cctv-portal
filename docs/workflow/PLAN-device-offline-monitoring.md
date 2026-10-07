# Plan — Device Offline Monitoring (Heartbeat)

Feature slug: `device-offline-monitoring`
Date: 2026-10-07
Status: planning done → next `/design`

## Goal
วันนี้ทีม HQ ไม่รู้ว่า DVR สาขาไหนดับหรือเน็ตหลุด จนกว่าสาขาจะแจ้งหรือมีคนไปเปิดดูเอง และ DVR ส่งเมลแจ้ง "Network Disconnected" เองไม่ได้ (ตอนเน็ตหลุดก็ไม่มีทางส่งออก)
เป้าหมาย: ให้ DVR ทุกสาขา "รายงานตัว" (heartbeat) เป็นระยะ แล้วให้ portal เป็นคนจับว่าสาขาไหนเงียบ → ขึ้น Offline ใน Command Center + ส่งเมล + บันทึกเวลาหลุด/กลับมา เพื่อส่งช่างเข้าซ่อมได้ทันที

## Users and roles
- ระบบเป็น single-role (`hq_admin` = Bata IT) ตาม `src/lib/rbac.ts` — ทุกคนที่ล็อกอินดู/ตั้งค่าได้เหมือนกัน
- ผู้รับเมลแจ้งเตือน: รายชื่ออีเมลที่ตั้งได้ (ทีม CCTV / IT) — **ไม่ต้องล็อกอิน**
- DM / ช่าง / vendor: ไม่ใช่ผู้ใช้ระบบ ได้ข้อมูลผ่านเมลหรือที่ทีมส่งต่อ

## Scope
**In scope (phase 1 — Device Offline)**
- รับ heartbeat จาก DVR สาขา (ทางหลัก: Scheduled Capture → FTP)
- จับ Offline / Online อัตโนมัติ, เก็บประวัติการหลุด
- เมลแจ้งเตือนตอนหลุดและตอนกลับมา
- แสดงสถานะสดในหน้า Device Status (`/status`) และ Store Detail
- ติดตามว่าสาขาไหนตั้ง heartbeat แล้ว (rollout 194 สาขา)
- คู่มือตั้งค่า DVR สำหรับช่าง/ทีม

**Out of scope (phase 1)**
- Video Signal Loss / HDD Error เข้า portal → **phase 2** (ตอนนี้ DVR ส่งเมลตรงได้อยู่แล้ว)
- แจ้งเตือนทาง LINE / SMS
- Live view / playback ใน portal
- เฝ้ากล้องรายตัว (เฝ้าระดับเครื่อง DVR เท่านั้น)
- ซ่อม/รีบูต DVR จากระยะไกล

## Requirements
- **R1 ผูกเครื่องกับสาขา** — แต่ละสาขามีตัวระบุ heartbeat (เช่น โฟลเดอร์ FTP = รหัสสาขา) และเก็บ serial DVR ไว้เทียบ ป้องกันส่งผิดสาขา
- **R2 รับ heartbeat** — ทุกครั้งที่ไฟล์จากสาขาเข้ามา ระบบอัปเดต `last_seen_at` ของสาขานั้น
- **R3 ตรวจสถานะเป็นรอบ** — ตรวจทุก N นาที (เสนอ 5); ถ้าเงียบเกิน threshold (เสนอ 30 นาที, ตั้งค่าได้) → Offline; heartbeat ใหม่เข้ามา → Online
- **R4 ประวัติการหลุด** — เก็บทุกครั้ง: เริ่มหลุด (= last seen), เวลาที่ตรวจพบ, เวลากลับมา, ระยะเวลา
- **R5 เมลแจ้งเตือน** — ส่งเมลเมื่อหลุดและเมื่อกลับมา หัวเมลมีรหัส+ชื่อสาขา, ภาค/เขต, last seen, หลุดมานานเท่าไร
- **R6 กันเมลท่วม** — ถ้าหลายสาขาหลุดพร้อมกันในรอบเดียว (เกินจำนวนที่ตั้ง) ส่งเมลสรุปฉบับเดียว และเตือนว่าอาจเป็นปัญหาฝั่งกลาง (FTP/ระบบตรวจ) ไม่ใช่สาขา
- **R7 แสดงสถานะใน portal** — `/status` และ Store Detail แสดง Online/Offline สด, last seen, offline since; กรองภาค (BKK 511/512/513/550, UPC 520/530/540/560) และเขต; สาขาที่ยังไม่ตั้ง heartbeat แสดงเป็น "Not monitored" ไม่ใช่ Offline
- **R8 ปิดเตือนชั่วคราว** — mute รายสาขาได้ (ปิดปรับปรุง, ห้างปิด) พร้อมเหตุผลและวันหมดอายุ
- **R9 Rollout tracker** — นับว่ากี่สาขาจาก 194 ที่ส่ง heartbeat แล้ว และสาขาไหนยังไม่เคยส่ง
- **R10 รายงาน** — export ประวัติการหลุด (Excel) ตามช่วงวัน/ภาค/เขต สำหรับติดตามช่างและ SLA
- **R11 (ไม่บังคับ) รูปล่าสุด** — เก็บเฉพาะรูป heartbeat ล่าสุดของแต่ละสาขาไว้ดูใน Store Detail

## Data
มีอยู่แล้ว (ยืนยันจากโค้ด):
- `stores.online_status` ('Online'/'Offline') — migration 007, ปัจจุบันกรอกมือ/import
- `stores.overall_status` (Healthy/Partial/Offline/Unknown) — ใช้ในหน้า `/status`
- `stores.region`, `stores.zone`
- serial เครื่องอยู่ใน `cctv_assets` (`nvr_serial`)

ใหม่ (รายละเอียดใน `/design`):
- สถานะ heartbeat ต่อสาขา: `last_seen_at`, สถานะปัจจุบัน, monitored yes/no, mute
- ตารางประวัติการหลุด (outages)
- ค่าตั้งระบบ: interval, threshold, รายชื่อผู้รับเมล, เกณฑ์เมลสรุป
- (ถ้าทำ R11) ที่เก็บรูปล่าสุด

ที่ automate ไม่ได้ / ต้องทำมือ:
- ตั้ง FTP + Scheduled Capture ที่ DVR ทีละสาขา (ผ่าน iVMS-4200 Remote Configuration หรือหน้าจอเครื่อง) — ไม่มี API ของ Hikvision ให้ตั้งพร้อมกันทีเดียว ในงบปัจจุบัน

## Risks and open questions
1. **ที่ตั้ง FTP server (ต้องตัดสินก่อน /design)** — Supabase และ Cloudflare Pages รับ FTP ไม่ได้ ต้องมี FTP บนคลาวด์ (VPS หรือบริการ FTP-to-storage) ใครเป็นเจ้าของ/จ่าย และ IT อนุญาตไหม
2. **DVR รองรับ FTP + Scheduled Capture หรือไม่** — ต้องเช็ครุ่นที่ใช้จริง เริ่มจาก DS-7204HGHI-K1 (FW V4.30.204) และรุ่นอื่นในสาขา ถ้าบางรุ่นไม่รองรับ ต้องหาทางสำรอง
3. **ปริมาณเน็ตซิม** — รูปทุก 15 นาที = 96 รูป/วัน/สาขา ขนาดจริงยังไม่รู้ ต้องวัดจาก pilot ก่อนกำหนด interval
4. **ค่า interval / threshold** — 10–15 นาที / 30 นาที เป็นค่าที่เสนอ ยังไม่ยืนยัน
5. **ผู้รับเมล** — ใครบ้าง แยกตามภาค/เขตไหม
6. **False alarm จากฝั่งกลาง** — FTP หรือระบบตรวจล่ม = ทุกสาขาขึ้น Offline พร้อมกัน (R6 รองรับส่วนหนึ่ง) ต้องมีตัวเฝ้าระบบตรวจเองด้วย
7. **ความปลอดภัย** — รหัส FTP ถูกเก็บในทุก DVR; ควรเป็นบัญชีเขียนอย่างเดียว แยกโฟลเดอร์ต่อสาขา
8. **เวลาเครื่อง DVR เพี้ยน** — ใช้เวลาที่ไฟล์ถึง server ไม่ใช่เวลาในชื่อไฟล์
9. **ความสัมพันธ์กับ `online_status` เดิม** — ระบบอัตโนมัติจะเขียนทับค่าที่กรอกมือของสาขาที่ monitored แล้วหรือไม่
10. **ทางเลือกที่ยังไม่ปิด** — Hik-Connect for Teams / Hik-Partner Pro OpenAPI (อ่านสถานะจากคลาวด์ Hikvision ตรงๆ, อาจมีค่าใช้จ่าย) และ Hikvision HTTP alarm push ถ้า FTP ใช้ไม่ได้
11. **งานค้าง** — Installation Project ยังอยู่ที่ `/test` บน branch `docs/installation-project-plan`; session นี้ push GitHub ไม่ได้ (ต้อง push เองจนกว่าจะติดตั้ง Claude GitHub App)

## Milestones
- **M0 Pilot (ไม่มีโค้ด portal)** — ตั้ง FTP ทดสอบ 1 ตัว, ตั้ง DVR สาขาทดสอบ (DS-7204HGHI-K1) ส่งรูปทุก 10–15 นาที, วัดว่าไฟล์มาสม่ำเสมอไหมและขนาดเท่าไร → ปิด open question 1–4
- **M1 รับ heartbeat** — schema + ตัวรับไฟล์ที่อัปเดต `last_seen_at` (R1, R2)
- **M2 ตรวจจับ + แจ้งเตือน** — ตัวตรวจเป็นรอบ, ประวัติการหลุด, เมลแจ้ง/สรุป, mute (R3–R6, R8)
- **M3 หน้าจอ** — `/status` + Store Detail แสดงสถานะสด, rollout tracker (R7, R9)
- **M4 Rollout + รายงาน** — คู่มือตั้งค่า DVR, ทยอยตั้ง Top 20 ก่อน แล้วขยาย 194, export ประวัติ (R10, R11)
- **Phase 2 (feature ถัดไป)** — Video Signal Loss / HDD Error เข้า portal
