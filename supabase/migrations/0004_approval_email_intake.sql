-- Doctor approval of new requests, emails (summons, reminders, letters), AI intake of new cases,
-- and document requests from the doctor to the referrer.

-- ---------- settings ----------
alter table public.settings
  add column if not exists require_approval boolean not null default true,
  add column if not exists notify_email text not null default '' check (notify_email = '' or notify_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists bring_items text not null default E'תעודת זהות\nכל המסמכים הרפואיים הרלוונטיים, גם אם כבר הועלו למערכת\nרשימת תרופות עדכנית\nבדיקות הדמיה (דיסק או קישור לצפייה)' check (length(bring_items) <= 2000),
  add column if not exists summons_note text not null default '' check (length(summons_note) <= 2000),
  add column if not exists reminders_on boolean not null default true,
  add column if not exists email_letters boolean not null default true,
  add column if not exists auto_intake boolean not null default true;

-- ---------- appointments ----------
alter table public.appointments
  add column if not exists patient_email text not null default '' check (patient_email = '' or patient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists confirmed_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists letter_sent_at timestamptz,
  add column if not exists decline_reason text not null default '' check (length(decline_reason) <= 500);

-- appointments that already exist were confirmed when they were booked
update public.appointments set confirmed_at = created_at where confirmed_at is null and status <> 'cancelled';
-- letters of cases finished before this version were already delivered: never email them again automatically
update public.appointments set letter_sent_at = updated_at where letter_sent_at is null and status = 'done';

-- ---------- case notes: the doctor can ask the referrer for more ----------
alter table public.case_notes
  add column if not exists kind text not null default 'note' check (kind in ('note', 'request')),
  add column if not exists resolved_at timestamptz;

-- ---------- AI intake (one per case, written by the server only) ----------
create table if not exists public.case_intake (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  data jsonb,
  error text not null default '' check (length(error) <= 1000),
  model text not null default '',
  doc_count int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- emails sent by the system ----------
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  to_addr text not null check (length(to_addr) <= 320),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text not null default '',
  error text not null default '' check (length(error) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists email_log_appt_idx on public.email_log (appointment_id, created_at desc);

-- ---------- booking rules: firms' requests wait for approval ----------
create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  local_ts timestamp;
  cfg jsonb;
  t_min int; from_min int; to_min int;
begin
  select * into s from public.settings where id = 1;
  local_ts := new.starts_at at time zone 'Asia/Jerusalem';
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
     or t_min < from_min or t_min + s.slot_minutes > to_min
     or (t_min - from_min) % s.slot_minutes <> 0 then
    raise exception 'SLOT_INVALID_TIME';
  end if;
  new.ends_at := new.starts_at + make_interval(mins => s.slot_minutes);
  new.patient_email := lower(trim(coalesce(new.patient_email, '')));
  if not public.is_admin() or coalesce(new.price, 0) = 0 then
    new.price := coalesce((s.prices ->> new.referral_type::text)::numeric, 0);
  end if;
  if not public.is_admin() then
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

drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.is_admin() or (firm_id = public.my_firm() and status in ('pending', 'booked')));

create or replace function public.cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or coalesce(a.firm_id = public.my_firm(), false)) then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('pending', 'booked', 'draft') then raise exception 'CANNOT_CANCEL'; end if;
  if not public.is_staff() and a.starts_at < now() then raise exception 'IN_PAST'; end if;
  update public.appointments set status = 'cancelled' where id = p_id;
end $$;

-- the doctor approves a request: it becomes a confirmed appointment
create or replace function public.approve_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.appointments set status = 'booked', confirmed_at = now(), decline_reason = ''
    where id = p_id and status = 'pending';
  if not found then raise exception 'CANNOT_APPROVE'; end if;
end $$;

-- the doctor declines a request, with a short reason the referrer sees
create or replace function public.decline_appointment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.appointments set status = 'cancelled', decline_reason = left(coalesce(trim(p_reason), ''), 500)
    where id = p_id and status = 'pending';
  if not found then raise exception 'CANNOT_DECLINE'; end if;
end $$;

-- writing a letter moves a case forward; a finished letter marks it done
create or replace function public.letter_sets_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_final then
    update public.appointments set status = 'done' where id = new.appointment_id and status in ('pending', 'booked', 'draft');
  else
    -- a request that still waits for approval stays pending while the doctor drafts
    update public.appointments set status = 'draft' where id = new.appointment_id and status = 'booked';
  end if;
  return new;
end $$;

-- ---------- access rules for the new parts ----------
alter table public.case_intake enable row level security;
alter table public.email_log enable row level security;

drop policy if exists case_intake_staff_read on public.case_intake;
create policy case_intake_staff_read on public.case_intake for select to authenticated using (public.is_staff());

drop policy if exists email_log_staff_read on public.email_log;
create policy email_log_staff_read on public.email_log for select to authenticated using (public.is_staff());

-- referrers add notes only; requests come from the clinic
drop policy if exists case_notes_insert on public.case_notes;
create policy case_notes_insert on public.case_notes for insert to authenticated
  with check (author_id = auth.uid() and (public.is_staff() or (kind = 'note' and resolved_at is null and exists (
    select 1 from public.appointments a where a.id = case_notes.appointment_id and a.firm_id = public.my_firm() and a.status <> 'cancelled'))));
drop policy if exists case_notes_staff_update on public.case_notes;
create policy case_notes_staff_update on public.case_notes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

revoke all on public.case_intake, public.email_log from anon, authenticated;
grant select on public.case_intake, public.email_log to authenticated;
grant update on public.case_notes to authenticated;
grant all on public.case_intake, public.email_log to service_role;

revoke execute on function public.approve_appointment(uuid), public.decline_appointment(uuid, text) from anon, public;
grant execute on function public.approve_appointment(uuid), public.decline_appointment(uuid, text), public.cancel_appointment(uuid)
  to authenticated, service_role;
