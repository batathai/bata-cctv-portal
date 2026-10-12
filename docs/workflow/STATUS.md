# Workflow Status
Feature: Device Offline Monitoring (iVMS reader)
Phase: /test in progress (HQ script verified end-to-end on 2026-10-08)
Design approved: yes — 2026-10-08 — DESIGN-device-offline-monitoring.md as written (iVMS reader, migration 022, 4-tab /status, Store Detail card, confirm Offline after 2 cycles, 10:00–22:00 default hours, R11 dropped from phase 1)
Updated: 2026-10-12

## Change 2026-10-12 14:40 — red wrench after 1 day offline (user)
- `REPAIR_SUGGEST_MINUTES` 120 → 1440 (`src/lib/monitoring.ts`), new `REPAIR_SUGGEST_LABEL` "1 วัน" used in the Device Status and Dashboard footnotes. Affects the red wrench everywhere (Device Status, Asset Register, Dashboard) and the Dashboard Repair card's DVR count. Amber wrench (camera issue) unchanged
- Checks: tsc 0 · lint clean

## Fix 2026-10-12 13:45 — Work Order Pipeline counted stores with no work order (user saw ~83 in "Waiting Vendor Quote")
- Cause: `deriveRecoveryStatus()` returned "Device Not Registered" whenever a store had no `hikconnect_devices` row, and that table is empty in production → almost every store `needsRepair()` → defaulted to stage "Waiting Vendor Quote". Same rule produced the stale remark "Device never registered to Hik-Connect / iVMS" (e.g. 51403 Future Park, Online)
- `deriveRecoveryStatus()`: only a hikconnect row with an empty `ivms_account` means not registered; no row = unknown (iVMS sync is the source of truth now)
- New `hasWorkOrder()` (open ticket or `recovery_stage` set); the Dashboard pipeline uses it instead of `needsRepair()`
- Partial 27 / Repair "กล้อง 22" look too high: `camera_issue` was seeded on 11 Oct from every store Partial at the time, many from the Survey era for other reasons. Review SQL: `scripts/sql/2026-10-12-review-camera-issue.sql` (step 1 list + suggestion, step 2 backup table, step 3 clear confirmed codes by setting Healthy → 024 trigger clears the flag, step 4 optional: clear stored `recovery_status = 'Device Not Registered'` for stores the sync has seen, rollback block). Not run yet — user runs it
- Checks: tsc 0 · lint clean · build passes · SQL parsed (5 statements) · demo Dashboard unchanged (mock stores all have stages), no runtime errors

## Merge 2026-10-12 — Installation Project merged into this branch (user)
- User asked where Work Orders › Timeline / Kanban went: they live on `docs/installation-project-plan` (never merged), and PR #2 was branched from `main`. That branch is now merged here so one branch carries both features
- Conflicts resolved: `src/lib/data.ts` (kept both the monitoring and the installation fetchers), `src/lib/mockData.ts` (both type imports), this file (Installation status kept below)
- Migrations on this branch: 020–021 Installation, 022–024 Device Monitoring (numbers were reserved, no clash). Store closure must use **025**
- `CLAUDE.md` now comes from the installation branch (the real portal guide); the Payslip copy is gone. Device Monitoring section still to add
- Installation Project is still at `/test` — finish its manual checklist before `/release`

## Change 2026-10-12 — Dashboard uses the same DVR status as Device Status (user)
- Cause of "Dashboard Offline 76 vs Device Status ~14": Dashboard counted `stores.overall_status`; the sync only rewrites it for stores it sees, so stores never in iVMS kept their old manual/Survey Offline
- Dashboard now builds `buildLiveRows()` like the Device Status table. Counting moved to `src/lib/monitoring.ts` (`countLiveStatuses`, `matchesLiveStatus`) and Device Status uses it too, so the two pages can't drift apart
- Cards: Stores Checked · Online · Partial ("DVR Online แต่ดูกล้องไม่ได้" = CameraIssue) · Offline (incl. Muted) · **Not monitored** (was Unknown; never seen in iVMS) · **Repair = option ข** (user 2026-10-12): red wrench (DVR Offline ≥ 2 h) or amber wrench (Partial) with no open ticket yet — `pendingRepairKind()` in `RepairLink.tsx`; hint shows the DVR / camera split
- Donut "DVR Status" = Online / Partial / Offline / Not monitored (same colours). Store List shows the Device Status pill + repair wrench instead of the overall_status badge. Old `?status=Healthy|Partial|Unknown` links map to the new buckets
- `StatCard` gained an optional `hint` line
- "Unknown" (monitored but not read yet) belongs to no card, same as Device Status
- Checks: `tsc` 0 errors · lint clean · `npm run build` passes (Google Fonts mocked) · demo mode: Dashboard 4/20/3/23 = Device Status 4/20/3/23, Repair filter → 1 row (51305, amber wrench), 390 px OK, no console errors
- Migration 024 confirmed run on the real Supabase by the user
- Not done (later): Motion on the Dashboard; 3D map hero draft (Design canvas "Dashboard DVR + Motion — แบบร่าง") paused by the user

## Decisions 2026-10-12
- 24 h machine for `monitor.py`: an old PC that is NOT on the domain (no lock-screen GPO)
- Store closure: still waiting for the list of closed store codes (besides 51512 Seacon Square)

## Decision + change 2026-10-11 16:45 — Status follows the sync; camera issue stays Partial (user)
- `stores.overall_status` (Dashboard cards/donut, Asset Register "Status", Reports) now follows the iVMS sync: DVR Offline → Offline; DVR Online → Online (Healthy), or **Partial if someone reported the cameras unusable**; never synced → manual/Survey value as before. Dashboard updates too (user chose the same rule everywhere)
- Migration `024_camera_issue.sql`: `stores.camera_issue` (+ `camera_issue_at`), backfilled from today's Partial; trigger sets it true when a person/Survey/work order sets Partial and false when set Healthy (incl. Work Order Verified). Changes by the script (service_role) don't touch it
- ivms-monitor **1.3.0**: `Plan.store_overall` for stores seen this round or whose DVR state changed; skipped until 024 is run (`camera_issue` missing → None). 5 new tests (30/30)
- Portal: shared `RepairLink`/`repairReason` — red wrench = DVR offline 2 h+ (NVR Offline ticket), amber wrench = DVR Online + Partial (Camera Failure ticket, remark "DVR Online แต่ดูกล้องไม่ได้ — เปิดงานให้ช่างซ่อม"); used in Device Status and in Asset Register's Status cell. Legend "จุดหน้าชื่อสาขา = DVR จาก iVMS" → "Sync Status". `AppDataProvider` re-reads stores every 2 min while visible (Supabase only)
- Note: a manual Offline on a synced store is overwritten by the next sync (sync is the truth for the DVR); demo mode shows unsynced mock statuses

## Change 2026-10-11 21:30 — keep the last sync when the script stops (user request)
- Before: once the last run was older than `stale_after_minutes`, every store turned "ข้อมูลเก่า", the cards showed "—" and the table emptied under a status filter
- Now `displayStatus()` ignores `stale`: cards, table, dots, Asset Register and the sidebar badge keep the last synced status; the red banner stays and reads "ตัวเลขด้านล่างเป็นผล sync ล่าสุดเมื่อ HH:MM น." The brown "ข้อมูลเก่า" legend item is gone
- DB values (store_monitor, stores.overall_status) were never cleared — only the display changed

## Change 2026-10-11 17:30 — live tab cards (user request)
- Cards: Offline (now includes Muted: DVR still down, only alerts off) · Online (Online + รอยืนยัน) · **Partial "ต้องซ่อมกล้อง"** (replaces the Muted card; click filters to camera-issue stores) · Not monitored (number only, "เฝ้าอยู่ X / N" removed)
- Demo check: 4 / 20 / 3 / 23 = 50; Partial filter → 3 rows

## Design 2026-10-11 17:05 — "ต้องซ่อมกล้อง" status (user request)
- New display status `CameraIssue` = sync says DVR Online but the store is Partial (camera_issue): amber dot/pill (status-partial, same as the Partial badge), label "ต้องซ่อมกล้อง", tooltip "DVR Online แต่ดูกล้องไม่ได้ — เปิดงานซ่อม"; sorted right after Offline; counts as Online in the KPI card and Online filter; amber wrench → Camera Failure ticket
- "กำลังยืนยัน" (seen offline 1 of N rounds) removed from the legend; it is still online, so it is a green dot (tooltip explains) and a green pill "Online · รอยืนยัน" in Device Status
- Legend: Online · ต้องซ่อมกล้อง · Offline · ปิดเตือน · ข้อมูลเก่า. `withCameraIssue()` / `isDvrOnline()` in `src/lib/monitoring.ts`; `DeviceDot` now takes the store

## Change 2026-10-11 — region chips (user request)
- Live tab chips now read "ทั้งหมด / BKK / Upcountry" (zone numbers removed; the zone dropdown is still there)
- KPI cards (Offline / Online / Muted / Not monitored + "เฝ้าอยู่ X / N") follow the chosen region and zone; N = stores in that scope instead of the hard-coded 194. Search and status filter don't change the counts
- Checked in demo mode: all 3/23/1/23 (27/50) → BKK 3/12/1/9 (16/25) → Upcountry 0/11/0/14 (11/25)

## Second feature — Store closure (ปิดสาขา)
Phase: planning done (2026-10-11) — plan `docs/workflow/PLAN-store-closure.md`
Trigger: 51512 Seacon Square (closed long ago) showed Online — a leftover from the 1.0.2 rule; cleanup SQL given to the user 2026-10-11
Decisions (user, 2026-10-11): closed stores hidden everywhere except Asset Register (filter + grey tag); close/reopen via a button in the store's Edit Detail; first batch by SQL
Next step: `/design` (needs the list of closed store codes)

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
- Confirmed on the Design PC 14:35: `python ivms_reader.py` → ok=True total=67 complete=True offline=10 online=57 (incl. 52002, 53023). First real run 14:44: web shows monitored 123/194 (67 + 56 from the other account), Offline 8 → 10 after the 2nd round
- **1.2.0 (14:55, user request):** sync status on the HQ PC — console title "🔄 iVMS กำลัง sync…" during a round; Windows toast after it ("✅ Sync complete" with total/Offline/Online/next round, "🟡 ไม่ครบ", "⚠️ ไม่สำเร็จ" + reason, "⚠️ Offline เกือบทั้งหมด"). No popup at the start on purpose (would cover iVMS). `desktop.py`; failures only log. Toast uses PowerShell's AppUserModelID via winsdk (already installed). Not tested on Windows yet
- Suggested to the user: confirm Offline after 1 round when switching accounts every 30 min
- 2026-10-11 16:08 (BKK account, Total 57): toast "🟡 Sync ไม่ครบทุกเครื่อง" — Offline 3 + Online 51 = 54 of 57. iVMS had its bottom Event pane open, so the table ended ~260 px above the window bottom; the page-down click (thumb bottom + 20 px) landed in the pane once the thumb was near the end → no scroll → last rows unread. Also all rows were ticked (header checkbox) — not done by the script (it only clicks Refresh and the scrollbar at the far right)
- **1.2.1:** `_table_bottom()` = lowest OCR'd store-code row; scrollbar search and page-down clicks are limited to the table. Simulated 57 rows with the pane open, from top and bottom: 57/57
- 16:18: 1.2.1 failed every round — "TypeError: 'float' object cannot be interpreted as an integer": the table bottom comes from OCR word coordinates (floats) and went straight into the click; pywinauto needs ints (the simulation's fake mouse accepted floats). **1.2.2** casts click coordinates and the table bottom to int
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

---

## Second feature — Installation Project (status file from `docs/installation-project-plan`, merged 2026-10-12)

Feature: Installation Project
Phase: /test in progress — automated checks pass, Timeline sort + today marker confirmed live, pencil date-edit and core R1–R10 manual checklist still pending
Design approved: yes — 2026-09-30 — DESIGN-installation-project.md (schema `installation_projects`/`installation_stage_history`, 8-stage flow, RLS, screens, exports)
Updated: 2026-10-07

### Done
- Plan written: docs/workflow/PLAN-installation-project.md
- Design written: docs/workflow/DESIGN-installation-project.md (schema, screens, flow, RLS, exports, traceability R1–R10)
- Repo attached to session (batathai/bata-cctv-portal), read-only for now (push not authorized for this session)
- Confirmed against real schema/code:
  - Budget/quote step can reuse existing `vendor_quotations` table (migration 008) instead of a new one
  - System is single-role (`hq_admin` only) per `src/lib/rbac.ts` — no DM/RM/supplier logins active; DM is contact info, not a user
  - Stage-history pattern to follow: `recovery_stage_history` (migration 012)
  - `attachments_storage` (migration 009) fits as-is; only the `attachments.folder` check constraint needs widening (4 new categories) — no new bucket needed
  - Next free migration number confirmed: 020
  - `work_order_batches` (migration 017) can represent "Wave" without schema changes (used via a `wave` text column, not a second FK, to avoid clashing with `stores.batch_id` which already belongs to repair batches)
  - Real Excel export pattern is client-side `xlsx` (json_to_sheet), not the formula-based openpyxl demo shown earlier — flagged as an open conflict with R7 ("ใช้สูตรจริง")

### Open issues
- Storage quota for ~1,200+ verify photos not yet estimated
- Push access: this session cannot push to GitHub (org has not installed the Claude GitHub App / GitHub not reconnected). User must push manually until resolved.
- Store code corrections (Fashion Island 51401→51404, Central Udon 53031→53012): confirmed as an ongoing data-cleanup task, not a blocker for `/implement` — data changes constantly, so this is handled separately whenever discovered, not as a one-time fix before seeding

### Design decisions — resolved 2026-09-30
1. `d1_date`/`d2_date` — confirmed: D1 = วันนัดติดตั้ง (scheduled), D2 = วันติดตั้งจริง (actual)
2. Export approach — confirmed: **(ก)** client-side `xlsx` (`json_to_sheet`), matching the real app's existing `exportExcel.ts` pattern, no formulas, no new backend

### Implemented — 2026-09-30

New files:
- `supabase/migrations/020_installation_project.sql` — `installation_projects`, `installation_stage_history`, widened `attachments.folder`, RLS (hq_admin only)
- `src/lib/installation.ts` — stages, labels, 12-item/3-group Verify Checklist, `canAdvanceStage`, `withinPostCompletionWindow`
- `src/lib/installationWrite.ts` — DB writes: stage transitions, checklist toggle + auto-complete, 72h rollback, project creation
- `src/lib/reports/exportInstallationExcel.ts` — Summary + Timeline sheets, client-side `xlsx` (per approved R7 decision)
- `src/lib/reports/exportInstallationPdf.ts` — Executive Summary + per-store handover PDF
- `src/app/(portal)/installation/page.tsx` — Kanban board (drag & drop, filters, KPIs, exports)
- `src/app/(portal)/installation/[code]/page.tsx` — detail: stepper, quotation link (R3), Verify Checklist + 72h rollback (R6), attachments, activity log
- `src/app/(portal)/installation/timeline/page.tsx` — Gantt-style timeline
- `src/app/(portal)/installation/rollout/page.tsx` — 194-target rollout grid + per-stage/per-zone summary, "open project" action

Modified:
- `src/types/database.ts` — `InstallationProject`, `InstallationStageHistoryEntry`, widened `AttachmentFolder`
- `src/lib/data.ts` — `fetchInstallationProjects`, `fetchInstallationStageHistory`
- `src/lib/mockData.ts` — Wave 1 (20 stores) demo data across all 8 stages, own quotation rows (kept separate from Recovery-flow mock quotations)
- `src/components/providers/AppDataProvider.tsx` — state + `createInstallationProject`/`advanceInstallationStage`/`updateVerifyChecklistItem`/`resetPostCompletionChecklist`
- `src/components/layout/Sidebar.tsx` — added "Installation Project" nav item
- `src/components/assets/AttachmentsCard.tsx` — added the 4 new installation folder categories to the picker (shared component)

Verification: `npx tsc --noEmit` — 0 errors. `npm run lint` — 0 warnings/errors. `npm run build` could not be completed in this sandbox (outbound network to Google Fonts is blocked by the session's egress proxy — unrelated to this change; GitHub Actions' real build has normal internet access and should succeed there). **User must still verify a real `npm run build` themselves once pushed, before merging.**

Refinement beyond the design doc: R3's "any Approved quotation exists for this store" was ambiguous, since the same `vendor_quotations` table is also used by the unrelated Recovery/repair flow — a store could have an Approved *repair* quote that has nothing to do with installation budget. Implemented as `approved_quotation_id` on `installation_projects`, explicitly picked by hq_admin from that store's Approved quotations (see the Quotation-stage card on the detail page), so the two flows can never be confused.

### Resolved — 2026-10-05
- Migration 020 **has been run** against the real Supabase project by the user — confirmed ("รันเรียบร้อยแล้วครับ"). The "not yet run" note above is stale/historical.
- This feature's branch (`docs/installation-project-plan`, commits `a6d10b6..e702db5`) is **not on `origin/main`**, and `git branch -r` shows only `origin/main` — the branch the user previously pushed to is not currently on the `batathai/bata-cctv-portal` remote this session sees (deleted, or pushed elsewhere). This session's container had reset to a fresh clone of `main`; the commits were recovered from leftover loose git objects still on disk and re-pointed to a local branch of the same name. **User should confirm where `docs/installation-project-plan` actually lives** (check `git branch -r` / GitHub) before assuming it's safe to delete locally again.

### UI restructure — 2026-10-05 (per user request)
Installation Project moved from its own top-level Sidebar entry into a sub-tab of the existing **Work Orders** menu item, so Sidebar has one "Work Orders" entry again (no "Installation Project" row):
- Routes moved: `/installation*` → `/work-orders/installation*` (board, `[code]` detail, `timeline`, `rollout`). All internal links within those pages updated to match.
- `src/components/layout/Sidebar.tsx` — reverted to its pre-Installation-Project NAV (no `KanbanSquare` import, no separate nav row).
- New `src/components/work-orders/WorkOrdersTabs.tsx` — a 2-tab switcher ("งานซ่อม (Repair Jobs)" ↔ "ติดตั้งกล้องใหม่ (Installation Project)") rendered at the top of `/work-orders` and `/work-orders/installation`. The drill-down pages (`[batchId]`, `installation/[code]`, `installation/timeline`, `installation/rollout`) keep their existing back-arrow instead of the tab bar, to avoid duplicate nav chrome.
- Verified after the move: `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm run build` succeeds (using the `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` workaround for this sandbox's blocked Google Fonts egress) — route table confirms `/work-orders`, `/work-orders/[batchId]`, `/work-orders/installation`, `/work-orders/installation/[code]`, `/work-orders/installation/rollout`, `/work-orders/installation/timeline` all generated, and no `/installation*` route remains.

### Done — old repair/Work-Order data deletion — 2026-10-05
User asked to delete all old repair-pilot production data (maintenance_history, incident_tickets, recovery_stage_history, work_order_batches, related vendor_quotations, and reset the relevant `stores` columns) **after taking a backup first**, to make room for Installation Project. `scripts/delete-recovery-work-order-data.mjs` was run by the user against the real Supabase project:
- Dry-run first: 61 of 194 stores affected (2 `work_order_batches` — more than the original 50-store pilot, grown by a second Job over time), maintenance_history 50, incident_tickets 80, recovery_stage_history 303, vendor_quotations 0 (nothing to protect/delete there).
- `--confirm` run: matched dry-run exactly — **61 stores reset**. Backup saved to `backups/delete-recovery-work-order-data-backup-2026-10-05T08-32-02-357Z.json` on the user's machine (not committed to git — keep it safe for reference/rollback).
- `vendor_quotations` protection logic (exclude rows referenced by `installation_projects.approved_quotation_id`) had nothing to protect this time since the count was 0, but the code path is in place for next time.
- Pushed to `origin/docs/installation-project-plan` as of commit `ba1bb80` (includes both the Work Orders/Installation Project restructure and this script).
- **Awaiting user's live-site check**: `/work-orders` should show "Active Jobs (0)", and the "ติดตั้งกล้องใหม่ (Installation Project)" tab should still work normally.

Note: the old Work Orders list/detail pages (`/work-orders`, `/work-orders/[batchId]`) and their `createWorkOrderBatch`/`closeWorkOrderBatch`/`reopenWorkOrderBatch`/`assignStoreToBatch` code in `AppDataProvider.tsx` were **not removed** — only the data they display will be emptied by the script. After the script runs, "Active Jobs (0)" will show correctly (the page already handles the empty state); the repair-ticket code path itself is left in place so a *new* repair job can still be opened later if needed. If the user wants that code removed entirely (not just emptied of data), that is a separate, larger change (also touches `src/components/work-orders/NewTicketModal.tsx`, `src/app/(portal)/reports/page.tsx`'s batch picker, and `src/lib/mockData.ts`'s batch generation) — flag before doing it.

### Not yet done (next steps)
- Confirm live-site check: `/work-orders` shows 0 Active Jobs, Installation Project tab still works.
- `/test` — no automated tests exist in this repo (matches its existing no-test-suite state); manual test pass needed, including the still-open jsPDF Thai-glyph issue in `exportInstallationPdf.ts` (default fonts have no Thai glyph support — needs a Thai-capable embedded font; not yet fixed).
- Storage quota for verify photos still not estimated (carried over from planning).
- Decide whether/when to merge `docs/installation-project-plan` into `main`.

### /test — 2026-10-05

**Automatic checks** (on `docs/installation-project-plan`, commit `dd2ff5c` + this update): `npx tsc --noEmit` 0 errors · `npm run lint` 0 errors/warnings · `npm run build` succeeds (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` workaround for this sandbox's blocked Google Fonts egress) — route table shows `/work-orders`, `/work-orders/[batchId]`, `/work-orders/installation`, `/work-orders/installation/[code]`, `/work-orders/installation/rollout`, `/work-orders/installation/timeline`, no top-level `/installation*` left.

Per the test skill's rule — a requirement without direct evidence is "Not tested", never "Pass" — most items below are Not tested because the live site the user screenshotted (`bata-cctv-portal.pages.dev`) deploys from `main`, which does not have this feature yet; only the DB layer (shared across branches) could be checked so far.

| # | Requirement | How tested | Result |
|---|---|---|---|
| R1 | `installation_projects` table | Migration 020 run by user (confirmed); `delete-recovery-work-order-data.mjs` successfully queried `installation_projects(id, store_id, approved_quotation_id)` with no error in both dry-run and `--confirm` | **Pass** (schema-level only; full CRUD not exercised live) |
| R2 | `installation_stage_history` table | Same migration, not independently queried | Not tested |
| R3 | Quotation→Permit gate (`approved_quotation_id`, explicit link) | Code reviewed only; 0 `vendor_quotations` rows currently exist for any store (table is empty post-deletion) so nothing to click through yet | Not tested |
| R4 | Kanban board, drag & drop, Wave/region/zone filters | Not opened on a live deploy of this branch yet | Not tested |
| R5 | Store detail page (checklist, 3 install points, attachments, activity log) | Not opened live yet | Not tested |
| R6 | 12-item Verify Checklist, auto-complete at 12/12, 72h rollback | Not opened live yet | Not tested |
| R7 | Excel export (Summary + Timeline, client-side `xlsx`) | Not run live yet | Not tested |
| R8 | PDF export (exec summary + handover) with Thai text | Code inspection: `exportInstallationPdf.ts` uses jsPDF's default fonts (Helvetica/WinAnsi) with no `addFont`/Thai-capable font embedded, same pattern as the pre-existing `exportPdf.ts`. Confirmed earlier via a Node script showing jsPDF's default `getFont()` → `{fontName: 'helvetica', encoding: 'WinAnsiEncoding'}`, which has no Thai glyphs | **Fail** — pre-existing systemic issue (not a regression from this feature; `exportPdf.ts` has the same gap) — needs `/debug` to embed a Thai TTF via `addFileToVFS`/`addFont` |
| R9 | Rollout page — 194-target grid + per-stage/per-zone summary | Not opened live yet | Not tested |
| R10 | RLS — `installation_projects`/`installation_stage_history` read/write = `hq_admin` only | Migration file reviewed (policies present using `current_profile()` pattern from `vendor_quotations`); cannot exercise with a second role since the whole app is currently single-role (`hq_admin` only per `src/lib/rbac.ts`) — so the restriction has no live user to test it against | Not tested (low risk given current single-role state) |

**Edge cases checked**
- Store codes as numbers/spaces — not specific to this feature (reuses existing `stores` data loaded the same way as Recovery/Work Orders); not separately re-tested.
- Region/zone mapping (BKK 511/512/513/550, UPC 520/530/540/560) — `regionFromZone()`/`getAreaLabel()` reused as-is from `src/lib/recovery.ts`, unchanged by this feature.
- Counts adding up — deletion script's dry-run and `--confirm` counts matched exactly (61 stores both times) — **Pass** for that specific flow.
- Soft-deleted rows — not applicable; `installation_projects` has no soft-delete column, and the deletion script operates on real store rows regardless of `is_active`.
- Each role sees only what it should — single-role app, not testable yet (see R10).
- Empty states / 194+ stores — `/work-orders` empty state confirmed working live ("No active jobs. Create one to start tracking work orders.") after deletion. Installation Rollout's 194-grid not yet opened live.
- Thai text in exports — **Fail**, see R8.

**Pass/Fail/Not-tested count**: 2 Pass (R1, counts-adding-up edge case) · 1 Fail (R8) · 8 Not tested.

### Manual test checklist for the user (ทำบน preview ของ branch นี้ หรือหลัง merge main)
1. เปิด `/work-orders` → เห็นแท็บ "งานซ่อม (Repair Jobs)" / "ติดตั้งกล้องใหม่ (Installation Project)" ที่ด้านบนไหม
2. กดแท็บ Installation Project → เห็นบอร์ด Kanban 8 คอลัมน์, การ์ด Wave 1 (20 สาขา) ไหม
3. ลองลากการ์ดจากขั้น "Quotation" ไปขั้นถัดไป (ไม่มีใบเสนอราคา Approved ผูกไว้) → ควรถูกบล็อกพร้อมข้อความเตือน (R3)
4. เปิดการ์ด 1 ใบ → เช็คว่าเห็น stepper, การ์ดผูกใบเสนอราคา, Verify Checklist 12 ข้อ, แนบไฟล์ได้ (R5/R6)
5. ติ๊ก Verify Checklist ครบ 12/12 → การ์ดควรย้ายไป "Completed" อัตโนมัติ (R6)
6. กด Export Excel ที่หน้าบอร์ด → เปิดไฟล์ดูว่ามี 2 ชีต (Summary, Timeline) ตัวเลขถูกไหม (R7)
7. กด Export PDF → **คาดว่าจะเห็นปัญหา**: ข้อความภาษาไทยในไฟล์ PDF จะเพี้ยน/ไม่ขึ้น (ตัว font ไม่รองรับไทย) — ยืนยันตามที่พบไหม แล้วแจ้งกลับมา จะส่งต่อให้ `/debug`
8. เปิด `/work-orders/installation/timeline` และ `/work-orders/installation/rollout` → เช็คว่าตารางเวลา/กริด 194 ช่อง แสดงถูกต้องไม่ error (R9)
9. ยืนยันอีกครั้งว่า `/work-orders` เดิม (Repair Jobs) ยัง "Active Jobs (0)" เหมือนก่อนหน้า

### Preview deploy found & used — 2026-10-05
`main` is Cloudflare Pages' only configured trigger (push) + `pull_request` targeting `main`. Opened PR #1 (`docs/installation-project-plan` → `main`), which triggered a real preview deployment at `https://48435500.bata-cctv-portal.pages.dev` without touching production. Confirmed live via screenshot:
- `/work-orders` shows the 2-tab switcher ("งานซ่อม (Repair Jobs)" / "ติดตั้งกล้องใหม่ (Installation Project)") — Sidebar correctly shows one "Work Orders" entry.
- "Active Jobs (0)" confirms the data-deletion script's effect is visible live.

### Real Wave 1 data imported — 2026-10-05
User provided the real 20-store schedule (name, store_code, D1 scheduled date, D2 actual install date — no stage column). Wrote `scripts/import-installation-wave1.mjs` (same dry-run/--confirm/backup convention): infers starting stage from today vs D1/D2 (before D1 → Scheduled, between D1–D2 → Installing, after D2 → Verify; never auto-Completed). Dry-run: 20/20 matched `stores.store_code`, 0 unmatched, 0 name mismatches (Fashion Island 51404 / Central Udon 53012 — the previously-known bad codes — are correct in this data). `--confirm` run: **20 `installation_projects` rows inserted successfully**, matching dry-run exactly. Backup/report kept on the user's machine (`backups/import-installation-wave1-backup-...json`).

### Stage flow changed — 2026-10-05: "Floor Plan" and "Layout" removed permanently
After seeing the real Wave 1 board, user asked to delete the empty "Floor Plan" and "Layout" columns — confirmed via AskUserQuestion this means removing them from the flow **permanently**, not just hiding empty columns, since that work happens before a store enters this tracker and was never going to be used.

**New pipeline (6 stages, was 8):** Quotation → Permit → Scheduled → Installing → Verify → Completed

- `supabase/migrations/021_installation_remove_floorplan_layout.sql` — bumps any stray Floor Plan/Layout row to Quotation first (none existed), then updates the `current_stage` check constraint + default
- `src/lib/installation.ts`, `src/types/database.ts` — `INSTALLATION_STAGES`/`InstallationStage` now 6 values
- New projects (`AppDataProvider.createInstallationProject`, `installationWrite.createInstallationProjectDb`) now start at **Quotation**, not Floor Plan
- `src/lib/mockData.ts`, Rollout page's `STAGE_DOT` updated to match
- DESIGN doc §9 records this as an amendment (original §2–§8 left as the historical record of what was approved 2026-09-30)
- Verified: `tsc` 0 errors, `lint` 0 errors, `build` succeeds, route table unchanged

**Migration 021 not yet run against Supabase** — user must run it in the SQL Editor (after 020) before this matters for real data; no existing row needs it (Wave 1 import never used Floor Plan/Layout).

### Timeline date-display + sort + inline-edit — 2026-10-05
Owner reported, screenshot-confirmed on the live PR preview, three rounds of follow-up fixes to `/work-orders/installation/timeline`:
1. Kanban cards (`installation/page.tsx`) and the store detail page (`installation/[code]/page.tsx`) were missing D1/D2 dates entirely — added `formatShortDate`/`formatThaiDate` helpers and rendered them. **Confirmed live via screenshot** (cards show "นัด DD/MM · ติดตั้ง DD/MM").
2. Timeline page had bars but no visible dates — added a date axis + per-row date label. **Confirmed live via screenshot.**
3. Three Timeline refinements requested: sort soonest-date-to-top, a vertical "today" marker line, finer (~2-day) axis ticks. First implementation had a sort bug — `POSITIVE_INFINITY - x` is always `Infinity` regardless of `x`, so every row whose dates were all in the past tied at the same key and fell back to array order (visible as 51428, dated 01/10, sitting at the very bottom instead of the top). **Confirmed live via screenshot that this bug existed**, then fixed (commit `fb09942`), then simplified further per explicit feedback — the real intent was pure chronological-earliest-first including past dates, not "soonest-upcoming" (commit `004f169`).
4. New: inline D1/D2 date editing on the Timeline page — pencil icon per row (role-gated via `canLogMaintenance`) opens two native date inputs, Save writes via new `updateInstallationDatesDb()` → `AppDataProvider.updateInstallationDates()` (updates only `d1_date`/`d2_date`, no stage change, no history row), Cancel discards.

**⚠ Commits `fb09942` and `004f169` are only pushed to this session's local clone, NOT yet applied by the user** — `origin/docs/installation-project-plan` is still at `64f96a3`. The user must `git am` + `git push` both patches before the sort-fix and inline-edit feature are live to test.

### Wave 1 data reconciled against authoritative source — 2026-10-05
User initially reported 4 stores (51428, 53031, 54023, "51499"→51944) as wrong and asked for corrections; wrote `scripts/fix-installation-wave1-dates.mjs` (dry-run/--confirm/backup pattern) per clarified values. User then pasted the authoritative 20-store source table, which revealed:
- 17/20 stores already matched the original Wave 1 import exactly — no fix needed.
- The earlier "correction" requested for 53031 and 54023 actually contradicted this authoritative table (original import values were correct).
- 53022 has a genuine unexplained mismatch (shows 12/10-13/10 live, should be 06/10-07/10) — predates this session's changes, cause unknown.
- **User's decision: leave all 3 discrepancies (53031, 54023, 53022) as-is** — "สามสาขานี้ไม่เป็นไร ครับ เอาสาขาอื่น ตรงก้อพอ". `fix-installation-wave1-dates.mjs` was never run with `--confirm`; no DB write happened from it. 51428/51944 were never wrong and need no action.

### Next step
1. User applies the 2 outstanding patches (`fb09942`, `004f169`) via `git am` + `git push`, then re-checks the Timeline preview: sort order (earliest/overdue at top), today-marker line, pencil-icon date editing.
2. Continue the manual test checklist below (drag-blocking on Quotation, detail page, Verify Checklist, Excel/PDF export, Rollout page).
3. Once manual testing clears (R8/PDF-Thai known exception), move to `/review`.

### /test — 2026-10-05 (second pass)

**Automatic checks** (local HEAD `004f169`, 2 commits ahead of `origin/docs/installation-project-plan`@`64f96a3`): `npx tsc --noEmit` 0 errors · `npm run lint` 0 errors/warnings · `npm run build` succeeds (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` workaround) — route table unchanged, no test script exists in `package.json` (confirmed again — matches the repo's existing no-test-suite state).

Core R1–R10 statuses are **unchanged from the first `/test` pass** (no code touched this session affects R1–R10's underlying logic — only Timeline/card/detail date *display*, Timeline *sort*, and a new, additive *date-edit* capability were added). Restating for traceability:

| # | Requirement | Result | Note |
|---|---|---|---|
| R1 | `installation_projects` table | **Pass** (schema-level) | unchanged |
| R2 | `installation_stage_history` table | Not tested | unchanged |
| R3 | Quotation→Permit gate | Not tested | unchanged |
| R4 | Kanban drag & drop + filters | Not tested | unchanged |
| R5 | Store detail page | Not tested | unchanged — but D1/D2 date display on this page is now **Pass**, confirmed live via screenshot |
| R6 | Verify Checklist 12/12 auto-complete, 72h rollback | Not tested | unchanged |
| R7 | Excel export | Not tested | unchanged |
| R8 | PDF export, Thai text | **Fail** (pre-existing, same as before) | unchanged — needs `/debug` |
| R9 | Rollout page | Not tested | unchanged |
| R10 | RLS hq_admin-only | Not tested (low risk, single-role app) | unchanged |

**This session's additive items** (not numbered requirements in the original plan, but delivered and need their own sign-off):

| Item | Result | Evidence |
|---|---|---|
| D1/D2 dates visible on Kanban cards | **Pass** | Live screenshot |
| D1/D2 dates visible on store detail page | **Pass** | Live screenshot |
| Timeline date axis + per-row date labels | **Pass** | Live screenshot |
| Timeline sort (chronological-earliest-first, incl. past dates) | Not tested live | Code fixed + built clean (commit `004f169`); not yet applied/pushed by user |
| Timeline "today" vertical marker line | **Pass** | Live screenshot |
| Timeline axis ticks ~every 2 days | **Pass** | Live screenshot |
| Timeline inline D1/D2 date editing (pencil icon) | Not tested live | New in commit `004f169`; not yet applied/pushed by user, never clicked on a live deploy |
| Wave 1 data vs. authoritative source table | **Pass** | User reconciled directly — 17/20 match exactly; user explicitly accepted the 3 remaining mismatches (53031, 54023, 53022) as-is, no further action needed |

**Pass/Fail/Not-tested count (cumulative)**: 7 Pass · 1 Fail (R8, known/pre-existing) · 10 Not tested.

### Manual test checklist — updated, still open
Same 9-item checklist from the first `/test` pass (drag-block R3, detail page R5, Verify Checklist R6, Excel R7, PDF R8 — expected Thai-glyph failure, Timeline/Rollout R9, Work Orders empty-state) — **none of these 9 have been clicked through live yet**; today's session only closed out the Timeline date-display/sort/edit items and the Wave 1 data reconciliation. Plus 2 new items:
10. หลัง apply patch `fb09942`+`004f169`: เปิด Timeline → เช็คว่า 51428 (01/10, วันที่ผ่านมาแล้ว) ขึ้นบนสุด ไม่ใช่ล่างสุด
11. ลองกดไอคอนดินสอข้างวันที่แถวไหนก็ได้ → แก้วันที่ → กด ✓ → เช็คว่าแถบสีขยับตามวันที่ใหม่ทันที ไม่ต้องรีเฟรชหน้า

### Update — 2026-10-06
- The 2 Timeline patches are **applied and pushed** (landed as `05b3373`/`c207ac5` on `origin/docs/installation-project-plan`, then `0d02b3d`). The "awaiting user apply" notes above are now historical.
- Checklist #10 **Pass** — live screenshot shows strict earliest-first order (51944 @01/10 on top, then 51428 @05/10, …). The checklist's original wording ("51428 dated 01/10") was wrong; per the user-confirmed source data 51944 is the 01/10 store.
- "Today" marker **Pass** — dashed line at 06/10 confirmed live.
- Checklist #11 (pencil date-edit) — still Not tested. The pencil is hover-only (`opacity-0 group-hover:opacity-100`), so it was not visible in the screenshot. Noted for `/review`: hover-only controls are invisible on touch devices.
- Fixed: "วันนี้" label overlapped the section title — container now reserves a `pt-4` band for it (timeline/page.tsx).
- Fixed: `CLAUDE.md` contained another project's docs (Store_payslip) copied in by mistake — rewritten for this repo. Also present on `main`, so the fix reaches `main` on merge.
- Noticed, not changed: `backups/` holds 2026-08-05 real-data backups committed to git; `README.md` partly stale (Next.js 14, multi-role).
- Migration 021 — still not confirmed as run on Supabase.

### Issues
### 2026-10-06 — Job name had a stray symbol in front and could not be edited
- **Seen:** user created repair job "Job 1 : 54044 - Robinson Chachoengsao" on the live site; the title showed a small mark before "Job" and there was no way to rename a job.
- **Cause:** a stray character (likely a Thai tone mark or `'` typed while switching keyboard layout) was saved as part of the name — `NewBatchModal` only trimmed spaces. `work_order_batches` had no rename path at all (no write helper, no UI).
- **Fix (this branch):** `cleanJobName()` in `workOrderBatchWrite.ts` strips leading non-letter/non-digit characters (keeps leading Thai consonants/leading vowels, drops tone marks) on both create and rename; new `renameWorkOrderBatchDb()` + `AppDataProvider.renameWorkOrderBatch()`; job page (`/work-orders/[batchId]`) shows a pencil next to the title (always visible, not hover-only) → inline input, Enter/✓ saves, Esc/✕ cancels, empty name rejected with a message. `tsc` 0 errors, `lint` 0.
- **Existing row:** user to fix the one live row with a one-off SQL `update` in the SQL Editor (preview `select` first) — not scripted, single row, no other data touched.
- **Not tested live yet** — add to manual checklist: rename a job, try a name starting with a symbol, try an empty name.
- **Return to:** `/test` (continue manual checklist).

### 2026-10-06 — "Open Work Order" could not find store 54044
- **Seen:** on the PR preview, typing `54044 - Robinson Chachoengsao` in the Store box showed "No store matches…", so the Open Work Order button stayed disabled. Issue Type also showed its placeholder ("Issue Type") instead of a real value.
- **Cause:** `NewTicketModal` searched with `(store_name + store_code).includes(query)` — the glued string `Robinson Chachoengsao54044` never contains the `code - name` text a person naturally types (and the list itself displays). The Issue Type `Select` let the empty placeholder option be chosen, and nothing blocked submitting with no issue type.
- **Fix:** search splits the query into words (ignoring `-`, `·`, etc.) and requires every word to appear in `"code name"` — any order works. Results list now shows code first, with a hint to click one; no-match hint suggests typing just the code. Issue Type uses the full-width select, an explicit "— Pick an issue type —" placeholder, and submit is blocked until one is picked. Tested the matcher against 7 inputs; `tsc` 0, `lint` 0.
- **Not tested live yet.** Return to: `/test`.

### Next features (backlog — start each with `/planning` on a new branch AFTER Installation Project merges)
Recorded 2026-10-06 from discussion with the owner.

### A. Combined follow-up Timeline (repair + installation)
- Owner expects a large volume of repair work soon. Wants one place to follow up both job types.
- Agreed direction: keep the two Kanban boards separate (different stage flows: installation 6 stages, repair 7), but add one **combined Timeline** under Work Orders — one row per job, type badge (ซ่อม / ติดตั้ง), filters (type, region, zone), "today" marker; repair jobs with no appointment grouped on top as "ยังไม่ได้นัด (N)" with days waiting; flag when one store has both job types close together so the vendor can do both in one visit.
- **Prerequisite (schema):** `incident_tickets` only has `opened_at`/`closed_at` — needs an appointment date (วันนัดช่าง) and actual repair date before repair jobs can be drawn as bars.

### B. Reuse of old equipment removed during installation
- Owner: old devices taken out at installation stores will be **repaired and redeployed to other stores**.
- Implies tracking each removed device (by serial) through: removed at store X (linked to that installation project) → in repair → in stock → installed at store Y. Today `cctv_assets` is one row per store, with no stock/in-transit state and no movement history.
- Open questions for `/planning`: which device types are reused (DVR, cameras, HDD?); is there a physical stock location; who repairs (vendor vs in-house); does a redeployment count as a repair job, an installation job, or its own type.
- Likely touches the repair flow too (repair of stock devices that belong to no store) — plan A and B together or in that order.

### Update — 2026-10-07
- Timeline rows now show the store name in small text under the store code (truncated, full name on hover), at owner's request for easier planning. Label column width unchanged so the "today" marker stays aligned. `tsc` 0, `lint` 0. Not yet checked on preview.
- Removed a duplicate backlog section (same two items as "Next features" above, pushed twice on 2026-10-06).
