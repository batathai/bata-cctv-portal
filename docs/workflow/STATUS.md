# Workflow Status
Feature: Device Offline Monitoring (iVMS reader)
Phase: design ready — awaiting approval
Design approved: no
Updated: 2026-10-08

## Done
- Plan: docs/workflow/PLAN-device-offline-monitoring.md (R1–R12, milestones M0–M4)
- Field test 2026-10-07 at test branch DVR DS-7204HGHI-K1 (FW V4.30.204): DVR email via Gmail works; DVR cannot email on Network Disconnected → detection must run on the HQ side
- M0 feasibility done 2026-10-07: read iVMS-4200 Cloud P2P Device page by screenshot + Windows OCR + icon colour
  - 27/27 rows read; Offline-first sort + one page → 19/19 Offline, Total 57 (iVMS ignores synthetic scrolling)
  - Scripted Refresh click works, sort survives Refresh; screen unstable ~5 s after Refresh → wait ~20 s, double-read, 2 consecutive cycles before alert
- DECIDED 2026-10-07: DVR must run 24h; business-hours outage = instant email, after-hours = morning summary, not back 30 min after opening = email (R12)
- DECIDED 2026-10-08: standard business hours **10:00–22:00**, editable per store
- Design written 2026-10-08: docs/workflow/DESIGN-device-offline-monitoring.md
  - Migration `022_device_monitoring.sql` (020/021 are taken on the unmerged installation branch): `store_monitor`, `device_outages`, `monitor_runs`, `monitor_settings`; RLS + column GRANTs; script writes with service_role
  - HQ script split into ivms_reader / state (pure, pytest) / supa / notify / monitor
  - Screens: /status with 4 tabs (live · history · rollout · settings), Store Detail card + mute, Sidebar entry (page had no menu link)
  - Mockups: https://claude.ai/artifact/Bv4HZ4Cm7YQJ8rK5KB2sVp

## Open issues
- Awaiting user approval of the design
- R11 (latest snapshot) not covered by the iVMS approach — proposed to drop or defer to the FTP fallback
- R1 serial check not covered yet — need to see whether Cloud P2P page shows a serial column OCR can read
- Alert recipients (2 groups) not given yet — placeholders in settings, editable in portal
- Does iVMS export its device list? (would seed the monitored list instead of ticking by hand)
- Nobody watches when the HQ PC dies at night except the portal banner — free option later: scheduled GitHub Action checks monitor_runs and emails
- Only devices added to iVMS are monitored (57 of 194 now) — adding devices to iVMS is manual work that can start in parallel
- Flag to management: some stores switch DVRs off at closing (8 → 19 offline between 20:40 and 20:53) — no night recording
- Other feature in progress: Installation Project at /test on branch `docs/installation-project-plan`
- This session cannot push to GitHub — user pushes manually (patch provided)
- `CLAUDE.md` on this branch still describes BATA Store Payslip; replace with the portal version from the installation branch during /implement

## Next step
User approves the design → `/implement` (start with migration 022 + `state.py` with tests, then portal screens, then HQ script wiring)
