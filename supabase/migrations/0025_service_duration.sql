-- Each service may have its own length (a long consultation, a short follow-up); empty = the default slot length.
-- Additive: a new column and functions; existing appointments are untouched.

alter table public.services add column if not exists duration_minutes int
  check (duration_minutes is null or duration_minutes between 5 and 480);

-- how long a visit of this service lasts
create or replace function public.appt_minutes(p_service uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select duration_minutes from public.services where id = p_service),
                  (select slot_minutes from public.settings where id = 1), 30);
$$;

-- "is this a bookable time for a visit of p_minutes?": opening hours, the slot grid, blocked days and hours
create or replace function public.slot_check_len(p_start timestamptz, p_minutes int) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  s public.settings;
  local_ts timestamp;
  cfg jsonb;
  t_min int; from_min int; to_min int;
  len int;
begin
  select * into s from public.settings where id = 1;
  len := greatest(coalesce(p_minutes, s.slot_minutes), 5);
  local_ts := p_start at time zone 'Asia/Jerusalem';
  cfg := s.weekly -> extract(dow from local_ts)::int::text;
  if cfg is null or not coalesce((cfg ->> 'on')::boolean, false) then
    raise exception 'SLOT_DAY_CLOSED';
  end if;
  if local_ts::date = any (s.blocked_dates) then
    raise exception 'SLOT_DAY_BLOCKED';
  end if;
  t_min := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;
  from_min := split_part(cfg ->> 'from', ':', 1)::int * 60 + split_part(cfg ->> 'from', ':', 2)::int;
  to_min := split_part(cfg ->> 'to', ':', 1)::int * 60 + split_part(cfg ->> 'to', ':', 2)::int;
  if extract(second from local_ts) <> 0
     or t_min < from_min or t_min + len > to_min
     or (t_min - from_min) % s.slot_minutes <> 0 then
    raise exception 'SLOT_INVALID_TIME';
  end if;
  if exists (select 1 from public.time_blocks b
             where tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_start + make_interval(mins => len))) then
    raise exception 'SLOT_DAY_BLOCKED';
  end if;
end $$;

-- the old check = a visit of the default length
create or replace function public.slot_check(p_start timestamptz) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.slot_check_len(p_start, null);
end $$;

create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  base numeric;
  fk text;
  mins int;
begin
  select * into s from public.settings where id = 1;
  new.patient_email := lower(trim(coalesce(new.patient_email, '')));
  base := case when new.service_id is not null then (select price from public.services where id = new.service_id)
               else coalesce((s.prices ->> new.referral_type::text)::numeric, 0) end;
  if new.walk_in then
    if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
    new.ends_at := new.starts_at + interval '1 minute';
    if coalesce(new.price, 0) = 0 then new.price := coalesce(base, 0); end if;
    new.status := 'booked';
    new.confirmed_at := now();
    new.reminder_sent_at := now();
    return new;
  end if;
  -- the visit lasts as long as its service (or the default slot length)
  mins := public.appt_minutes(new.service_id);
  perform public.slot_check_len(new.starts_at, mins);
  new.ends_at := new.starts_at + make_interval(mins => mins);
  if not public.is_staff() or coalesce(new.price, 0) = 0 then
    new.price := coalesce(base, 0);
  end if;
  if not public.is_staff() then
    select kind::text into fk from public.firms where id = new.firm_id;
    if fk = 'private' then
      -- unpaid requests on the shared card are capped together; each patient has at most two open bookings
      if (select count(*) from public.appointments a where a.firm_id = new.firm_id and a.status = 'pending'
            and a.deposit_paid_at is null and a.starts_at > now()) >= s.max_open_per_firm then
        raise exception 'TOO_MANY_BOOKINGS';
      end if;
      if length(regexp_replace(coalesce(new.patient_id_number, ''), '\D', '', 'g')) >= 5 and (select count(*) from public.appointments a
          where a.firm_id = new.firm_id
            and ltrim(regexp_replace(a.patient_id_number, '\D', '', 'g'), '0') = ltrim(regexp_replace(new.patient_id_number, '\D', '', 'g'), '0')
            and a.status <> 'cancelled' and a.starts_at > now()) >= 2 then
        raise exception 'TOO_MANY_BOOKINGS';
      end if;
    elsif (select count(*) from public.appointments a
        where a.firm_id = new.firm_id and a.status <> 'cancelled' and a.starts_at > now()) >= s.max_open_per_firm then
      raise exception 'TOO_MANY_BOOKINGS';
    end if;
    if new.starts_at < now() + make_interval(hours => s.notice_hours) then
      raise exception 'SLOT_TOO_SOON';
    end if;
    if new.starts_at > now() + make_interval(days => s.horizon_days + 1) then
      raise exception 'SLOT_TOO_FAR';
    end if;
    new.walk_in := false;
    new.status := case when s.require_approval then 'pending'::public.appt_status else 'booked'::public.appt_status end;
    new.confirmed_at := case when s.require_approval then null else now() end;
    new.reminder_sent_at := null;
    new.letter_sent_at := null;
    new.decline_reason := '';
    new.created_by := auth.uid();
  elsif new.status = 'booked' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  return new;
end $$;

-- a moved appointment keeps its own length
create or replace function public.decide_reschedule(p_id uuid, p_approve boolean, p_response text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.reschedule_requests;
  a public.appointments;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.reschedule_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_approve then
    select * into a from public.appointments where id = r.appointment_id;
    perform public.slot_check_len(r.requested_starts_at, greatest(1, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int));
    update public.appointments set starts_at = r.requested_starts_at,
      ends_at = r.requested_starts_at + (a.ends_at - a.starts_at), reminder_sent_at = null
      where id = r.appointment_id and status in ('pending', 'booked', 'draft');
    if not found then raise exception 'CANNOT_RESCHEDULE'; end if;
  end if;
  update public.reschedule_requests set status = case when p_approve then 'approved' else 'declined' end,
    response = left(coalesce(trim(p_response), ''), 500), decided_at = now() where id = p_id;
  return r.appointment_id;
end $$;

revoke execute on function public.slot_check_len(timestamptz, int), public.appt_minutes(uuid) from anon, authenticated, public;
grant execute on function public.slot_check_len(timestamptz, int), public.appt_minutes(uuid) to service_role;
revoke execute on function public.decide_reschedule(uuid, boolean, text) from anon, public;
grant execute on function public.decide_reschedule(uuid, boolean, text) to authenticated, service_role;
