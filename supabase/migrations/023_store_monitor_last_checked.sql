-- 023 — Device monitoring: "อัปเดตล่าสุด" per store (2026-10-10)
--
-- HQ has two iVMS accounts (to be merged later). From ivms-monitor 1.1.0 the
-- script reads every row of whichever account is open and updates only the
-- stores it sees. last_seen_at keeps its meaning (last time seen Online, the
-- start of an outage); last_checked_at is the last round that saw the store
-- at all, Online or Offline. A store never checked = not in iVMS yet.
--
-- Written only by the HQ script (service_role). Portal reads it through the
-- existing store_monitor RLS; the column-level GRANT for hq_admin updates in
-- migration 022 does not include it, so the portal cannot change it.

alter table public.store_monitor
  add column if not exists last_checked_at timestamptz;

comment on column public.store_monitor.last_checked_at is
  'Last ivms-monitor round that saw this store in iVMS (Online or Offline). Null = never synced.';
