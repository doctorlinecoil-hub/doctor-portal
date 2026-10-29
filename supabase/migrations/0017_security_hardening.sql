-- Security hardening after a full review.

-- ---------- 1. Ownership checks that a NULL firm could slip past ----------
create or replace function public.complete_case_details(
  p_id uuid, p_service uuid, p_name text, p_id_number text, p_dob date, p_phone text, p_email text,
  p_payer public.payer_kind, p_notes text, p_submitted_by text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
  v public.services;
  first_time boolean;
  staff boolean := public.is_staff();
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (staff or coalesce(a.firm_id = public.my_firm(), false)) then raise exception 'NOT_ALLOWED'; end if;
  if a.status in ('cancelled', 'done') then raise exception 'CANNOT_EDIT'; end if;
  -- after the clinic approved the case, only the clinic may change the service (and with it the price)
  if not staff and a.details_at is not null and a.status <> 'pending' and p_service is distinct from a.service_id then
    raise exception 'SERVICE_LOCKED';
  end if;
  select * into v from public.services where id = p_service and (active or staff);
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
    payer = case when not staff and coalesce(a.deposit_amount, 0) > 0 then a.payer else coalesce(p_payer, a.payer) end,
    notes = left(coalesce(p_notes, ''), 10000),
    submitted_by = left(trim(coalesce(p_submitted_by, '')), 120),
    price = case when v.id is not distinct from a.service_id and a.price > 0 then a.price
                 when staff and a.price > 0 then a.price
                 else v.price end,
    details_at = coalesce(a.details_at, now())
  where id = p_id;
  return first_time;
end $$;
revoke execute on function public.complete_case_details(uuid, uuid, text, text, date, text, text, public.payer_kind, text, text) from anon, public;
grant execute on function public.complete_case_details(uuid, uuid, text, text, date, text, text, public.payer_kind, text, text) to authenticated, service_role;

create or replace function public.deposit_proof_sent(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- service_role (the public pay page, after its key check) has no uid
  if not (public.is_staff() or coalesce(a.firm_id = public.my_firm(), false) or auth.uid() is null) then raise exception 'NOT_ALLOWED'; end if;
  update public.appointments set deposit_proof_at = coalesce(deposit_proof_at, now()) where id = p_id;
  perform public.notify(true, null, p_id, 'deposit_proof', 'התקבל אישור העברה למקדמה',
    coalesce(nullif(a.patient_name, ''), 'מטופל') || ' · תיק ' || a.case_no);
end $$;
revoke execute on function public.deposit_proof_sent(uuid) from anon, public;
grant execute on function public.deposit_proof_sent(uuid) to authenticated, service_role;

-- ---------- 2. Booking limits: the shared "direct requests" card is capped per patient, not for everyone ----------
create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  base numeric;
  fk text;
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

-- ---------- 3. Columns only the server sets (a signed-in firm or patient cannot choose them) ----------
create or replace function public.appt_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.settings;
begin
  if public.is_staff() then return new; end if;
  select * into s from public.settings where id = 1;
  new.created_at := now();
  new.updated_at := now();
  new.remind_3d_at := null;
  new.remind_2h_at := null;
  new.details_at := case when coalesce(new.patient_name, '') <> '' and new.referral_type is not null then now() end;
  if not coalesce(s.phone_appointments, true) then new.mode := 'clinic'; end if;
  if new.service_id is null then new.service_label := ''; end if;
  if auth.uid() is not null then
    -- only the server's public booking (service role) sets these
    new.source := '';
    new.upload_key_hash := null;
    new.upload_key_expires := null;
    new.extract := null;
    new.extract_status := '';
    new.extract_error := '';
  end if;
  return new;
end $$;
revoke execute on function public.appt_insert_guard() from anon, authenticated, public;
drop trigger if exists appointments_y_guard on public.appointments;
create trigger appointments_y_guard before insert on public.appointments for each row execute function public.appt_insert_guard();

-- ---------- 4. A reschedule request reveals nothing about another firm's cases ----------
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
    if new.requested_starts_at < now() + make_interval(hours => s.notice_hours) then raise exception 'SLOT_TOO_SOON'; end if;
    if new.requested_starts_at > now() + make_interval(days => s.horizon_days + 1) then raise exception 'SLOT_TOO_FAR'; end if;
  end if;
  if exists (select 1 from public.appointments x where x.id <> a.id and x.status <> 'cancelled'
             and tstzrange(x.starts_at, x.ends_at) && tstzrange(new.requested_starts_at, new.requested_starts_at + make_interval(mins => s.slot_minutes))) then
    raise exception 'SLOT_TAKEN';
  end if;
  return new;
end $$;
revoke execute on function public.validate_reschedule() from anon, authenticated, public;

-- ---------- 5. Least privilege on tables (RLS stays the gate; this is the second lock) ----------
revoke all on public.prescriptions, public.case_diagnoses, public.drug_favorites, public.services from anon;
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- ---------- 6. Strong random keys (personal booking links, the scheduler's key) ----------
alter table public.firms alter column book_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
alter table app_private.cron_target alter column key set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update app_private.cron_target set key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 1;

-- ---------- 7. Password reset by a one-time link (the password changes only when the owner opens it) ----------
create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on public.password_resets (user_id);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;
