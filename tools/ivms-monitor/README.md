# ivms-monitor — ตัวเฝ้า DVR สาขา

สคริปต์บนคอม HQ ทุก 5 นาทีจะอ่านสถานะ Online/Offline ของ DVR ทุกสาขา แล้วส่งผลขึ้น Supabase
ให้หน้า **Device Status** ใน portal และส่งเมลแจ้งเตือนผ่าน Gmail

**ตั้งแต่ 2.0.0 (20 ต.ค. 2026) อ่านจาก Hik-Partner Pro** — สคริปต์เปิดเว็บแบบไม่มีหน้าต่าง กด Export
"Site Details" (ทุก Site / ทุกเครื่องในไฟล์เดียว) แล้วอ่านไฟล์ ไม่ต้องเปิด iVMS ค้าง ไม่ต้องห้ามแตะเมาส์
แบบเดิม (อ่านหน้าจอ iVMS-4200 ด้วย OCR) ยังอยู่ ใช้ย้อนกลับได้ด้วย `MONITOR_SOURCE=ivms` ใน `.env`

ดีไซน์ทั้งหมด: `docs/workflow/DESIGN-device-offline-monitoring.md` (หัวข้อ 9 = แหล่งข้อมูล Hik-Partner Pro)

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `monitor.py` | ตัวหลัก รันต่อเนื่อง |
| `hpp_auto_export.py` | เปิด Hik-Partner Pro (Edge แบบไม่มีหน้าต่าง) กด Export ได้ไฟล์ .xlsx · `--setup` ล็อกอินครั้งแรก |
| `hpp_reader.py` | อ่านไฟล์ Export → รายการ Online/Offline ต่อสาขา |
| `ivms_reader.py` | (แบบเดิม) กด Refresh + อ่านหน้าจอ iVMS (Windows OCR + สีไอคอน) |
| `state.py` | กติกาตัดสิน Online/Offline และเลือกเมล (ไม่แตะ Windows/เน็ต) — ใช้ร่วมทั้งสองแหล่ง |
| `test_state.py`, `test_hpp_reader.py` | ชุดทดสอบ |
| `supa.py` | อ่าน/เขียน Supabase ด้วย service_role |
| `notify.py` | ส่งเมล Gmail 587/STARTTLS |
| `probe_*.py` | สคริปต์ทดสอบความเป็นไปได้เมื่อ 7 ต.ค. (เก็บไว้อ้างอิง) |

## ย้ายจาก iVMS มา Hik-Partner Pro (2.0.0)

ทำบนคอม HQ เครื่องเดิม (หรือเครื่องไหนก็ได้ที่มี Windows + Edge) **ระหว่างนี้ปล่อยตัวเดิมรันต่อไปก่อน**

1. อัปเดตโค้ด แล้วติดตั้งไลบรารีเพิ่ม (ไม่ต้องดาวน์โหลดเบราว์เซอร์ ใช้ Edge ที่มีในเครื่อง)
   ```
   cd <โฟลเดอร์ repo>\tools\ivms-monitor
   pip install -r requirements.txt
   ```
2. ตั้งภาษาบัญชี Hik-Partner Pro เป็น **English** (สคริปต์หาปุ่มจากคำว่า "Site & Device" / "Export")
3. ล็อกอินครั้งแรก: `python hpp_auto_export.py --setup` → หน้าต่าง Edge เปิดขึ้น ล็อกอินเอง (รหัส/OTP, ติ๊ก Remember me)
   เห็นข้อความ "✅ บันทึก session แล้ว" = เสร็จ (session เก็บในโฟลเดอร์ `hpp_profile\` ห้ามส่งต่อ ห้าม commit)
4. ทดสอบ Export: `python hpp_auto_export.py` → ควรเห็น `✅ Export สำเร็จ ... total=122 ... Offline: ...`
   - ไม่สำเร็จ: ดูข้อความ + ภาพหน้าจอในโฟลเดอร์ `debug\` · ดูทีละขั้นด้วย `python hpp_auto_export.py --show`
   - สำเร็จแล้วจะบอกลิงก์หน้า Site — ใส่เป็น `HPP_SITE_URL` ใน `.env` จะเร็วขึ้น
5. เพิ่มใน `.env`: `MONITOR_SOURCE=hpp` (ดูตัวอย่างใน `.env.example`)
6. ทดสอบทั้งรอบโดยไม่เขียนข้อมูล: `python monitor.py --once --dry-run`
7. หยุดตัวเดิม (Task Scheduler) แล้วเริ่ม `python monitor.py` — Task เดิมใช้ต่อได้เลย ค่าใน `.env` เป็นตัวเลือกแหล่งข้อมูล
8. เฝ้าข้ามคืน 1 คืน (เมลสรุปเช้า 10:00, เมลเปิดร้าน 10:30) ผ่านแล้วค่อยปิด iVMS
9. ย้อนกลับ: แก้ `.env` เป็น `MONITOR_SOURCE=ivms` แล้วรีสตาร์ต (ต้องเปิด iVMS ตามเงื่อนไขเดิม)

**Edge เปิดค้าง (2.0.5):** `monitor.py` เปิด Edge ไว้นอกจอตลอด แล้วรีโหลดหน้า + กด Export ในแท็บเดิมทุกรอบ
(ถ้าปิด-เปิดเบราว์เซอร์ทุกรอบ session OneHikID อยู่ได้แค่ ~2 ชม. — 21 ต.ค.) · ระหว่าง monitor รัน
รัน `hpp_auto_export.py` ตัวอื่นไม่ได้ (โฟลเดอร์ `hpp_profile` ถูกใช้อยู่) ต้องหยุด monitor ก่อน
· ใช้ผ่าน Remote Desktop: ออกด้วยปุ่ม X (disconnect) ห้าม Sign out

**session หมดอายุ:** (ขั้นตอน: หยุด monitor ด้วย Ctrl+C หรือ End Task → `python hpp_auto_export.py --setup` → เริ่ม monitor ใหม่) รอบตรวจจะ failed ด้วยข้อความ "ยังไม่ได้ล็อกอิน ... รัน --setup" → portal ขึ้นแบนเนอร์
และครบ 3 รอบจะมีเมลถึงผู้ดูแล → รัน `python hpp_auto_export.py --setup` ล็อกอินใหม่
(ถ้าใส่ `HPP_USER`/`HPP_PASSWORD` ใน `.env` สคริปต์จะลองล็อกอินเองก่อน — ใช้ไม่ได้ถ้าเว็บถาม captcha/OTP)

**สาขาที่ไม่อยู่ใน Hik-Partner Pro** คงสถานะ/เวลาอัปเดตเดิม (กติกาเดียวกับ 2 บัญชี iVMS) — เพิ่มเครื่องเข้า Hik-Connect
แล้วกด **Synchronize Devices from Hik-Connect** ใน Site ของเขตนั้น รอบถัดไปจะเห็นเอง

## แบบเดิม: iVMS-4200 (`MONITOR_SOURCE=ivms`)

### ติดตั้งครั้งแรก (คอม HQ)

1. ต้องรัน `supabase/migrations/022_device_monitoring.sql` ใน Supabase SQL Editor ก่อน
2. ติดตั้ง Python 3.10 ขึ้นไป แล้วเปิด **Command Prompt แบบ Run as administrator**
   ```
   cd <โฟลเดอร์ repo>\tools\ivms-monitor
   pip install -r requirements.txt
   ```
3. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` (และ `PORTAL_URL` ถ้าอยากให้เมลมีปุ่มลิงก์)
4. เปิด iVMS-4200 → Maintenance and Management → Device → **Cloud P2P Device**
   (ตั้งแต่ 1.1.0 สคริปต์เลื่อนอ่านครบทุกหน้าเองด้วยการคลิกแถบเลื่อน ไม่ต้องเรียงคอลัมน์แล้ว
   แต่เรียง Offline ไว้บนสุดก็ยังดีสำหรับคนดู) และรัน `supabase/migrations/023_store_monitor_last_checked.sql`
5. ทดสอบอ่านอย่างเดียว: `python ivms_reader.py` → ควรเห็น `ok=True total=67 complete=True ...` (ตัวเลขตามบัญชีที่เปิด)
6. ทดสอบทั้งรอบโดยไม่เขียนข้อมูลและไม่ส่งเมล: `python monitor.py --once --dry-run`
7. ใน portal → Device Status › ตั้งค่า ใส่**ผู้รับเมล** (แนะนำปิด "ส่งเมลแจ้งเตือน" ไว้ก่อนวันแรก)
8. รันจริง 1 รอบ: `python monitor.py --once` → หน้า Device Status ควรขึ้นแถบเขียว "ตัวตรวจทำงานปกติ"

## สาขาจับคู่กับเครื่องใน iVMS อย่างไร (1.4.0)

1. **ชื่อเครื่องขึ้นต้นด้วยรหัสสาขา 5 หลัก** เช่น `52017 - Lotus Maesot` → ใช้รหัสนั้น (แบบเดิม)
2. **ชื่อเป็นค่าเริ่มต้น** เช่น `DS-7204HGHI-K1(G83641193)` → อ่าน **Serial No.** แล้วเทียบกับ
   `cctv_assets.nvr_serial` / `hik_uid` ของสาขาที่เปิดอยู่
   - อ่าน serial 2 ที่ (คอลัมน์ Serial No. + วงเล็บในชื่อ) กัน OCR อ่านผิด; ตัวที่หน้าตาคล้าย (0/O, 1/I, 5/S, 8/B, 6/G) ถือว่าตรงกัน
   - serial ยาวบนป้ายใต้เครื่อง (`DS-7204HGHI-K1…G83641193…`) ที่กรอกไว้ใน DB ก็จับคู่ได้
   - **ไม่ยอมรับ "ต่างกัน 1 ตัว"**: serial เครื่องล็อตเดียวกันเรียงติดกัน ถ้ายอม เครื่องที่ยังไม่มีใน DB จะไปติดสาขาข้างๆ
3. จับคู่ไม่ได้ → ขึ้นในหน้า Device Status › Rollout › "ต้องตรวจ" เป็น `Serial G83642797 (ไม่มี Serial นี้ในสาขาใด)`
   → ไปกรอก NVR Serial ใน Asset Register ของสาขานั้น รอบถัดไปจะจับคู่เอง
   เช็กว่า serial ไหนยังไม่มีสาขาได้ด้วย `scripts/check-ivms-serials.sql`

## ให้รันเองตลอด (Task Scheduler)

- Create Task… → General: ✅ **Run with highest privileges**, เลือก **Run only when user is logged on**
  (OCR ต้องเห็นหน้าจอ — ถ้าเลือก "whether user is logged on or not" จะจับภาพไม่ได้)
- Triggers: **At log on**
- Actions: Program `python` · Arguments `monitor.py` · Start in `<โฟลเดอร์ tools\ivms-monitor>`
- Settings: ✅ If the task fails, restart every 1 minute · ❌ Stop the task if it runs longer than…

## เงื่อนไขของเครื่อง

- iVMS เปิดค้างหน้า Cloud P2P Device, **ไม่ย่อหน้าต่าง**, ไม่มีหน้าต่างอื่นบัง
  - ตั้งแต่ 1.0.2 สคริปต์ย่อหน้าต่าง Command Prompt ของตัวเองก่อนอ่านทุกรอบ ดูผลได้ใน `monitor.log` (เปิดด้วย Notepad ภาษาไทยไม่เพี้ยน) หรือหน้า Device Status
  - ถ้ามีหน้าต่างอื่นทับ iVMS (เช่น เบราว์เซอร์) สคริปต์จะข้ามรอบนั้น ("มีหน้าต่างอื่นบัง iVMS") แทนการอ่านผิด
- ปิด Sleep และ Screen lock (Power & sleep → Never) — จอดับได้ แต่ห้ามล็อก
- สคริปต์จะคลิกปุ่ม Refresh ทุกรอบ: อย่าใช้เมาส์เครื่องนี้ระหว่างรอบตรวจ (~30 วิ ทุก 5 นาที)

## ดูสถานะการ sync บนเครื่องนี้ (1.2.0)

- ระหว่าง sync ชื่อหน้าต่างที่ taskbar เป็น "🔄 iVMS กำลัง sync… อย่าใช้เมาส์" (~30–60 วิ)
- เสร็จแล้วมีแจ้งเตือน Windows มุมขวาล่าง: "✅ Sync complete" (จำนวนเครื่อง / Offline / Online / รอบถัดไป),
  "🟡 Sync ไม่ครบทุกเครื่อง", "⚠️ Sync ไม่สำเร็จ" พร้อมสาเหตุ หรือ "⚠️ Offline เกือบทั้งหมด"
- ไม่มี popup ตอนเริ่ม sync โดยตั้งใจ (จะทับ iVMS ทำให้อ่านไม่ได้)
- ถ้าไม่เห็นแจ้งเตือน: Settings › System › Notifications เปิด Notifications และอย่าเปิด Do not disturb

## เมื่อมีปัญหา

| อาการใน portal | เช็ก |
|---|---|
| แบนเนอร์แดง "ระบบตรวจหยุดทำงาน" | คอม HQ เปิดอยู่ไหม, Task ยังรันไหม, ดู `monitor.log` |
| "รอบตรวจล่าสุดอ่าน iVMS ไม่ได้" | ข้อความ error ในแบนเนอร์ / `monitor.log` เช่น ตารางไม่ได้เรียง Offline บนสุด |
| "จำนวนเครื่องไม่ตรงกัน" | แท็บ Rollout: ติ๊ก monitored ให้ครบตามเครื่องที่อยู่ใน iVMS |
| "สงสัยปัญหาฝั่งกลาง" | เน็ต HQ / Hik-Connect — ระบบไม่เปลี่ยนสถานะสาขาจนกว่าจะกลับปกติ |

**กติกาการ sync (1.1.0, 10 ต.ค. 2026):** HQ มี iVMS 2 บัญชี (จะรวมเป็นบัญชีเดียวภายหลัง)
- ทุกรอบสคริปต์อ่าน**ทุกแถว**ของบัญชีที่เปิดอยู่ แล้วอัปเดตเฉพาะสาขาที่เห็น (Online/Offline) + เวลา "อัปเดตล่าสุด"
- สาขาที่ไม่อยู่ในบัญชีที่เปิดอยู่ = ไม่แตะ คงสถานะ/เวลาเดิม → สลับบัญชีใน iVMS ได้ รอบถัดไปจะอัปเดตอีกชุด
- สาขาที่ไม่เคย sync เลย = ยังไม่อยู่ใน iVMS (ไม่มีกล้องให้เฝ้า) ดูได้ในแท็บ Rollout
- ตั้งรอบ sync ในหน้า Device Status › ตั้งค่า › ตรวจทุก (เช่น 30 นาที); ยืนยัน Offline ต้องเห็นติดกัน `confirm_cycles` รอบ

## ทดสอบกติกา (เครื่องไหนก็ได้)

```
pip install pytest openpyxl
python -m pytest test_state.py test_hpp_reader.py -q
```
ห้ามใส่ไฟล์ Export จริงไว้ใน repo (repo เป็น public และไฟล์มี Serial ทุกเครื่อง) — test ใช้ข้อมูลสมมติ
