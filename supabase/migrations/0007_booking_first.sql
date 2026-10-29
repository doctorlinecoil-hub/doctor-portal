-- Booking first: a referrer picks a time slot, then uploads documents.
-- AI reads the patient's details from the documents, the referrer confirms them and picks the reason,
-- and the AI prepares a draft letter for the doctor.

-- ---------- a case may exist before its details are filled ----------
alter table public.appointments alter column referral_type drop not null;
alter table public.appointments alter column patient_name drop not null;
alter table public.appointments alter column patient_id_number drop not null;
alter table public.appointments alter column patient_phone drop not null;
alter table public.appointments alter column patient_name set default '';
alter table public.appointments alter column patient_id_number set default '';
alter table public.appointments alter column patient_phone set default '';

-- empty while waiting for details, otherwise the same limits as before
alter table public.appointments drop constraint if exists appointments_patient_name_check;
alter table public.appointments drop constraint if exists appointments_patient_id_number_check;
alter table public.appointments drop constraint if exists appointments_patient_phone_check;
alter table public.appointments add constraint appointments_patient_name_check check (patient_name is null or patient_name = '' or length(patient_name) between 2 and 120);
alter table public.appointments add constraint appointments_patient_id_number_check check (patient_id_number is null or patient_id_number = '' or length(patient_id_number) between 5 and 20);
alter table public.appointments add constraint appointments_patient_phone_check check (patient_phone is null or patient_phone = '' or length(patient_phone) between 7 and 30);

alter table public.appointments
  add column if not exists details_at timestamptz,
  add column if not exists submitted_by text not null default '' check (length(submitted_by) <= 120),
  add column if not exists extract jsonb,
  add column if not exists extract_status text not null default '' check (extract_status in ('', 'running', 'done', 'error')),
  add column if not exists extract_error text not null default '';

-- every case booked so far already has its details
update public.appointments set details_at = created_at where details_at is null and coalesce(patient_name, '') <> '';

-- a booking made with all the details (by the clinic) is complete from the start
create or replace function public.appt_details_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.details_at is null and coalesce(new.patient_name, '') <> '' and new.referral_type is not null then
    new.details_at := now();
  end if;
  return new;
end $$;
drop trigger if exists appointments_details_stamp on public.appointments;
create trigger appointments_details_stamp before insert on public.appointments for each row execute function public.appt_details_stamp();

alter table public.settings add column if not exists auto_draft boolean not null default true;
alter table public.letters add column if not exists ai_draft_at timestamptz;

-- ---------- the referrer completes the case details ----------
create or replace function public.complete_case_details(
  p_id uuid, p_type public.referral_type, p_name text, p_id_number text, p_dob date, p_phone text, p_email text,
  p_payer public.payer_kind, p_notes text, p_submitted_by text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
  s public.settings;
  first_time boolean;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or a.firm_id = public.my_firm()) then raise exception 'NOT_ALLOWED'; end if;
  if a.status in ('cancelled', 'done') then raise exception 'CANNOT_EDIT'; end if;
  if p_type is null or length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_id_number, ''))) < 5 or length(trim(coalesce(p_phone, ''))) < 7 then
    raise exception 'DETAILS_MISSING';
  end if;
  select * into s from public.settings where id = 1;
  first_time := a.details_at is null;
  update public.appointments set
    referral_type = p_type,
    patient_name = left(trim(p_name), 120),
    patient_id_number = left(trim(p_id_number), 20),
    patient_dob = p_dob,
    patient_phone = left(trim(p_phone), 30),
    patient_email = lower(trim(coalesce(p_email, ''))),
    payer = coalesce(p_payer, a.payer),
    notes = left(coalesce(p_notes, ''), 10000),
    submitted_by = left(trim(coalesce(p_submitted_by, '')), 120),
    price = case when public.is_staff() and a.price > 0 then a.price else coalesce((s.prices ->> p_type::text)::numeric, 0) end,
    details_at = coalesce(a.details_at, now())
  where id = p_id;
  return first_time;
end $$;
revoke execute on function public.complete_case_details(uuid, public.referral_type, text, text, date, text, text, public.payer_kind, text, text) from anon, public;
grant execute on function public.complete_case_details(uuid, public.referral_type, text, text, date, text, text, public.payer_kind, text, text) to authenticated;

-- ---------- a draft written by the AI does not move the case to "letter in draft" ----------
create or replace function public.letter_sets_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_final then
    update public.appointments set status = 'done' where id = new.appointment_id and status in ('pending', 'booked', 'draft');
  elsif auth.uid() is not null and public.is_staff() then
    -- a request that still waits for approval stays pending while the doctor drafts
    update public.appointments set status = 'draft' where id = new.appointment_id and status = 'booked';
  end if;
  return new;
end $$;

-- ---------- notifications read well before the details exist ----------
create or replace function public.notify_appointments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(nullif(new.patient_name, ''), 'ממתין לפרטים') || ' · תיק ' || new.case_no;
  local_when text := to_char(new.starts_at at time zone 'Asia/Jerusalem', 'DD.MM HH24:MI');
begin
  if tg_op = 'INSERT' then
    if public.actor_is_firm() then
      perform public.notify(true, null, new.id, 'new_request',
        case when new.status = 'pending' then 'בקשה חדשה לתור ממתינה לאישור' else 'נקבע תור חדש' end, who || ' · ' || local_when);
    else
      perform public.notify(false, new.firm_id, new.id, 'booked_by_clinic', 'המרפאה קבעה עבורכם תור', who || ' · ' || local_when);
    end if;
    return new;
  end if;
  if old.details_at is null and new.details_at is not null and public.actor_is_firm() then
    perform public.notify(true, null, new.id, 'new_note', 'המפנה השלים את פרטי התיק', who || ' · ' || local_when);
  end if;
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'booked' then
      perform public.notify(false, new.firm_id, new.id, 'approved', 'התור אושר', who || ' · ' || local_when);
    elsif old.status = 'pending' and new.status = 'cancelled' and not public.actor_is_firm() then
      perform public.notify(false, new.firm_id, new.id, 'declined', 'הבקשה לתור לא אושרה', who || case when new.decline_reason <> '' then ' · ' || new.decline_reason else '' end);
    elsif new.status = 'cancelled' and public.actor_is_firm() then
      perform public.notify(true, null, new.id, 'cancelled', 'המפנה ביטל תור', who || ' · ' || local_when);
    elsif new.status = 'cancelled' then
      perform public.notify(false, new.firm_id, new.id, 'cancelled', 'המרפאה ביטלה את התור', who || ' · ' || local_when);
    elsif new.status = 'done' then
      perform public.notify(false, new.firm_id, new.id, 'letter_ready', 'המכתב מוכן', who);
    end if;
  end if;
  if new.starts_at is distinct from old.starts_at and new.status <> 'cancelled' then
    perform public.notify(false, new.firm_id, new.id, 'moved', 'מועד התור עודכן', who || ' · ' || local_when);
  end if;
  return new;
end $$;
