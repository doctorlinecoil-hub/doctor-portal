-- Doctor portal: schema, access rules (RLS), storage and booking rules.
-- Safe to run once on a fresh Supabase project. scripts/migrate.mjs runs it automatically.

create extension if not exists pgcrypto;

-- ---------- types ----------
do $$ begin
  create type public.user_role as enum ('admin', 'doctor', 'firm');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.referral_type as enum ('referral', 'summary', 'nii', 'legal');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.appt_status as enum ('booked', 'draft', 'done', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.referrer_kind as enum ('law', 'broker');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payer_kind as enum ('referrer', 'patient');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pay_method as enum ('transfer', 'bit', 'check', 'cash', 'card', 'other');
exception when duplicate_object then null; end $$;

-- ---------- tables ----------
create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 160),
  kind public.referrer_kind not null default 'law',
  tax_id text not null default '' check (length(tax_id) <= 20),
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  firm_id uuid references public.firms(id) on delete restrict,
  full_name text not null default '',
  email text not null default '',
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_firm_matches_role check ((role = 'firm') = (firm_id is not null))
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  horizon_days int not null default 30 check (horizon_days between 1 and 180),
  notice_hours int not null default 24 check (notice_hours between 0 and 336),
  weekly jsonb not null default '{
    "0": {"on": true,  "from": "09:00", "to": "14:00"},
    "1": {"on": true,  "from": "09:00", "to": "14:00"},
    "2": {"on": true,  "from": "09:00", "to": "14:00"},
    "3": {"on": true,  "from": "09:00", "to": "14:00"},
    "4": {"on": true,  "from": "09:00", "to": "14:00"},
    "5": {"on": false, "from": "09:00", "to": "12:00"},
    "6": {"on": false, "from": "09:00", "to": "12:00"}
  }'::jsonb,
  blocked_dates date[] not null default '{}',
  require_staff_mfa boolean not null default true,
  max_open_per_firm int not null default 30 check (max_open_per_firm between 1 and 500),
  prices jsonb not null default '{"referral": 0, "summary": 0, "nii": 0, "legal": 0}'::jsonb,
  letter_requires_payment boolean not null default false,
  invoice_item text not null default 'ייעוץ רפואי' check (length(invoice_item) between 1 and 120),
  bootstrapped boolean not null default false,
  lh_name text not null default '',
  lh_titles text not null default '',
  lh_licenses text not null default '',
  lh_address text not null default '',
  lh_phone text not null default '',
  lh_email text not null default '',
  lh_education text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (id, lh_name, lh_titles, lh_licenses, lh_address, lh_phone, lh_email)
values (
  1,
  'ד״ר אלרן חנוך',
  E'נוירוכירורג ילדים ומבוגרים\nמומחה לניתוחי מערכת עצבים מרכזית בגישה זעיר פולשנית',
  'מ.ר. 18425 · מומחה 12732',
  'מגדל ספיר, מתחם הבורסה, רחוב תובל 40, קומה 23, רמת גן',
  '052-4266440',
  'd.m.elranhanoch@gmail.com'
)
on conflict (id) do nothing;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  case_no bigint generated always as identity (start with 1001) unique,
  firm_id uuid not null references public.firms(id),
  created_by uuid references auth.users(id) default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  referral_type public.referral_type not null,
  patient_name text not null check (length(patient_name) between 2 and 120),
  patient_id_number text not null check (length(patient_id_number) between 5 and 20),
  patient_dob date,
  patient_phone text not null check (length(patient_phone) between 7 and 30),
  notes text not null default '' check (length(notes) <= 10000),
  status public.appt_status not null default 'booked',
  payer public.payer_kind not null default 'referrer',
  price numeric(10, 2) not null default 0 check (price >= 0 and price < 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ends_after_start check (ends_at > starts_at),
  -- no two active appointments may overlap, even after the slot length changes
  constraint appointments_no_overlap exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')
);
create unique index if not exists appointments_one_per_slot on public.appointments (starts_at) where status <> 'cancelled';
create index if not exists appointments_firm_idx on public.appointments (firm_id, starts_at);

create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  body text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists case_notes_appt_idx on public.case_notes (appointment_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  firm_id uuid not null references public.firms(id),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists documents_appt_idx on public.documents (appointment_id);

create table if not exists public.letters (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  letter_type public.referral_type not null,
  recipient text not null default '',
  subject text not null default '',
  body text not null default '' check (length(body) <= 200000),
  exam_notes text not null default '' check (length(exam_notes) <= 20000),
  is_final boolean not null default false,
  finalized_at timestamptz,
  letter_date date,
  final_letter_type public.referral_type,
  final_recipient text,
  final_subject text,
  final_body text,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0 and amount < 1000000),
  method public.pay_method not null,
  paid_on date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  receipt_no text not null default '' check (length(receipt_no) <= 60),
  receipt_url text not null default '' check (receipt_url = '' or receipt_url ~ '^https://'),
  invoice_id text not null default '' check (length(invoice_id) <= 80),
  invoice_error text not null default '' check (length(invoice_error) <= 500),
  note text not null default '' check (length(note) <= 500),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists payments_appt_idx on public.payments (appointment_id);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- ---------- helper functions (used by access rules) ----------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_firm() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from public.profiles p
  join public.firms f on f.id = p.firm_id
  where p.id = auth.uid() and p.active and f.active and p.role = 'firm'
$$;

create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not require_staff_mfa from public.settings where id = 1), false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role in ('admin', 'doctor'))
     and public.mfa_ok()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin')
     and public.mfa_ok()
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
drop trigger if exists letters_touch on public.letters;
create trigger letters_touch before update on public.letters for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- ---------- booking rules ----------
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
    new.status := 'booked';
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists appointments_validate on public.appointments;
create trigger appointments_validate before insert on public.appointments for each row execute function public.validate_booking();

-- busy times only (no patient data), so firms can see which slots are taken
create or replace function public.busy_slots(p_from timestamptz, p_to timestamptz) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at from public.appointments a
  where a.status <> 'cancelled' and a.ends_at > p_from and a.starts_at < p_to
    and (public.is_staff() or public.my_firm() is not null)
  order by a.starts_at
$$;

create or replace function public.cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or coalesce(a.firm_id = public.my_firm(), false)) then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('booked', 'draft') then raise exception 'CANNOT_CANCEL'; end if;
  if not public.is_staff() and a.starts_at < now() then raise exception 'IN_PAST'; end if;
  update public.appointments set status = 'cancelled' where id = p_id;
end $$;

-- the final version only (never the working draft or the doctor's exam notes)
create or replace function public.final_letter(p_id uuid)
returns table (letter_type public.referral_type, recipient text, subject text, body text, letter_date date, finalized_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(l.final_letter_type, l.letter_type), coalesce(l.final_recipient, ''), coalesce(l.final_subject, ''),
         coalesce(l.final_body, ''), l.letter_date, l.finalized_at
  from public.letters l join public.appointments a on a.id = l.appointment_id
  where l.appointment_id = p_id and l.is_final and l.final_body is not null and a.status <> 'cancelled'
    and (public.is_staff() or (
      a.firm_id = public.my_firm()
      and (not (select letter_requires_payment from public.settings where id = 1)
           or coalesce((select sum(p.amount) from public.payments p where p.appointment_id = a.id), 0) >= a.price)))
$$;

-- amount paid per appointment, for the appointments the caller may see
create or replace function public.paid_totals() returns table (appointment_id uuid, paid numeric)
language sql stable security definer set search_path = public as $$
  select p.appointment_id, sum(p.amount) from public.payments p
  join public.appointments a on a.id = p.appointment_id
  where public.is_staff() or a.firm_id = public.my_firm()
  group by p.appointment_id
$$;

-- payments of one case, without internal notes (for referrers)
create or replace function public.case_payments(p_id uuid)
returns table (amount numeric, method public.pay_method, paid_on date, receipt_no text, receipt_url text)
language sql stable security definer set search_path = public as $$
  select p.amount, p.method, p.paid_on, p.receipt_no, p.receipt_url
  from public.payments p join public.appointments a on a.id = p.appointment_id
  where p.appointment_id = p_id and (public.is_staff() or a.firm_id = public.my_firm())
  order by p.paid_on, p.created_at
$$;

create or replace function public.log_event(p_action text, p_entity text, p_entity_id uuid, p_details jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_details is not null and pg_column_size(p_details) > 2000 then p_details := null; end if;
  if public.is_staff() then
    insert into public.audit_log (user_id, action, entity, entity_id, details)
    values (auth.uid(), left(p_action, 40), left(p_entity, 40), p_entity_id, p_details);
  elsif p_action = 'print_final' and exists (
    select 1 from public.appointments a where a.id = p_entity_id and a.firm_id = public.my_firm()) then
    insert into public.audit_log (user_id, action, entity, entity_id)
    values (auth.uid(), 'print_final', 'letter', p_entity_id);
  end if;
end $$;

-- ---------- automatic audit trail ----------
create or replace function public.audit_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(new) ->> 'appointment_id'))::uuid;
begin
  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      insert into public.audit_log (action, entity, entity_id) values ('book', 'appointment', rid);
    elsif new.status is distinct from old.status then
      insert into public.audit_log (action, entity, entity_id, details) values ('status', 'appointment', rid, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  elsif tg_table_name = 'letters' then
    if tg_op = 'INSERT' or new.is_final is distinct from old.is_final or (new.is_final and new.finalized_at is distinct from old.finalized_at) then
      insert into public.audit_log (action, entity, entity_id) values (case when new.is_final then 'finalize' else 'letter' end, 'letter', rid);
    end if;
  elsif tg_table_name = 'documents' then
    insert into public.audit_log (action, entity, entity_id, details) values ('upload', 'document', rid, jsonb_build_object('appointment', new.appointment_id));
  elsif tg_table_name = 'payments' then
    insert into public.audit_log (action, entity, entity_id, details)
    values ('payment', 'appointment', new.appointment_id, jsonb_build_object('amount', new.amount, 'method', new.method));
  elsif tg_table_name = 'case_notes' then
    insert into public.audit_log (action, entity, entity_id, details) values ('note', 'case_note', rid, jsonb_build_object('appointment', new.appointment_id));
  end if;
  return new;
end $$;

drop trigger if exists appointments_audit on public.appointments;
create trigger appointments_audit after insert or update on public.appointments for each row execute function public.audit_changes();
drop trigger if exists letters_audit on public.letters;
create trigger letters_audit after insert or update on public.letters for each row execute function public.audit_changes();
drop trigger if exists documents_audit on public.documents;
create trigger documents_audit after insert on public.documents for each row execute function public.audit_changes();
drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert on public.payments for each row execute function public.audit_changes();
create or replace function public.audit_payment_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (action, entity, entity_id, details)
  values ('payment_deleted', 'appointment', old.appointment_id, jsonb_build_object('amount', old.amount, 'method', old.method));
  return old;
end $$;
drop trigger if exists payments_audit_delete on public.payments;
create trigger payments_audit_delete after delete on public.payments for each row execute function public.audit_payment_delete();
drop trigger if exists case_notes_audit on public.case_notes;
create trigger case_notes_audit after insert on public.case_notes for each row execute function public.audit_changes();

-- when a letter becomes final, mark the appointment done; while drafting, mark it draft
create or replace function public.letter_sets_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_final then
    update public.appointments set status = 'done' where id = new.appointment_id and status in ('booked', 'draft');
  else
    update public.appointments set status = 'draft' where id = new.appointment_id and status = 'booked';
  end if;
  return new;
end $$;
drop trigger if exists letters_status on public.letters;
create trigger letters_status after insert or update on public.letters for each row execute function public.letter_sets_status();

-- ---------- row level security ----------
alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.appointments enable row level security;
alter table public.case_notes enable row level security;
alter table public.documents enable row level security;
alter table public.letters enable row level security;
alter table public.audit_log enable row level security;
alter table public.payments enable row level security;

drop policy if exists firms_read on public.firms;
create policy firms_read on public.firms for select to authenticated
  using (public.is_staff() or id = public.my_firm());
drop policy if exists firms_admin_write on public.firms;
create policy firms_admin_write on public.firms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated
  using (public.my_role() is not null);
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (public.is_staff() or firm_id = public.my_firm());
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.is_admin() or (firm_id = public.my_firm() and status = 'booked'));
drop policy if exists appointments_staff_update on public.appointments;
create policy appointments_staff_update on public.appointments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists case_notes_read on public.case_notes;
create policy case_notes_read on public.case_notes for select to authenticated
  using (public.is_staff() or exists (select 1 from public.appointments a where a.id = case_notes.appointment_id and a.firm_id = public.my_firm()));
drop policy if exists case_notes_insert on public.case_notes;
create policy case_notes_insert on public.case_notes for insert to authenticated
  with check (author_id = auth.uid() and (public.is_staff() or exists (
    select 1 from public.appointments a where a.id = case_notes.appointment_id and a.firm_id = public.my_firm() and a.status <> 'cancelled')));

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (public.is_staff() or firm_id = public.my_firm());
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = firm_id::text
    and split_part(storage_path, '/', 2) = appointment_id::text
    and mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    and exists (
    select 1 from public.appointments a where a.id = documents.appointment_id and a.firm_id = documents.firm_id and a.status <> 'cancelled'
      and (public.is_staff() or a.firm_id = public.my_firm())));

drop policy if exists letters_staff on public.letters;
create policy letters_staff on public.letters for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists payments_admin on public.payments;
create policy payments_admin on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.is_admin());

-- nobody signed out gets anything
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.my_role(), public.my_firm(), public.mfa_ok(), public.is_staff(), public.is_admin(),
  public.busy_slots(timestamptz, timestamptz), public.cancel_appointment(uuid), public.final_letter(uuid),
  public.log_event(text, text, uuid, jsonb), public.paid_totals(), public.case_payments(uuid) to authenticated, service_role;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update on public.firms, public.appointments, public.letters to authenticated;
grant select on public.profiles, public.audit_log to authenticated;
grant select, update on public.settings to authenticated;
grant select, insert on public.case_notes, public.documents to authenticated;

-- ---------- file storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-files', 'case-files', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists case_files_insert on storage.objects;
create policy case_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-files'
    and exists (
      select 1 from public.appointments a
      where a.id::text = (storage.foldername(name))[2]
        and a.firm_id::text = (storage.foldername(name))[1]
        and a.status <> 'cancelled'
        and (public.is_staff() or a.firm_id = public.my_firm())
    )
  );

drop policy if exists case_files_read on storage.objects;
create policy case_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'case-files'
    and (public.is_staff() or (storage.foldername(name))[1] = public.my_firm()::text)
  );
