-- 024 — Status from iVMS sync + "camera issue" flag (2026-10-11)
--
-- Decision (user, 2026-10-11): stores.overall_status — what Dashboard, Asset
-- Register and Reports read — follows the iVMS sync from now on:
--   DVR Offline                          -> 'Offline'
--   DVR Online, no camera issue           -> 'Healthy'  (shown as "Online")
--   DVR Online, camera issue reported      -> 'Partial'  (+ remark "DVR Online แต่ดูกล้องไม่ได้")
--   never synced                          -> whatever was set by hand / Survey
--
-- The sync only knows Online/Offline, so "the cameras can't be viewed" has to
-- be remembered separately: stores.camera_issue. It is set by people, never by
-- the script — the trigger below derives it from any manual / Survey / work
-- order change of overall_status:
--   set to 'Partial'  -> camera_issue = true   (stays Partial on every sync)
--   set to 'Healthy'  -> camera_issue = false  (repaired; also Work Order Verified)
--   'Offline'/'Unknown' -> unchanged
-- Changes made by the HQ script (service_role) don't touch the flag.

alter table public.stores
  add column if not exists camera_issue boolean not null default false,
  add column if not exists camera_issue_at timestamptz;

comment on column public.stores.camera_issue is
  'DVR may be online but cameras cannot be viewed (set when someone marks the store Partial; cleared when marked Online/Healthy). Read by ivms-monitor to keep Partial on sync.';

-- Stores marked Partial today keep it.
update public.stores
set camera_issue = true, camera_issue_at = now()
where overall_status = 'Partial' and not camera_issue;

create or replace function public.stores_camera_issue_from_status()
returns trigger
language plpgsql
as $$
begin
  if new.overall_status is distinct from old.overall_status
     and coalesce(auth.role(), '') <> 'service_role' then
    if new.overall_status = 'Partial' then
      new.camera_issue := true;
      new.camera_issue_at := now();
    elsif new.overall_status = 'Healthy' then
      new.camera_issue := false;
      new.camera_issue_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stores_camera_issue on public.stores;
create trigger trg_stores_camera_issue before update on public.stores
  for each row execute procedure public.stores_camera_issue_from_status();
