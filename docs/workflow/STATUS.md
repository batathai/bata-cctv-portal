# Workflow Status
Feature: Device Offline Monitoring (iVMS reader)
Phase: /test in progress (HQ script verified end-to-end on 2026-10-08)
Design approved: yes — 2026-10-08 — DESIGN-device-offline-monitoring.md as written (iVMS reader, migration 022, 4-tab /status, Store Detail card, confirm Offline after 2 cycles, 10:00–22:00 default hours, R11 dropped from phase 1)
Updated: 2026-10-10

## Done
- Plan: docs/workflow/PLAN-device-offline-monitoring.md (R1–R12)
- M0 feasibility 2026-10-07: iVMS-4200 Cloud P2P page read by screenshot + Windows OCR + icon colour (27/27 rows; Offline-first sort; scripted Refresh works)
- Decisions: DVR must run 24h (R12); standard hours 10:00–22:00 editable per store (2026-10-08)
- Design approved 2026-10-08; mockups https://claude.ai/artifact/Bv4HZ4Cm7YQJ8rK5KB2sVp
- **Implemented 2026-10-08**
  - DB: `supabase/migrations/022_device_monitoring.sql` — `store_monitor` (row per store, seeded + trigger for new stores, monitored seeded from `hikconnect_devices.ivms_account`), `device_outages`, `monitor_runs`, `monitor_settings`; RLS + column-level GRANTs (portal can only edit monitored/hours/mute/note + settings); helper `is_hq_admin()`
  - Portal data: `src/types/database.ts`, `src/lib/data.ts` (`fetchMonitoringSnapshot`, `fetchOutages` paged past 1,000 rows; no mock fallback when Supabase is configured), `src/lib/monitoring.ts` (display rules, hours, durations, validation), `src/lib/monitoringWrite.ts`, demo data in `src/lib/mockData.ts`
  - `src/components/providers/MonitoringProvider.tsx` — polls every 60 s while the tab is visible; mounted in `src/app/(portal)/layout.tsx`
  - Screens: `src/app/(portal)/status/page.tsx` rewritten with 4 tabs (`?tab=history|rollout|settings`); `src/components/status/*` (health banner, live table, history + Excel, rollout, settings, mute dialog, hours editor, Store Detail card); Store Detail (`/recovery/[code]`) gets the iVMS card, old card renamed "Camera Health (Survey)"; Sidebar gets "Device Status" with offline count
  - Export: `src/lib/reports/exportOutagesExcel.ts` (Outages / By Store / After-hours sheets)
  - HQ script `tools/ivms-monitor/`: `state.py` (pure rules), `test_state.py` (19 tests), `ivms_reader.py` (from probe v6 + refresh probe, double read), `supa.py`, `notify.py`, `monitor.py` (`--once`, `--dry-run`), `README.md` (install + Task Scheduler), `.env.example`, `requirements.txt`; `.env`/logs git-ignored
- Checks run here: `npx tsc --noEmit` 0 errors · `npm run lint` clean · `npm run build` passes (Google Fonts mocked — sandbox has no internet) · `pytest test_state.py` 19/19 · migration parsed OK by a Postgres parser (pglast) · one monitor cycle smoke-tested with fake Supabase/mailer · demo-mode screenshots of all 4 tabs + Store Detail, no runtime errors

## Decision 2026-10-10 14:13 — sync whatever iVMS account is open (user)
- HQ has 2 iVMS accounts (to be merged into one later). Rule from now: every store the script sees gets the status it sees (Online/Offline) and a fresh last-seen time; stores not visible in the account open right now are left untouched (keep status + last-seen). A store never synced = no camera in iVMS yet, visible on the web
- Interval: 30 min, set in Device Status › ตั้งค่า (no code change)
- Consequence for code: (1) the reader must read ALL rows, not just page one (~26) — needs a way to scroll the iVMS table; (2) `state.py` must stop marking every not-seen monitored store Online (today's rule assumes one account and an Offline-first first page)
- Step 1 = `tools/ivms-monitor/probe_scroll.py`: tests clicking the scrollbar track and dragging the thumb (wheel / Page Down were ignored on 7 Oct). Waiting for the user to run it on the Design PC
- Probe result 14:16: **clicking the scrollbar track below the thumb scrolls one page** (page 1 = 25 rows, page 2 = 27 new rows); dragging the thumb does nothing
- **ivms-monitor 1.1.0** (implemented 14:30): `ivms_reader.py` scrolls to top, reads every page (each page read twice 1.5 s apart, must match), clicks the track for the next page until rows seen = Total, scrolls back to top; returns `online` + `offline` + `complete`. `state.py`: when `online` is present, only stores seen are updated (seen Offline → streak/confirm as before; seen Online → Online, closes outage), every seen store is auto-ticked and gets `last_checked_at`; stores not seen are untouched; incomplete read = `partial`. 5 new tests (25/25). Paging loop simulated against a fake 67-row table (from top and from bottom: 67/67, ends at top)
- Migration `023_store_monitor_last_checked.sql` adds `store_monitor.last_checked_at`; script skips the column until it exists. Live table column "Last seen" → "อัปเดตล่าสุด" (last_checked_at, falls back to last_seen_at)
- Not tested on Windows yet: real scrollbar detection across 3 pages, and returning to the top
- The 56 BKK stores ticked from the 8 Oct list will then simply show last seen 8 Oct (true), no list cleanup needed

## Fix 2026-10-10 13:40 — reader refuses to read when iVMS is covered (`ivms-monitor` 1.0.1)
- Symptom on the Design PC: 8 stores seen Offline every run but never confirmed; web not updating. Cause: the Command Prompt window overlapped the iVMS table. When Windows blocks bringing iVMS to the front, the screenshot shows that window instead of the status icons → "ไม่เจอปุ่ม Refresh" or a false "Offline 0" read that resets every streak (also explains the wrong 12:42 "กลับมา 6" email)
- `ivms_reader.py`: `_check_unobstructed()` samples 42 points across the iVMS window with `WindowFromPoint`; any point owned by another process → ReaderError → run status `failed` (no state change). Checked before the Refresh click and before both reads; iVMS is brought to front again after the 20 s settle
- README: minimise the Command Prompt that runs the script
- Tested here with stubs only (no Windows); needs a run on the Design PC
- Confirmed on the Design PC 13:49–13:51: the check fires ("มีหน้าต่างอื่นบัง iVMS ('Administrator: Command Prompt - python monitor.py')") and the round is skipped instead of misread
- 1.0.3 (13:59): iVMS showed 10 Offline, script read 8. The two missed — 52002 "CentralPlaza Chiang Rai", 53023 "TOPS Plaza Phol" — are named without " - " in iVMS and `CODE_RE` required the dash, so those rows were skipped silently. Dash now optional. Web check at 13:59: the 8 read stores are Offline on /status as expected
- 1.0.2: the script minimises its own console window before each read (`_minimize_own_console`). Thai in the console looks broken because of the console font; `monitor.log` is UTF-8 and reads fine in Notepad

## Change 2026-10-10 (afternoon) — Device Status tweaks after first live look (user request)
- Live tab actions are icon buttons now: wrench (open repair ticket), file (Details → /recovery/[code]), bell-off/bell (Mute / unmute), each with tooltip + aria-label
- Wrench shows only when a DVR is Offline ≥ `REPAIR_SUGGEST_MINUTES` (120, in `src/lib/monitoring.ts`) and the user can log maintenance. Red = no open ticket → `/assets/[code]?newTicket=NVR Offline&note=…#tickets`, which opens the New Ticket form pre-filled (nothing is saved until Create Ticket). Grey = store already has an open ticket → links to it
- Page subtitle "สถานะ DVR ของสาขา อ่านจาก iVMS-4200 ที่ HQ อัตโนมัติ" removed
- Health banner: shown only when screen data can't be trusted (stale / never / notInstalled / suspect). ok, one failed read, page full and count mismatch now show only the "โหลดใหม่" button (admin still gets the 3-failures email; mismatch still visible in Rollout)
- Files: `src/components/status/LiveStatusTab.tsx`, `src/components/status/MonitorHealthBanner.tsx`, `src/app/(portal)/status/page.tsx`, `src/lib/monitoring.ts`, `src/components/assets/TicketsCard.tsx`, `src/app/(portal)/assets/[code]/page.tsx`
- First run on the Design PC (10 Oct 12:42–12:56): reader OK (Total 67); 12:42 read 0 Offline because the table was not yet sorted → 6 outages closed wrongly + a wrong "กลับมา 6" email; 12:51/12:56 failed "ไม่เจอปุ่ม Refresh" (iVMS window covered by another window). Open issue: detect an unsorted table when no Offline row is visible (check the sort arrow on the Resource Usage Status header)

## Addition 2026-10-10 — DVR dot in Asset Register (user request, branch `feat/asset-register-device-dot`)
- User wanted the iVMS Online/Offline result visible from Asset Register. Its Status column is camera health (`overall_status`, Survey/manual) and stays untouched
- A full "DVR (iVMS)" column was built first, then dropped by the user: it duplicated /status and put two "Online" pills side by side
- Agreed version: a small coloured dot before the store name (green Online · red Offline · amber กำลังยืนยัน · grey ปิดเตือน · brown ข้อมูลเก่า · no dot = not in iVMS), a one-line legend under the title, tooltip + screen-reader text on every dot; store Details shows "● DVR Offline · หลุดมา 22 นาที" with a link to `/recovery/[code]`
- Data from `store_monitor` via `MonitoringProvider` (polls every 60 s) — no script change, no migration
- Files: new `src/components/status/DeviceDot.tsx`; `src/app/(portal)/assets/page.tsx`; `src/app/(portal)/assets/[code]/page.tsx`
- Checks: `tsc` 0 errors · lint clean · `npm run build` passes (fonts mocked) · demo-mode screenshots desktop + 390 px, no runtime errors
- Run machine: CENTERSUPPPORT dropped (kept for the VM work); `monitor.py` runs by hand on the Design PC for now

## /test — 2026-10-08 (on the office PC with iVMS, user admin.danai)
- Python 3.14 + winsdk builds fine; `pip install -r requirements.txt` OK
- `ivms_reader.py` passed after 2 fixes (Win32 bring-to-front fallback; clearer "not sorted" error): ok=True, Total 57, 7 Offline, double read matches
- Supabase: migration 022 run; `SUPABASE_URL` with `/rest/v1` caused 404 PGRST125 → supa.py now strips it
- `hikconnect_devices` is empty in production → no monitored seed; ticked 56 stores by SQL from the 57-device list (2 Sep chat). 51545 Robinson Samut Prakan = unmatched code (master has 51501)
- Real cycles: 1st run streak only; 2nd run new_outages=6, monitor_updates=56 (state + outages rows correct)
- **Email solved 17:53:** the company filter drops mail that has BOTH a custom From display name AND an HTML part (tests D–H + every alert); plain-address + HTML always passes (test C). notify.py now sends without a display name → combined alert "[CCTV] Offline ใหม่ 6 — Offline ตอนนี้ 6 สาขา" arrived in Outlook folder "Noti CCTV" (Outlook rule files batacctv.center mail there)
- (history) Email: Gmail SMTP sends OK (in Sent), but delivery to danai.makmee@bata.com looked inconsistent — test A/B/C at 17:29 arrived (Outlook rule files them in "Noti CCTV"), alert batches 17:07/17:33 and tests D–H at 17:37 did not. Not content-related → likely corporate filter behaviour (burst / quarantine). Added Date + Message-ID headers; alerts now ONE combined email per cycle (design doc updated)
- Not yet done: Task Scheduler on the 24h machine; overnight run (after-hours outages, 10:00 morning summary, late-open at 10:30); portal screens not deployed (branch only)

## Waiting on
- (optional) IT allow-list for batacctv.center@gmail.com — no longer blocking; delivery works without a display name
- Decide which PC runs 24h (only ONE machine may run monitor.py)

## Adjustments made during /implement (recorded in the design doc)
- No `queue.jsonl` replay when Supabase is unreachable: replaying old reads would backdate transitions and send emails at the wrong time; the cycle is skipped and the portal's "ระบบตรวจหยุดทำงาน" banner covers it
- Monitoring state lives in a separate `MonitoringProvider` instead of growing `AppDataProvider` (700+ lines)
- During a "suspect" cycle the script still records device names / auto-ticks stores it sees, but never touches state, last seen or streaks
- `CLAUDE.md` NOT replaced on this branch: copying the installation branch's version would describe code that isn't here and conflict at merge. Fix after both branches are merged (add a Device Monitoring section)

## Open issues
- Migration 022 not yet run on the real Supabase project (user runs it in SQL Editor)
- HQ PC setup not done yet: Python deps, `.env`, Task Scheduler (see tools/ivms-monitor/README.md); `ivms_reader.py` can only be tested on the HQ PC (Windows OCR + iVMS)
- Alert recipients still empty — set in Device Status › ตั้งค่า (suggest emails off for the first day)
- R1 serial check not covered — need to see whether Cloud P2P page shows a serial column
- Stores ticked as monitored but not really in iVMS will show Online forever — keep "iVMS Total" = "ticked monitored" (Rollout tab shows both)
- Nobody watches when the HQ PC dies at night except the portal banner — later option: scheduled GitHub Action checks monitor_runs and emails
- Only 57 of 194 stores are in iVMS — adding devices is manual work that can start now
- Flag to management: some stores switch DVRs off at closing (no night recording)
- Other feature in progress: Installation Project at /test on branch `docs/installation-project-plan`
- This session cannot push to GitHub — user applies the patch and pushes

## Next step
Finish `/test`: Task Scheduler on the 24h PC, check the overnight run + 10:00 morning summary tomorrow, add real recipients (CCTV/IT team) to monitor_settings; then `/review` → `/security` → `/audit` → `/release` to put the portal screens live
