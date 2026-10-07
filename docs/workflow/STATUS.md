# Workflow Status
Feature: Device Offline Monitoring (Heartbeat)
Phase: planning
Design approved: no
Updated: 2026-10-07

## Done
- Plan written: docs/workflow/PLAN-device-offline-monitoring.md (R1–R11, milestones M0–M4)
- Field test 2026-10-07 at test branch DVR DS-7204HGHI-K1 (FW V4.30.204, analog): DVR email via Gmail works (Motion email received). Confirmed DVR cannot email on Network Disconnected → offline detection must run from the portal side.

## Open issues
- DECIDED 2026-10-07 20:37: read Online/Offline from iVMS-4200 (Cloud P2P Device page) on the 24/7 HQ PC by screenshot + Windows OCR + icon colour — probe passed 27/27 rows. FTP-on-HQ-PC kept only as fallback (IT email not needed)
- Only devices added to iVMS are monitored (57 of 194 now)
- Verify DVR models support FTP + Scheduled Capture (start with DS-7204HGHI-K1)
- Measure snapshot size / SIM data usage in M0 pilot
- Confirm interval / threshold and alert email recipients
- Other feature in progress: Installation Project is at /test on branch `docs/installation-project-plan`
- This session cannot push to GitHub (Claude GitHub App not installed / GitHub not reconnected) — user pushes manually
- `CLAUDE.md` in this repo describes a different project (BATA Store — ส่ง Payslip) — should be replaced with this portal's context

## Next step
/design — after the FTP host decision; M0 pilot (no portal code) can run in parallel
