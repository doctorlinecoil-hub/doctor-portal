-- Self sign-up (law offices, brokers and companies, patients), deposits for patients who book themselves,
-- the clinic's payment details, and reminders three days and two hours before every appointment.

-- ---------- sign-up ----------
alter type public.referrer_kind add value if not exists 'company';
alter type public.referrer_kind add value if not exists 'patient';

alter table public.firms
  add column if not exists self_registered boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists license_no text not null default '' check (length(license_no) <= 40),
  add column if not exists signup_note text not null default '' check (length(signup_note) <= 1000);

-- ---------- settings: deposits and how to pay ----------
alter table public.settings
  add column if not exists deposit_amount numeric(10, 2) not null default 300 check (deposit_amount >= 0 and deposit_amount < 100000),
  add column if not exists deposit_hold_hours int not null default 48 check (deposit_hold_hours between 1 and 336),
  add column if not exists bank_details text not null default '' check (length(bank_details) <= 1000),
  add column if not exists bit_phone text not null default '' check (length(bit_phone) <= 30),
  add column if not exists pay_note text not null default '' check (length(pay_note) <= 1000),
  add column if not exists open_registration boolean not null default true;

-- ---------- appointments: deposit and reminders ----------
alter table public.appointments
  add column if not exists deposit_amount numeric(10, 2) not null default 0 check (deposit_amount >= 0),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_proof_at timestamptz,
  add column if not exists remind_3d_at timestamptz,
  add column if not exists remind_2h_at timestamptz;

create index if not exists appointments_upcoming_idx on public.appointments (starts_at) where status in ('booked', 'draft');

-- A patient who books by himself (the public page without a referrer, or a patient account) holds the slot
-- only as a request: it waits for the deposit, and only then can the doctor approve it.
create or replace function public.appt_deposit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  amt numeric;
  k text;
begin
  if new.walk_in or public.is_staff() then
    new.deposit_amount := coalesce(new.deposit_amount, 0);
    return new;
  end if;
  select kind::text into k from public.firms where id = new.firm_id;
  select deposit_amount into amt from public.settings where id = 1;
  if k in ('private', 'patient') and coalesce(amt, 0) > 0 then
    new.deposit_amount := case when coalesce(new.price, 0) > 0 then least(amt, new.price) else amt end;
    new.payer := 'patient';
    new.status := 'pending';
    new.confirmed_at := null;
  else
    new.deposit_amount := 0;
  end if;
  new.deposit_paid_at := null;
  new.deposit_proof_at := null;
  return new;
end $$;
drop trigger if exists appointments_z_deposit on public.appointments;
create trigger appointments_z_deposit before insert on public.appointments for each row execute function public.appt_deposit();

-- the doctor approves only after the deposit came in
create or replace function public.approve_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.appointments where id = p_id and deposit_amount > 0 and deposit_paid_at is null) then
    raise exception 'DEPOSIT_REQUIRED';
  end if;
  update public.appointments set status = 'booked', confirmed_at = now(), decline_reason = ''
    where id = p_id and status = 'pending';
  if not found then raise exception 'CANNOT_APPROVE'; end if;
end $$;

-- staff: the deposit arrived (recorded as a payment)
create or replace function public.record_deposit(p_id uuid, p_method public.pay_method, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if a.deposit_paid_at is not null then return; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into public.payments (appointment_id, amount, method, note) values (p_id, p_amount, p_method, 'מקדמה');
  update public.appointments set deposit_paid_at = now() where id = p_id;
end $$;

-- the patient (or the referrer) says the transfer was made and attached the confirmation
create or replace function public.deposit_proof_sent(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or a.firm_id = public.my_firm() or auth.uid() is null) then raise exception 'NOT_ALLOWED'; end if;
  update public.appointments set deposit_proof_at = coalesce(deposit_proof_at, now()) where id = p_id;
  perform public.notify(true, null, p_id, 'deposit_proof', 'התקבל אישור העברה למקדמה',
    coalesce(nullif(a.patient_name, ''), 'מטופל') || ' · תיק ' || a.case_no);
end $$;

revoke execute on function public.record_deposit(uuid, public.pay_method, numeric), public.deposit_proof_sent(uuid) from anon, public;
grant execute on function public.record_deposit(uuid, public.pay_method, numeric), public.deposit_proof_sent(uuid) to authenticated, service_role;

-- ---------- the frequent job (reminders, expired holds) ----------
create schema if not exists app_private;
create table if not exists app_private.cron_target (
  id int primary key default 1 check (id = 1),
  url text not null default '',
  key text not null default md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text)
);
insert into app_private.cron_target (id) values (1) on conflict do nothing;

create or replace function public.cron_key_ok(p_key text) returns boolean
language sql security definer set search_path = public, app_private as $$
  select exists (select 1 from app_private.cron_target where id = 1 and length(coalesce(p_key, '')) >= 32 and key = p_key)
$$;
revoke execute on function public.cron_key_ok(text) from anon, authenticated, public;
grant execute on function public.cron_key_ok(text) to service_role;
