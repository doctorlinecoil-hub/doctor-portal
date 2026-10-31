-- A referrer may move or cancel a confirmed appointment only until N business days before it (Sun–Thu; default 5).
-- The clinic (staff) is never limited. A request still waiting for approval can always be withdrawn or moved.

alter table public.settings add column if not exists change_business_days int not null default 5
  check (change_business_days between 0 and 30);

-- the last day (Israel time) on which the appointment may still be changed: N business days before its date
create or replace function public.change_deadline(p_start timestamptz, p_days int) returns date
language plpgsql immutable set search_path = public as $$
declare
  d date := (p_start at time zone 'Asia/Jerusalem')::date;
  n int := 0;
begin
  if coalesce(p_days, 0) <= 0 then return d; end if;
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
    -- a confirmed appointment can be moved only until N business days before it
    if a.status in ('booked', 'draft') and (now() at time zone 'Asia/Jerusalem')::date > public.change_deadline(a.starts_at, s.change_business_days) then
      raise exception 'TOO_LATE_TO_CHANGE';
    end if;
    if new.requested_starts_at < now() + make_interval(hours => s.notice_hours) then raise exception 'SLOT_TOO_SOON'; end if;
    if new.requested_starts_at > now() + make_interval(days => s.horizon_days + 1) then raise exception 'SLOT_TOO_FAR'; end if;
  end if;
  if exists (select 1 from public.appointments x where x.id <> a.id and x.status <> 'cancelled'
             and tstzrange(x.starts_at, x.ends_at) && tstzrange(new.requested_starts_at, new.requested_starts_at + make_interval(mins => s.slot_minutes))) then
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
    if a.status in ('booked', 'draft') and (now() at time zone 'Asia/Jerusalem')::date > public.change_deadline(a.starts_at, s.change_business_days) then
      raise exception 'TOO_LATE_TO_CHANGE';
    end if;
  end if;
  update public.appointments set status = 'cancelled' where id = p_id;
end $$;

revoke execute on function public.validate_reschedule() from anon, authenticated, public;
revoke execute on function public.cancel_appointment(uuid) from anon, public;
grant execute on function public.cancel_appointment(uuid) to authenticated, service_role;
grant execute on function public.change_deadline(timestamptz, int) to authenticated, service_role;
