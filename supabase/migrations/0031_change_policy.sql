-- The doctor's change policy for referrers, and two automations.
--   allow_reschedule / allow_cancel : may a referrer move / cancel a confirmed appointment at all
--   change_business_days            : (existing) last day to ask for a new date, N days before the appointment
--   cancel_days                     : last day to cancel, N days before the appointment
--   change_days_unit                : count those days as business days (Sun–Thu) or calendar days
--   max_reschedules                 : how many times one appointment may be moved by the referrer (0 = no limit)
--   daily_digest                    : a morning summary email to the doctor
--   auto_pay_reminder_days          : remind the payer every N days while a ready document waits for payment (0 = off)
--   policy_in_summons               : print the change policy in the confirmation email
-- The clinic (staff) is never limited. A request still waiting for approval can always be withdrawn.

alter table public.settings
  add column if not exists allow_reschedule boolean not null default true,
  add column if not exists allow_cancel boolean not null default true,
  add column if not exists cancel_days int not null default 5 check (cancel_days between 0 and 60),
  add column if not exists change_days_unit text not null default 'business' check (change_days_unit in ('business', 'calendar')),
  add column if not exists max_reschedules int not null default 0 check (max_reschedules between 0 and 20),
  add column if not exists daily_digest boolean not null default true,
  add column if not exists auto_pay_reminder_days int not null default 0 check (auto_pay_reminder_days between 0 and 30),
  add column if not exists policy_in_summons boolean not null default true;

alter table public.settings drop constraint if exists settings_change_business_days_check;
alter table public.settings add constraint settings_change_business_days_check check (change_business_days between 0 and 60);

-- the last day (Israel time) on which the appointment may still be changed: N business or calendar days before its date
create or replace function public.change_deadline(p_start timestamptz, p_days int, p_unit text) returns date
language plpgsql immutable set search_path = public as $$
declare
  d date := (p_start at time zone 'Asia/Jerusalem')::date;
  n int := 0;
begin
  if coalesce(p_days, 0) <= 0 then return d; end if;
  if p_unit = 'calendar' then return d - p_days; end if;
  while n < p_days loop
    d := d - 1;
    if extract(dow from d) between 0 and 4 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create or replace function public.validate_reschedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  a public.appointments;
  moved int;
begin
  select * into s from public.settings where id = 1;
  select * into a from public.appointments where id = new.appointment_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_staff() and a.firm_id is distinct from public.my_firm() then raise exception 'NOT_FOUND'; end if;
  if a.status not in ('pending', 'booked', 'draft') then raise exception 'CANNOT_RESCHEDULE'; end if;
  new.firm_id := a.firm_id;
  new.status := 'pending';
  new.response := '';
  new.decided_at := null;
  new.created_by := auth.uid();
  perform public.slot_check(new.requested_starts_at);
  if not public.is_staff() then
    if a.starts_at < now() then raise exception 'IN_PAST'; end if;
    if a.status in ('booked', 'draft') then
      if not s.allow_reschedule then raise exception 'RESCHEDULE_DISABLED'; end if;
      if (now() at time zone 'Asia/Jerusalem')::date > public.change_deadline(a.starts_at, s.change_business_days, s.change_days_unit) then
        raise exception 'TOO_LATE_TO_CHANGE';
      end if;
      if s.max_reschedules > 0 then
        select count(*) into moved from public.reschedule_requests r where r.appointment_id = a.id and r.status = 'approved';
        if moved >= s.max_reschedules then raise exception 'TOO_MANY_RESCHEDULES'; end if;
      end if;
    end if;
    if new.requested_starts_at < now() + make_interval(hours => s.notice_hours) then raise exception 'SLOT_TOO_SOON'; end if;
    if new.requested_starts_at > now() + make_interval(days => s.horizon_days + 1) then raise exception 'SLOT_TOO_FAR'; end if;
  end if;
  if exists (select 1 from public.appointments x where x.id <> a.id and x.status <> 'cancelled'
             and tstzrange(x.starts_at, x.ends_at) && tstzrange(new.requested_starts_at, new.requested_starts_at + (a.ends_at - a.starts_at))) then
    raise exception 'SLOT_TAKEN';
  end if;
  return new;
end $$;

create or replace function public.cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
  s public.settings;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or coalesce(a.firm_id = public.my_firm(), false)) then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('pending', 'booked', 'draft') then raise exception 'CANNOT_CANCEL'; end if;
  if not public.is_staff() then
    if a.starts_at < now() then raise exception 'IN_PAST'; end if;
    select * into s from public.settings where id = 1;
    if a.status in ('booked', 'draft') then
      if not s.allow_cancel then raise exception 'CANCEL_DISABLED'; end if;
      if (now() at time zone 'Asia/Jerusalem')::date > public.change_deadline(a.starts_at, s.cancel_days, s.change_days_unit) then
        raise exception 'TOO_LATE_TO_CHANGE';
      end if;
    end if;
  end if;
  update public.appointments set status = 'cancelled' where id = p_id;
end $$;

revoke execute on function public.validate_reschedule() from anon, authenticated, public;
revoke execute on function public.cancel_appointment(uuid) from anon, public;
grant execute on function public.cancel_appointment(uuid) to authenticated, service_role;
grant execute on function public.change_deadline(timestamptz, int, text) to authenticated, service_role;
