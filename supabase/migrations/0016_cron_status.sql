-- Lets the admin dashboard see whether the scheduled tick (reminders, deposit expiry) is installed.
create or replace function public.cron_active() returns boolean
language plpgsql security definer set search_path = public, app_private as $$
declare ok boolean := false;
begin
  if not public.is_admin() then return false; end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''portal-tick'' and active)' into ok;
  end if;
  return coalesce(ok, false) and exists (select 1 from app_private.cron_target where id = 1 and coalesce(url, '') <> '');
exception when others then
  return false;
end $$;
revoke execute on function public.cron_active() from anon, public;
grant execute on function public.cron_active() to authenticated;
