# Workflow Status
Feature: Device Offline Monitoring (iVMS reader)
Phase: /test in progress (HQ script verified end-to-end on 2026-10-08)
Design approved: yes — 2026-10-08 — DESIGN-device-offline-monitoring.md as written (iVMS reader, migration 022, 4-tab /status, Store Detail card, confirm Offline after 2 cycles, 10:00–22:00 default hours, R11 dropped from phase 1)
Updated: 2026-10-08 (evening)

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

## /test — 2026-10-08 (on the office PC with iVMS, user admin.danai)
- Python 3.14 + winsdk builds fine; `pip install -r requirements.txt` OK
- `ivms_reader.py` passed after 2 fixes (Win32 bring-to-front fallback; clearer "not sorted" error): ok=True, Total 57, 7 Offline, double read matches
- Supabase: migration 022 run; `SUPABASE_URL` with `/rest/v1` caused 404 PGRST125 → supa.py now strips it
- `hikconnect_devices` is empty in production → no monitored seed; ticked 56 stores by SQL from the 57-device list (2 Sep chat). 51545 Robinson Samut Prakan = unmatched code (master has 51501)
- Real cycles: 1st run streak only; 2nd run new_outages=6, monitor_updates=56 (state + outages rows correct)
- Email: Gmail SMTP sends OK (in Sent), but delivery to danai.makmee@bata.com is inconsistent — test A/B/C at 17:29 arrived (Outlook rule files them in "Noti CCTV"), alert batches 17:07/17:33 and tests D–H at 17:37 did not. Not content-related → likely corporate filter behaviour (burst / quarantine). Added Date + Message-ID headers; alerts now ONE combined email per cycle (design doc updated)
- Not yet done: Task Scheduler on the 24h machine; overnight run (after-hours outages, 10:00 morning summary, late-open at 10:30); portal screens not deployed (branch only)

## Waiting on
- IT: Message Trace / quarantine for batacctv.center@gmail.com → danai.makmee@bata.com (8 Oct 17:07–17:40) and allow-list the sender
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
Finish `/test`: Task Scheduler on the 24h PC, check the overnight run + 10:00 morning summary tomorrow, confirm email delivery after IT; then `/review` → `/security` → `/audit` → `/release` to put the portal screens live
