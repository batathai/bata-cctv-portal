# Design — Device Offline Monitoring (iVMS reader)

Feature slug: `device-offline-monitoring`
Date: 2026-10-08
Plan: `docs/workflow/PLAN-device-offline-monitoring.md`
Status: **design ready — awaiting approval**
Mockups: Design canvas "Device Offline Monitoring — Design" — https://claude.ai/artifact/Bv4HZ4Cm7YQJ8rK5KB2sVp (6 artboards: สถานะสด, Store Detail + Mute, ประวัติ, Rollout + แบนเนอร์, ตั้งค่า, ตัวอย่างเมล — ข้อมูลในภาพเป็นข้อมูลจำลอง)

---

## 0. สรุปภาพรวม

```
 สาขา DVR ──(Hik-Connect cloud)──> iVMS-4200 บนคอม HQ (เปิด 24 ชม.)
                                        │  หน้า Cloud P2P Device เรียง Offline ไว้บนสุด
                                        ▼
                         tools/ivms-monitor/monitor.py  (ทุก 5 นาที)
                         1) กด Refresh → รอ 20 วิ → อ่าน 2 ครั้งห่าง 5 วิ ต้องตรงกัน
                         2) ได้: Total, รายการรหัสสาขา Offline, หน้าเต็มหรือไม่
                         3) คำนวณการเปลี่ยนสถานะ (state.py — ไม่ผูกกับ Windows ทดสอบได้)
                         4) เขียนขึ้น Supabase ด้วย service_role key (เก็บในเครื่องเท่านั้น)
                         5) ส่งเมลผ่าน Gmail 587/STARTTLS
                                        │
                                        ▼
            Supabase: store_monitor · device_outages · monitor_runs · monitor_settings
                                        │  (portal อ่านทุก 60 วิ)
                                        ▼
            Portal: /status (สถานะสด · ประวัติ · Rollout · ตั้งค่า) + Store Detail
```

- ตัดสินใหม่ 2026-10-08: **เวลาทำการมาตรฐาน 10:00–22:00** แก้รายสาขาได้
- ทาง FTP ในแผนเดิมไม่อยู่ในดีไซน์นี้ (เก็บเป็นทางสำรองตามแผน)
- portal ไม่ส่งเมลเอง และไม่มี backend ใหม่ — งานทั้งหมดที่ต้องรันเป็นรอบอยู่ในสคริปต์บนคอม HQ (รูปแบบเดียวกับ Xstore sync ที่ใช้อยู่)

---

## 1. กติกาการตัดสินสถานะ (หัวใจของระบบ)

### 1.1 หนึ่งรอบตรวจ (cycle)
| ผลการอ่าน | `monitor_runs.status` | ผลต่อสถานะสาขา |
|---|---|---|
| อ่านได้, 2 ครั้งตรงกัน, หน้าไม่เต็ม | `ok` | ตัดสินได้ทุกสาขาที่ monitored |
| อ่านได้ แต่ Offline เต็มหน้าจอ (≥ ~26 แถว) | `partial` | สาขาที่เห็นว่า Offline = Offline; สาขาที่ไม่เห็น = **คงสถานะเดิม ไม่อัปเดต last seen** |
| Offline ≥ 80% ของ Total (เน็ต HQ / Hik-Connect ล่ม) | `suspect` | **ไม่เปลี่ยนสถานะใคร** ส่งเมลเตือนปัญหาฝั่งกลาง |
| หาหน้าต่างไม่เจอ / อ่าน Total ไม่ได้ / 2 ครั้งไม่ตรงกัน | `failed` | ไม่เปลี่ยนสถานะใคร; ล้ม 3 รอบติด → เมลเตือนผู้ดูแล |

### 1.2 สถานะของแต่ละสาขา
```
                    ไม่ได้ติ๊ก monitored
  [Not monitored] ◀──────────────────────────── (ทุกสถานะ)
        │ ติ๊ก monitored / สคริปต์เห็นครั้งแรก
        ▼
   [Unknown] ──รอบ ok + ไม่อยู่ในรายการ Offline──▶ [Online]
        │                                           │  ▲
        │ เห็นใน Offline 2 รอบติด                     │  │ รอบ ok + ไม่อยู่ในรายการ Offline (1 รอบพอ)
        ▼                                           ▼  │
    [Offline] ◀─────── เห็นใน Offline 2 รอบติด ─────────┘
```
- **ยืนยัน Offline = เห็น 2 รอบติดกัน** (`confirm_cycles`, ตั้งค่าได้) ≈ 5–10 นาทีหลังหลุด กันหน้าจอยังไม่นิ่ง/หลุดแวบเดียว
- **กลับ Online = 1 รอบ** ที่สถานะ `ok`
- **last seen** = เวลารอบ `ok` ล่าสุดที่ยืนยันว่า Online → ใช้เป็น "เริ่มหลุด" ของประวัติ
- ถ้ารอบตรวจล่าสุดเก่ากว่า `stale_after_minutes` (15) → portal แสดงทุกสาขาเป็น **"ข้อมูลเก่า"** + แบนเนอร์แดง "ระบบตรวจหยุดทำงาน" แทนการขึ้น Offline ทุกสาขา

### 1.3 สาขาไหน monitored (ตอบคำถาม "รู้ได้ไงว่าใครอยู่ใน iVMS ถ้าเห็นแค่แถว Offline")
- iVMS บอกแค่ **Total** + แถว Offline จึงต้องมี **รายชื่อ monitored** ใน portal
- ตั้งต้น (ตอน `/implement`): ติ๊กจากสาขาที่มี `hikconnect_devices.ivms_account` อยู่แล้ว + ทีมตรวจในหน้า Rollout
- สาขาที่สคริปต์เห็นใน iVMS แต่ยังไม่ได้ติ๊ก → **ติ๊กให้อัตโนมัติ** และบันทึก `first_seen_at`
- ทุกรอบเทียบ `จำนวน monitored` กับ `iVMS Total` → ไม่เท่ากัน = แบนเนอร์เหลือง "iVMS มี 57 เครื่อง แต่ portal ติ๊กไว้ 55" ให้ไปตรวจในหน้า Rollout
- รหัส 5 หลักที่อ่านได้แต่ไม่ตรงกับ `stores.store_code` → เก็บใน `monitor_runs.unmatched` แสดงในหน้า Rollout (เช่นชื่อเครื่องใน iVMS พิมพ์รหัสผิด)

### 1.4 เวลาทำการ + กติกาส่งเมล (R5, R6, R8, R12)
เวลาทำการของสาขา = `store_monitor.open_time/close_time` ถ้าว่างใช้ค่ามาตรฐาน **10:00–22:00** (เวลาไทย)

| เหตุการณ์ | เงื่อนไข | เมล |
|---|---|---|
| หลุดในเวลาทำการ | `started_at` (last seen) อยู่ในเวลาทำการ | **ทันที** รายสาขา |
| หลายสาขาหลุดพร้อมกัน | ยืนยัน Offline ใหม่ในรอบเดียว ≥ `mass_alert_threshold` (10) หรือหน้าเต็ม | **ฉบับเดียว** สรุปทุกสาขา + เตือนอาจเป็นปัญหาฝั่งกลาง |
| กลับมา Online | เฉพาะการหลุดที่เคยส่งเมลทันทีไปแล้ว | ทันที รายสาขา (รวมเป็นฉบับเดียวถ้ากลับพร้อมกันหลายสาขา) |
| หลุดนอกเวลาทำการ | `started_at` นอกเวลาทำการ | ไม่ส่งทันที → รวมใน **เมลสรุปเช้า 10:00** (ดับกี่โมง, กลับกี่โมง/ยังไม่กลับ, นานเท่าไร) |
| เปิดร้านแล้ว 30 นาที ยังไม่ Online | ถึง `open_time + 30 นาที` ยัง Offline | ทันที (รวมเป็นฉบับเดียวต่อรอบตรวจ) |
| สาขา mute อยู่ | `muted_until > now()` | **ไม่ส่งเมลเลย** แต่ยังบันทึกประวัติ (ติดป้าย muted) |
| ระบบตรวจล้ม | `failed` 3 รอบติด / `suspect` | เมลถึงผู้ดูแลระบบ ("ตัวตรวจอ่าน iVMS ไม่ได้" / "อาจเป็นเน็ต HQ หรือ Hik-Connect") |

**ปรับ 2026-10-08 (ระหว่าง /test):** เมลแจ้งเตือนสาขา (หลุดใหม่ / กลับมา / เปิดร้านแล้วยังไม่ Online) **รวมเป็นเมลเดียวต่อรอบตรวจ** พร้อมรายชื่อที่ยัง Offline อยู่ทั้งหมด — ลดจำนวนเมลที่ระบบกรองเมลบริษัทอาจมองว่าส่งถี่ หัวเมลเป็นแบบ `[CCTV] Offline ใหม่ 2 · กลับมา 1 — Offline ตอนนี้ 7 สาขา (17:05)`; เมลสรุปเช้า / ปัญหาฝั่งกลาง / ระบบตรวจล้ม ยังแยกฉบับเหมือนเดิม

ตัวอย่างหัวเมลเดิมตอนออกแบบ (หน้าตาอยู่ใน canvas):
- `[CCTV Offline] 51403 Future Park · BKK 511 — หลุดตั้งแต่ 14:05`
- `[CCTV Online] 51403 Future Park กลับมาแล้ว — หลุด 1 ชม. 20 นาที`
- `[CCTV Offline ×12] หลายสาขาหลุดพร้อมกัน — อาจเป็นปัญหาฝั่งกลาง`
- `[CCTV สรุปเช้า] พฤ. 8 ต.ค. — DVR ดับนอกเวลาทำการ 19 สาขา`
- `[CCTV ยังไม่ Online] 3 สาขาเปิดร้านแล้ว 30 นาที`
- `[CCTV Monitor] ระบบตรวจอ่าน iVMS ไม่ได้ 3 รอบติดกัน`

---

## 2. Data model — `supabase/migrations/022_device_monitoring.sql`

> ใช้เลข **022** เพราะ 020/021 ถูกใช้แล้วบน branch `docs/installation-project-plan` (ยังไม่ merge) — กันชนกันตอน merge

### 2.1 `store_monitor` — 1 แถวต่อสาขา (สถานะปัจจุบัน + ตั้งค่ารายสาขา)
| column | type | หมายเหตุ |
|---|---|---|
| `store_id` | uuid PK → `stores(id)` on delete cascade | |
| `monitored` | boolean not null default false | อยู่ใน iVMS แล้ว / ให้ตรวจ |
| `state` | text not null default 'Unknown' check in ('Online','Offline','Unknown') | สคริปต์เขียน |
| `state_since` | timestamptz | เวลาเปลี่ยนสถานะล่าสุด |
| `last_seen_at` | timestamptz | รอบ ok ล่าสุดที่ยืนยัน Online |
| `offline_streak` | int not null default 0 | นับรอบที่เห็น Offline ติดกัน (ยืนยันที่ 2) |
| `current_outage_id` | uuid → `device_outages(id)` | การหลุดที่ยังไม่จบ |
| `ivms_device_name` | text | ชื่อที่ OCR อ่านได้ครั้งล่าสุด (ไว้ตรวจว่าผูกถูกเครื่อง) |
| `first_seen_at` | timestamptz | เห็นใน iVMS ครั้งแรก (rollout) |
| `open_time` / `close_time` | time | ว่าง = ใช้ค่ามาตรฐาน |
| `muted_until` | timestamptz | ปิดเตือนถึงเมื่อไร |
| `mute_reason` | text | บังคับกรอกเมื่อ mute |
| `muted_by` | uuid → `profiles(id)` | |
| `note` | text | |
| `updated_at` | timestamptz default now() | trigger `set_updated_at` |

### 2.2 `device_outages` — ประวัติการหลุด (R4, R10, R12)
| column | type | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `store_id` | uuid → `stores(id)` cascade | index (store_id, started_at desc) |
| `started_at` | timestamptz not null | = last seen ก่อนหลุด |
| `detected_at` | timestamptz not null | รอบที่ยืนยัน Offline |
| `ended_at` | timestamptz | ว่าง = ยังหลุดอยู่ |
| `duration_minutes` | int generated always as (extract(epoch from ended_at - started_at)/60) stored | |
| `during_business_hours` | boolean not null | ตัดสินจาก `started_at` + เวลาทำการของสาขา ณ ตอนนั้น |
| `muted` | boolean not null default false | |
| `central_suspect` | boolean not null default false | หลุดในรอบที่ส่งเมลแบบหลายสาขา |
| `alert_sent_at` / `recovery_alert_sent_at` / `late_open_alert_sent_at` / `summary_sent_at` | timestamptz | กันส่งซ้ำ |
| `note` | text | ทีมจดได้ เช่น "ห้างปิดซ่อมไฟ" |
| `created_at` | timestamptz default now() | index (started_at) |

### 2.3 `monitor_runs` — log ของสคริปต์ = heartbeat ของตัวตรวจ
`id`, `ran_at` timestamptz default now() (index desc), `status` check in ('ok','partial','suspect','failed'), `ivms_total` int, `offline_count` int, `page_full` bool, `monitored_count` int, `unmatched` text[], `error` text, `duration_ms` int, `script_version` text.
สคริปต์ลบแถวเก่ากว่า 30 วันเอง (~288 แถว/วัน)

### 2.4 `monitor_settings` — แถวเดียว (`id = 1`, check id = 1)
| column | default |
|---|---|
| `check_interval_minutes` | 5 |
| `confirm_cycles` | 2 |
| `default_open_time` / `default_close_time` | 10:00 / 22:00 |
| `late_open_grace_minutes` | 30 |
| `mass_alert_threshold` | 10 |
| `suspect_ratio` | 0.80 |
| `stale_after_minutes` | 15 |
| `alert_recipients` | text[] — **[ใส่รายชื่อทีม CCTV/IT]** |
| `admin_recipients` | text[] — ผู้ดูแลระบบตรวจ (เมลระบบล้ม) |
| `morning_summary_time` | 10:00 |
| `emails_enabled` | true (ปิดทั้งระบบได้ตอนทดสอบ) |
| `updated_at`, `updated_by` | |

### 2.5 RLS / สิทธิ์
- ทุกตาราง `enable row level security`
- **อ่าน:** `store_monitor`, `device_outages` ใช้ `public.can_access_store(s.zone, s.supplier_id)` แบบเดียวกับ migration 012; `monitor_runs`, `monitor_settings` อ่านได้เมื่อ role = `hq_admin`
- **เขียนจาก portal (hq_admin):**
  - `store_monitor`: insert/update ได้ แต่ **จำกัดคอลัมน์ด้วย GRANT** → แก้ได้แค่ `monitored, open_time, close_time, muted_until, mute_reason, muted_by, note` (portal แก้ `state`/`last_seen_at` เองไม่ได้)
  - `device_outages`: update ได้เฉพาะ `note`
  - `monitor_settings`: update ได้ทุกช่องยกเว้น `id`
  - ไม่มี delete จาก portal
- **สคริปต์:** ใช้ `service_role` (ข้าม RLS) — key อยู่ในไฟล์ `.env` บนคอม HQ เท่านั้น ห้ามอยู่ใน repo/portal
- `stores.online_status` เดิม: สคริปต์ **เขียนทับให้ตรงกับ state เฉพาะสาขาที่ monitored** (ตอบ risk 9) สาขาที่ไม่ monitored ไม่แตะ; `overall_status` (สุขภาพกล้อง) ไม่แตะ

---

## 3. ฝั่งคอม HQ — `tools/ivms-monitor/`

| ไฟล์ | หน้าที่ |
|---|---|
| `ivms_reader.py` | ยกมาจาก `probe_ocr.py` v6 + `probe_refresh.py`: หาหน้าต่าง, กด Refresh, รอ 20 วิ, OCR 2 ครั้งห่าง 5 วิ, คืน `ReadResult(total, offline=[(code,name)], page_full)` หรือ error |
| `state.py` | **logic ล้วน ไม่แตะ Windows/เน็ต**: รับสถานะเดิม + ผลอ่าน + settings + เวลา → คืนรายการสิ่งที่ต้องเขียน และเมลที่ต้องส่ง |
| `test_state.py` | pytest ครอบทุกแถวในตาราง 1.1/1.4 (รันได้ทุกเครื่อง ไม่ต้องมี iVMS) |
| `supa.py` | อ่าน/เขียน Supabase ผ่าน REST (`requests`) ด้วย service_role |
| `notify.py` | Gmail SMTP 587/STARTTLS + แม่แบบเมล 6 แบบ (HTML + ข้อความล้วน) |
| `monitor.py` | loop หลัก: อ่าน settings ทุกรอบ, รันทุก `check_interval_minutes`, ส่งสรุปเช้า, บันทึก `monitor_runs`, ลบ run เก่า |
| `.env.example` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (`.env` จริงอยู่ใน `.gitignore` แล้ว) |
| `README.md` | ติดตั้งบนคอม HQ: pip, ตั้ง Task Scheduler "At log on" + Run with highest privileges + restart on failure, ปิด sleep/lock, iVMS เปิดค้างหน้า Cloud P2P เรียง Offline บนสุด |

กันพัง:
- Supabase ต่อไม่ได้ → ข้ามรอบนั้น ไม่เก็บผลไว้ส่งย้อน (ปรับระหว่าง /implement 2026-10-08: ผลอ่านเก่าที่ส่งย้อนจะทำให้เวลาหลุด/กลับเพี้ยนและส่งเมลผิดเวลา) — portal เห็นว่าตัวตรวจเงียบและขึ้นแบนเนอร์แดงเอง
- สคริปต์ crash → Task Scheduler รันใหม่; portal เห็นจาก `monitor_runs` ว่าเงียบ (แบนเนอร์แดง)
- ไม่เคยกดปุ่มอื่นใน iVMS นอกจาก Refresh

---

## 4. หน้าจอ (mockup ใน canvas)

### 4.1 `/status` — เพิ่มเมนู **Device Status** ใน Sidebar (ตอนนี้หน้านี้ไม่มีลิงก์ในเมนู)
4 แท็บ:

1. **สถานะสด** (หน้าแรก)
   - แถบสุขภาพตัวตรวจ: "ตรวจล่าสุด 13:05 · ทุก 5 นาที · iVMS 57 เครื่อง" (เขียว) / แดงเมื่อเงียบ > 15 นาที / เหลืองเมื่อจำนวนไม่ตรง หรือรอบล่าสุด partial
   - KPI: Offline · Online · Muted · เฝ้าอยู่ 57/194 (กดเพื่อกรอง)
   - กรอง: ภาค (ทั้งหมด / BKK 511 512 513 550 / UPC 520 530 540 560) → เขต, ค้นหา, สถานะ
   - ตาราง: รหัส, สาขา, เขต, สถานะ (Online / Offline / Muted / Not monitored / ข้อมูลเก่า), **Last seen**, **หลุดมานาน**, เวลาทำการ, ปุ่ม Details / Mute
   - เรียง: Offline ก่อน (นานสุดบนสุด) → Muted → Online → Not monitored
   - ใช้ลูกเล่นจาก demo เมื่อวาน (จุดแดงกะพริบ, แถวเรืองแสงตอนเปลี่ยน) และปิดเองเมื่อเครื่องตั้ง "ลดการเคลื่อนไหว"
2. **ประวัติการหลุด** — ช่วงวัน, ภาค/เขต, สาขา, "เฉพาะนอกเวลาทำการ", "รวม muted"; ตาราง + KPI (ครั้ง, รวมชั่วโมง, ในเวลาทำการ, นอกเวลา) + **Export Excel**
3. **Rollout** — แถบ 57/194, แยกตามเขต, รายชื่อที่ยังไม่ monitored (ติ๊กได้), รหัสที่ iVMS อ่านได้แต่ไม่ตรงสาขา, จำนวน monitored vs iVMS Total
4. **ตั้งค่า** — ผู้รับเมล 2 กลุ่ม, เวลาทำการมาตรฐาน, ค่าตัวเลขในข้อ 2.4, สวิตช์เปิด/ปิดเมล

### 4.2 Store Detail (`/recovery/[code]`) — การ์ด "Device Status" เดิม
- สถานะสด + last seen + หลุดมานาน + ชื่อเครื่องใน iVMS
- เวลาทำการของสาขา (แก้ได้, ปุ่ม "ใช้ค่ามาตรฐาน")
- Mute: เหตุผล (บังคับ) + ถึงวันที่ (บังคับ, สูงสุด 30 วัน) / ปลด mute
- ประวัติ 10 ครั้งล่าสุด + ลิงก์ "ดูทั้งหมด" ไปแท็บประวัติที่กรองสาขานี้

### 4.3 สถานะในหน้าอื่น
- `/status` เดิมใช้ `overall_status` (Healthy/Partial/Offline/Unknown = สุขภาพกล้องจาก Survey) → ย้ายไปเป็นป้ายรองในแถว ("กล้อง: Partial") ไม่ปนกับ Online/Offline

---

## 5. Exports — `src/lib/reports/exportOutagesExcel.ts`
client-side `xlsx` (`json_to_sheet`) แบบเดียวกับ `exportExcel.ts`:
- **Outages**: รหัส, สาขา, ภาค, เขต, เริ่มหลุด, ตรวจพบ, กลับมา, นาน (นาที), ในเวลาทำการ, muted, ส่งเมลแล้ว, หมายเหตุ
- **By Store**: จำนวนครั้ง, รวมนาที, ครั้งในเวลาทำการ, ครั้งนอกเวลา, หลุดนานสุด
- **After-hours** (R12): สาขาที่ DVR ดับนอกเวลาทำการ — จำนวนคืน, วันล่าสุด, เวลาดับเฉลี่ย

---

## 6. Files to touch

**ใหม่**
- `supabase/migrations/022_device_monitoring.sql`
- `src/lib/monitoring.ts` — helper ล้วน: เวลาทำการที่ใช้จริง, สถานะที่แสดง (รวม stale/not monitored/muted), จัดเรียง, format ระยะเวลาไทย
- `src/lib/monitoringWrite.ts` — mute/unmute, ตั้งเวลาทำการ, ติ๊ก monitored, บันทึก settings, note ของ outage
- `src/lib/reports/exportOutagesExcel.ts`
- `src/components/status/` — `MonitorHealthBanner.tsx`, `LiveStatusTab.tsx`, `OutageHistoryTab.tsx`, `RolloutTab.tsx`, `MonitorSettingsTab.tsx`, `MuteDialog.tsx`, `BusinessHoursEditor.tsx`, `StoreMonitorCard.tsx`
- `tools/ivms-monitor/`: `ivms_reader.py`, `state.py`, `test_state.py`, `supa.py`, `notify.py`, `monitor.py`, `.env.example`, `README.md`

**แก้**
- `src/types/database.ts` — `StoreMonitor`, `DeviceOutage`, `MonitorRun`, `MonitorSettings`
- `src/lib/data.ts` — `fetchStoreMonitors`, `fetchOutages(from,to)`, `fetchLatestRun`, `fetchMonitorSettings`
- `src/lib/mockData.ts` — ข้อมูลจำลองให้ demo ทำงานได้โดยไม่ต่อ Supabase
- `src/components/providers/MonitoringProvider.tsx` (ใหม่, แทนการเพิ่มใน AppDataProvider ที่ยาว 700+ บรรทัด) — state + poll ทุก 60 วิ (เฉพาะ monitor + run ล่าสุด) ครอบใน `src/app/(portal)/layout.tsx`
- `src/app/(portal)/status/page.tsx` — เขียนใหม่เป็น 4 แท็บ
- `src/app/(portal)/recovery/[code]/page.tsx` — ใช้ `StoreMonitorCard` แทนการ์ด Device Status เดิม
- `src/components/layout/Sidebar.tsx` — เพิ่ม Device Status
- `.gitignore` ของ `tools/ivms-monitor/` — เพิ่ม `queue.jsonl`, `*.log`
- `CLAUDE.md` บน branch นี้ — แทนด้วยฉบับของ portal (ฉบับที่แก้แล้วบน branch installation)

ไม่แตะ: `overall_status` logic, หน้า Survey/Assets/Work Orders

---

## 7. Traceability

| Req | ครอบที่ | หมายเหตุ |
|---|---|---|
| R1 ผูกเครื่องกับสาขา | 1.3, `store_monitor.ivms_device_name`, `monitor_runs.unmatched`, แท็บ Rollout | ผูกด้วยรหัส 5 หลักในชื่อเครื่อง iVMS; **เทียบ serial ยังไม่ทำ** (ต้องเช็กว่าหน้า Cloud P2P มีคอลัมน์ serial ให้ OCR อ่านได้ไหม) |
| R2 รับ heartbeat | 1.2 `last_seen_at` จากรอบ ok | ปรับความหมายจาก "ไฟล์ FTP" เป็น "รอบอ่าน iVMS" |
| R3 ตรวจเป็นรอบ | 1.1, 1.2, settings `check_interval_minutes`, `confirm_cycles` | threshold แบบ "เงียบ 30 นาที" → แทนด้วย "Offline 2 รอบติด" (≈10 นาที) ตั้งค่าได้ |
| R4 ประวัติการหลุด | `device_outages` | |
| R5 เมลหลุด/กลับ | 1.4, `notify.py` | |
| R6 กันเมลท่วม | 1.1 `suspect`/`partial`, 1.4 mass, แบนเนอร์ stale | |
| R7 แสดงใน portal | 4.1, 4.2 | Not monitored แยกจาก Offline |
| R8 mute | `muted_until/mute_reason`, MuteDialog | |
| R9 Rollout tracker | แท็บ Rollout, `first_seen_at` | |
| R10 รายงาน Excel | ข้อ 5 | |
| R11 รูปล่าสุด | **ไม่ครอบ** | ทาง iVMS ไม่ได้รูปจากกล้อง → เสนอตัดออก หรือย้ายไปพร้อมทาง FTP ถ้าใช้ในอนาคต |
| R12 เวลาทำการ + กติกาแจ้ง | 1.4, `open_time/close_time`, ค่ามาตรฐาน 10:00–22:00, sheet After-hours | |

---

## 8. คำถามที่ยังเปิด (ไม่บล็อก `/implement` — ใส่ค่าเริ่มต้นไว้แล้ว แก้ได้ในหน้าตั้งค่า)
1. รายชื่อผู้รับเมล 2 กลุ่ม (`alert_recipients`, `admin_recipients`)
2. iVMS export รายชื่อเครื่องเป็นไฟล์ได้ไหม (ถ้าได้ ใช้ตั้งต้นรายชื่อ monitored แทนการติ๊กมือ)
3. หน้า Cloud P2P มีคอลัมน์ serial ไหม (สำหรับ R1 เต็มรูปแบบ)
4. ใครเฝ้าเมื่อคอม HQ ดับตอนกลางคืน — ตอนนี้รู้จากแบนเนอร์ใน portal เท่านั้น; ทางเลือกฟรีภายหลัง: GitHub Actions ตามเวลา เช็ก `monitor_runs` แล้วส่งเมล
