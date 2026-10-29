-- Referral types the clinic defines itself ("מה צריך מהרופא?"): rename, describe, price, add new ones, hide.
-- Each one is based on one of the four kinds of document, which decides the letter's structure and AI wording.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 2 and 80),
  description text not null default '' check (length(description) <= 200),
  icon text not null default 'file' check (length(icon) <= 30),
  base_type public.referral_type not null,
  price numeric(10, 2) not null default 0 check (price >= 0 and price < 1000000),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- the four current types become the first services, with today's prices
insert into public.services (label, description, icon, base_type, price, sort)
select x.label, x.description, x.icon, x.t::public.referral_type, coalesce((s.prices ->> x.t)::numeric, 0), x.sort
from (values
  ('הפניה לבדיקות', 'הפניה ל־MRI, CT, EMG או בדיקות אחרות', 'activity', 'referral', 1),
  ('סיכום ביקור', 'סיכום אחרי בדיקה במרפאה', 'stethoscope', 'summary', 2),
  ('חוות דעת לביטוח לאומי', 'חוות דעת רפואית לוועדה של המל״ל', 'building', 'nii', 3),
  ('חוות דעת משפטית', 'חוות דעת מומחה לבית משפט', 'scale', 'legal', 4)
) as x(label, description, icon, t, sort)
cross join (select prices from public.settings where id = 1) s
where not exists (select 1 from public.services);

alter table public.appointments
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists service_label text not null default '' check (length(service_label) <= 80);

-- the chosen service decides the document kind, the label and the price (never the browser)
create or replace function public.appt_apply_service() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.services;
begin
  if new.service_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then return new; end if;
  select * into v from public.services where id = new.service_id;
  if not found or (not v.active and not public.is_staff()) then raise exception 'SERVICE_UNAVAILABLE'; end if;
  new.referral_type := v.base_type;
  new.service_label := v.label;
  if not public.is_staff() or coalesce(new.price, 0) = 0 or tg_op = 'UPDATE' then
    new.price := v.price;
  end if;
  return new;
end $$;
-- runs before the other insert triggers (they are fired in name order)
drop trigger if exists appointments_a_service on public.appointments;
create trigger appointments_a_service before insert or update of service_id on public.appointments
  for each row execute function public.appt_apply_service();

-- the old type-based price only when no service was chosen
create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  base numeric;
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
  perform public.slot_check(new.starts_at);
  new.ends_at := new.starts_at + make_interval(mins => s.slot_minutes);
  if not public.is_staff() or coalesce(new.price, 0) = 0 then
    new.price := coalesce(base, 0);
  end if;
  if not public.is_staff() then
    if (select count(*) from public.appointments a
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

-- the referrer completes the case with a service (the type follows from it)
drop function if exists public.complete_case_details(uuid, public.referral_type, text, text, date, text, text, public.payer_kind, text, text);
create or replace function public.complete_case_details(
  p_id uuid, p_service uuid, p_name text, p_id_number text, p_dob date, p_phone text, p_email text,
  p_payer public.payer_kind, p_notes text, p_submitted_by text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
  v public.services;
  first_time boolean;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or a.firm_id = public.my_firm()) then raise exception 'NOT_ALLOWED'; end if;
  if a.status in ('cancelled', 'done') then raise exception 'CANNOT_EDIT'; end if;
  select * into v from public.services where id = p_service and (active or public.is_staff());
  if not found or length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_id_number, ''))) < 5 or length(trim(coalesce(p_phone, ''))) < 7 then
    raise exception 'DETAILS_MISSING';
  end if;
  first_time := a.details_at is null;
  update public.appointments set
    service_id = v.id,
    referral_type = v.base_type,
    service_label = v.label,
    patient_name = left(trim(p_name), 120),
    patient_id_number = left(trim(p_id_number), 20),
    patient_dob = p_dob,
    patient_phone = left(trim(p_phone), 30),
    patient_email = lower(trim(coalesce(p_email, ''))),
    payer = coalesce(p_payer, a.payer),
    notes = left(coalesce(p_notes, ''), 10000),
    submitted_by = left(trim(coalesce(p_submitted_by, '')), 120),
    price = case when public.is_staff() and a.price > 0 then a.price else v.price end,
    details_at = coalesce(a.details_at, now())
  where id = p_id;
  return first_time;
end $$;
revoke execute on function public.complete_case_details(uuid, uuid, text, text, date, text, text, public.payer_kind, text, text) from anon, public;
grant execute on function public.complete_case_details(uuid, uuid, text, text, date, text, text, public.payer_kind, text, text) to authenticated;

-- ---------- access ----------
alter table public.services enable row level security;
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to authenticated using (active or public.is_staff());
drop policy if exists services_admin on public.services;
create policy services_admin on public.services for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.services to authenticated;
