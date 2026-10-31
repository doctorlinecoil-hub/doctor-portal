-- Lift the per-patient cap on direct requests (it blocked bookings); the overall cap per referrer stays
-- and is set by the doctor in the settings. Only the booking check changes.

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
      -- unpaid requests on the shared card are capped together (no per-patient cap: the clinic asked to lift it)
      if (select count(*) from public.appointments a where a.firm_id = new.firm_id and a.status = 'pending'
            and a.deposit_paid_at is null and a.starts_at > now()) >= s.max_open_per_firm then
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
