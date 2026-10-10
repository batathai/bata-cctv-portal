# ivms-monitor — ตัวเฝ้า DVR สาขาจาก iVMS-4200

สคริปต์บนคอม HQ ที่เปิด iVMS-4200 ค้างไว้ 24 ชม. ทุก 5 นาทีจะกด Refresh ในหน้า **Cloud P2P Device**
อ่านรายการเครื่องที่ Offline จากภาพหน้าจอ แล้วส่งผลขึ้น Supabase ให้หน้า **Device Status** ใน portal
และส่งเมลแจ้งเตือนผ่าน Gmail

ดีไซน์ทั้งหมด: `docs/workflow/DESIGN-device-offline-monitoring.md`

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `monitor.py` | ตัวหลัก รันต่อเนื่อง |
| `ivms_reader.py` | กด Refresh + อ่านหน้าจอ iVMS (Windows OCR + สีไอคอน) อ่าน 2 ครั้งต้องตรงกัน |
| `state.py` | กติกาตัดสิน Online/Offline และเลือกเมล (ไม่แตะ Windows/เน็ต) |
| `test_state.py` | ชุดทดสอบกติกา |
| `supa.py` | อ่าน/เขียน Supabase ด้วย service_role |
| `notify.py` | ส่งเมล Gmail 587/STARTTLS |
| `probe_*.py` | สคริปต์ทดสอบความเป็นไปได้เมื่อ 7 ต.ค. (เก็บไว้อ้างอิง) |

## ติดตั้งครั้งแรก (คอม HQ)

1. ต้องรัน `supabase/migrations/022_device_monitoring.sql` ใน Supabase SQL Editor ก่อน
2. ติดตั้ง Python 3.10 ขึ้นไป แล้วเปิด **Command Prompt แบบ Run as administrator**
   ```
   cd <โฟลเดอร์ repo>\tools\ivms-monitor
   pip install -r requirements.txt
   ```
3. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` (และ `PORTAL_URL` ถ้าอยากให้เมลมีปุ่มลิงก์)
4. เปิด iVMS-4200 → Maintenance and Management → Device → **Cloud P2P Device**
   แล้ว**คลิกหัวคอลัมน์ Resource Usage Status 1 ครั้ง** ให้เครื่อง Offline อยู่บนสุด (ลำดับนี้ค้างหลัง Refresh)
5. ทดสอบอ่านอย่างเดียว: `python ivms_reader.py` → ควรเห็น `ReadResult(ok=True, total=57, ...)`
6. ทดสอบทั้งรอบโดยไม่เขียนข้อมูลและไม่ส่งเมล: `python monitor.py --once --dry-run`
7. ใน portal → Device Status › ตั้งค่า ใส่**ผู้รับเมล** (แนะนำปิด "ส่งเมลแจ้งเตือน" ไว้ก่อนวันแรก)
8. รันจริง 1 รอบ: `python monitor.py --once` → หน้า Device Status ควรขึ้นแถบเขียว "ตัวตรวจทำงานปกติ"

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

## เมื่อมีปัญหา

| อาการใน portal | เช็ก |
|---|---|
| แบนเนอร์แดง "ระบบตรวจหยุดทำงาน" | คอม HQ เปิดอยู่ไหม, Task ยังรันไหม, ดู `monitor.log` |
| "รอบตรวจล่าสุดอ่าน iVMS ไม่ได้" | ข้อความ error ในแบนเนอร์ / `monitor.log` เช่น ตารางไม่ได้เรียง Offline บนสุด |
| "จำนวนเครื่องไม่ตรงกัน" | แท็บ Rollout: ติ๊ก monitored ให้ครบตามเครื่องที่อยู่ใน iVMS |
| "สงสัยปัญหาฝั่งกลาง" | เน็ต HQ / Hik-Connect — ระบบไม่เปลี่ยนสถานะสาขาจนกว่าจะกลับปกติ |

**ข้อควรรู้:** iVMS แสดงแค่ยอดรวมกับแถว Offline สคริปต์จึงรู้ชื่อเครื่องเฉพาะตอนที่มันหลุด
สาขาที่ติ๊ก monitored แต่ไม่ได้อยู่ใน iVMS จริงจะขึ้น Online ตลอด — ดูตัวเลข "iVMS Total" กับ "ติ๊ก monitored" ในแท็บ Rollout ให้ตรงกันเสมอ

## ทดสอบกติกา (เครื่องไหนก็ได้)

```
pip install pytest
python -m pytest test_state.py -q
```
