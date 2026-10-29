-- 1) A document for any patient, without a booked slot ("מסמך חדש").
-- 2) Prescriptions, with the doctor's own list of common drugs.
-- 3) Diagnoses (ICD-10) per case.

-- ---------- cases without a slot ----------
alter table public.appointments add column if not exists walk_in boolean not null default false;

alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled' and not walk_in);
drop index if exists public.appointments_one_per_slot;
create unique index if not exists appointments_one_per_slot on public.appointments (starts_at) where status <> 'cancelled' and not walk_in;

create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
begin
  select * into s from public.settings where id = 1;
  new.patient_email := lower(trim(coalesce(new.patient_email, '')));
  -- a document without a slot: the clinic only, any date, never blocks the calendar
  if new.walk_in then
    if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
    new.ends_at := new.starts_at + interval '1 minute';
    if coalesce(new.price, 0) = 0 then
      new.price := coalesce((s.prices ->> new.referral_type::text)::numeric, 0);
    end if;
    new.status := 'booked';
    new.confirmed_at := now();
    new.reminder_sent_at := now(); -- no reminder for a visit that already happened
    return new;
  end if;
  perform public.slot_check(new.starts_at);
  new.ends_at := new.starts_at + make_interval(mins => s.slot_minutes);
  -- the clinic (doctor or admin) books for anyone, at any free slot, with its own price
  if not public.is_staff() or coalesce(new.price, 0) = 0 then
    new.price := coalesce((s.prices ->> new.referral_type::text)::numeric, 0);
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

-- a document without a slot never takes time in the calendar
create or replace function public.busy_slots(p_from timestamptz, p_to timestamptz) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.starts_at, x.ends_at from (
    select a.starts_at, a.ends_at from public.appointments a
      where a.status <> 'cancelled' and not a.walk_in and a.ends_at > p_from and a.starts_at < p_to
    union all
    select b.starts_at, b.ends_at from public.time_blocks b
      where b.ends_at > p_from and b.starts_at < p_to
  ) x
  where public.is_staff() or public.my_firm() is not null
  order by x.starts_at
$$;

-- ---------- prescriptions ----------
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  notes text not null default '' check (length(notes) <= 2000),
  rx_date date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists prescriptions_appt_idx on public.prescriptions (appointment_id, created_at desc);
drop trigger if exists prescriptions_touch on public.prescriptions;
create trigger prescriptions_touch before update on public.prescriptions for each row execute function public.touch_updated_at();

-- the doctor's own short list of common drugs, with the usual dose
create table if not exists public.drug_favorites (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 200),
  reg_number text not null default '' check (length(reg_number) <= 40),
  form text not null default '' check (length(form) <= 120),
  strength text not null default '' check (length(strength) <= 200),
  dose text not null default '' check (length(dose) <= 120),
  frequency text not null default '' check (length(frequency) <= 120),
  duration text not null default '' check (length(duration) <= 120),
  quantity text not null default '' check (length(quantity) <= 120),
  notes text not null default '' check (length(notes) <= 300),
  created_at timestamptz not null default now()
);

-- ---------- diagnoses ----------
create table if not exists public.case_diagnoses (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  code text not null default '' check (length(code) <= 12),
  name text not null check (length(name) between 1 and 300),
  is_primary boolean not null default false,
  note text not null default '' check (length(note) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists case_diagnoses_appt_idx on public.case_diagnoses (appointment_id);

-- ---------- access: the clinic only ----------
alter table public.prescriptions enable row level security;
alter table public.drug_favorites enable row level security;
alter table public.case_diagnoses enable row level security;

drop policy if exists prescriptions_staff on public.prescriptions;
create policy prescriptions_staff on public.prescriptions for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists drug_favorites_staff on public.drug_favorites;
create policy drug_favorites_staff on public.drug_favorites for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists case_diagnoses_staff on public.case_diagnoses;
create policy case_diagnoses_staff on public.case_diagnoses for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.prescriptions, public.case_diagnoses to authenticated;
grant select, insert, update, delete on public.drug_favorites to authenticated;
