-- Calendar time blocks, reschedule requests, letter templates and in-app notifications.

-- ---------- time blocks (the doctor blocks hours from the calendar) ----------
create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (length(note) <= 200),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint time_blocks_ends_after_start check (ends_at > starts_at)
);
create index if not exists time_blocks_range_idx on public.time_blocks (starts_at, ends_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id_number);

-- one place for "is this a bookable slot?", used by bookings and by reschedules
create or replace function public.slot_check(p_start timestamptz) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  s public.settings;
  local_ts timestamp;
  cfg jsonb;
  t_min int; from_min int; to_min int;
begin
  select * into s from public.settings where id = 1;
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
     or t_min < from_min or t_min + s.slot_minutes > to_min
     or (t_min - from_min) % s.slot_minutes <> 0 then
    raise exception 'SLOT_INVALID_TIME';
  end if;
  if exists (select 1 from public.time_blocks b
             where tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_start + make_interval(mins => s.slot_minutes))) then
    raise exception 'SLOT_DAY_BLOCKED';
  end if;
end $$;

-- the booking rules again, now also respecting blocked hours
create or replace function public.validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
begin
  select * into s from public.settings where id = 1;
  perform public.slot_check(new.starts_at);
  new.ends_at := new.starts_at + make_interval(mins => s.slot_minutes);
  new.patient_email := lower(trim(coalesce(new.patient_email, '')));
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
  with check (public.is_staff() or (firm_id = public.my_firm() and status in ('pending', 'booked')));

-- busy times now include the doctor's blocked hours (still no patient data)
create or replace function public.busy_slots(p_from timestamptz, p_to timestamptz) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.starts_at, x.ends_at from (
    select a.starts_at, a.ends_at from public.appointments a
      where a.status <> 'cancelled' and a.ends_at > p_from and a.starts_at < p_to
    union all
    select b.starts_at, b.ends_at from public.time_blocks b
      where b.ends_at > p_from and b.starts_at < p_to
  ) x
  where public.is_staff() or public.my_firm() is not null
  order by x.starts_at
$$;

-- ---------- reschedule requests (the referrer asks, the doctor approves) ----------
create table if not exists public.reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  firm_id uuid not null references public.firms(id),
  requested_starts_at timestamptz not null,
  reason text not null default '' check (length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  response text not null default '' check (length(response) <= 500),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists reschedule_one_open on public.reschedule_requests (appointment_id) where status = 'pending';

create or replace function public.validate_reschedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  a public.appointments;
begin
  select * into s from public.settings where id = 1;
  select * into a from public.appointments where id = new.appointment_id;
  if not found then raise exception 'NOT_FOUND'; end if;
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
drop trigger if exists reschedule_validate on public.reschedule_requests;
create trigger reschedule_validate before insert on public.reschedule_requests for each row execute function public.validate_reschedule();

-- the doctor approves (the appointment moves) or declines a reschedule request
create or replace function public.decide_reschedule(p_id uuid, p_approve boolean, p_response text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.reschedule_requests;
  s public.settings;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.reschedule_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into s from public.settings where id = 1;
  if p_approve then
    perform public.slot_check(r.requested_starts_at);
    update public.appointments set starts_at = r.requested_starts_at,
      ends_at = r.requested_starts_at + make_interval(mins => s.slot_minutes), reminder_sent_at = null
      where id = r.appointment_id and status in ('pending', 'booked', 'draft');
    if not found then raise exception 'CANNOT_RESCHEDULE'; end if;
  end if;
  update public.reschedule_requests set status = case when p_approve then 'approved' else 'declined' end,
    response = left(coalesce(trim(p_response), ''), 500), decided_at = now() where id = p_id;
  return r.appointment_id;
end $$;

-- ---------- letter templates (the doctor's own phrases and paragraphs) ----------
create table if not exists public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 20000),
  letter_type public.referral_type,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

insert into public.letter_templates (title, body, letter_type)
select * from (values
  ('בדיקה גופנית תקינה – עמ"ש צווארי', E'בדיקה גופנית:\nהליכה תקינה. טווחי תנועה בעמ"ש הצווארי מלאים וללא כאב. כוח 5/5 בארבע הגפיים. תחושה שמורה. החזרים גידיים סימטריים. ספרלינג שלילי משני הצדדים.', null::public.referral_type),
  ('בדיקה גופנית תקינה – עמ"ש מותני', E'בדיקה גופנית:\nהליכה תקינה, כולל על עקבים ועל בהונות. טווחי תנועה בעמ"ש המותני מלאים. SLR שלילי משני הצדדים. כוח 5/5 בגפיים התחתונות. תחושה שמורה. החזרים סימטריים.', null),
  ('קשר סיבתי – פסקת דיון', E'דיון:\nלאור התיעוד הרפואי הסמוך לאירוע, רצף התלונות מאז ואופי הממצאים בבדיקות העזר, קיים לדעתי קשר סיבתי בין האירוע לבין הנזק המתואר. [להשלמת הרופא: נימוק לגבי מצב קודם]', 'legal'),
  ('המלצה למעקב', E'המלצות:\n- המשך טיפול פיזיותרפי\n- מעקב בעוד 3 חודשים\n- פנייה מוקדמת במקרה של החמרה בכאב, חולשה או הפרעה בשליטה על הסוגרים', null)
) v(title, body, letter_type)
where not exists (select 1 from public.letter_templates);

-- ---------- in-app notifications ----------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  title text not null check (length(title) <= 200),
  body text not null default '' check (length(body) <= 500),
  link text not null default '' check (length(link) <= 300),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- sends a notification to all clinic staff, or to all users of one referrer; skips repeats of the same thing within 10 minutes
create or replace function public.notify(p_staff boolean, p_firm uuid, p_appt uuid, p_kind text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, appointment_id, kind, title, body, link)
  select p.id, p_appt, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500),
    case when p_appt is null then '' when p_staff then '/doctor/cases/' || p_appt else '/firm/cases/' || p_appt end
  from public.profiles p
  where p.active
    and (case when p_staff then p.role in ('admin', 'doctor') else p.role = 'firm' and p.firm_id = p_firm end)
    and p.id is distinct from auth.uid()
    and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = p_kind
                    and n.appointment_id is not distinct from p_appt and n.read_at is null and n.created_at > now() - interval '10 minutes');
end $$;

create or replace function public.actor_is_firm() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'firm')
$$;

create or replace function public.notify_appointments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := new.patient_name || ' · תיק ' || new.case_no;
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
drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify after insert or update on public.appointments for each row execute function public.notify_appointments();

create or replace function public.notify_case_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = new.appointment_id;
  if not found then return new; end if;
  if tg_table_name = 'documents' then
    if public.actor_is_firm() then
      perform public.notify(true, null, a.id, 'new_document', 'מסמכים חדשים בתיק', a.patient_name || ' · תיק ' || a.case_no);
    end if;
  elsif tg_table_name = 'case_notes' then
    if new.kind = 'request' then
      perform public.notify(false, a.firm_id, a.id, 'doc_request', 'הרופא מבקש השלמות לתיק', a.patient_name || ' · ' || left(new.body, 200));
    elsif public.actor_is_firm() then
      perform public.notify(true, null, a.id, 'new_note', 'הערה חדשה מהמפנה', a.patient_name || ' · ' || left(new.body, 200));
    end if;
  elsif tg_table_name = 'reschedule_requests' then
    if tg_op = 'INSERT' then
      perform public.notify(true, null, a.id, 'reschedule', 'בקשה לשינוי מועד',
        a.patient_name || ' · ' || to_char(new.requested_starts_at at time zone 'Asia/Jerusalem', 'DD.MM HH24:MI'));
    elsif new.status = 'declined' and old.status = 'pending' then
      perform public.notify(false, a.firm_id, a.id, 'reschedule_declined', 'הבקשה לשינוי מועד לא אושרה',
        a.patient_name || case when new.response <> '' then ' · ' || new.response else '' end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists documents_notify on public.documents;
create trigger documents_notify after insert on public.documents for each row execute function public.notify_case_activity();
drop trigger if exists case_notes_notify on public.case_notes;
create trigger case_notes_notify after insert on public.case_notes for each row execute function public.notify_case_activity();
drop trigger if exists reschedule_notify on public.reschedule_requests;
create trigger reschedule_notify after insert or update on public.reschedule_requests for each row execute function public.notify_case_activity();

-- ---------- access rules ----------
alter table public.time_blocks enable row level security;
alter table public.reschedule_requests enable row level security;
alter table public.letter_templates enable row level security;
alter table public.notifications enable row level security;

drop policy if exists time_blocks_staff on public.time_blocks;
create policy time_blocks_staff on public.time_blocks for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists reschedule_read on public.reschedule_requests;
create policy reschedule_read on public.reschedule_requests for select to authenticated
  using (public.is_staff() or firm_id = public.my_firm());
drop policy if exists reschedule_insert on public.reschedule_requests;
create policy reschedule_insert on public.reschedule_requests for insert to authenticated
  with check (public.is_staff() or (firm_id = public.my_firm() and exists (
    select 1 from public.appointments a where a.id = reschedule_requests.appointment_id and a.firm_id = public.my_firm())));

drop policy if exists letter_templates_staff on public.letter_templates;
create policy letter_templates_staff on public.letter_templates for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.time_blocks, public.reschedule_requests, public.letter_templates, public.notifications from anon, authenticated;
grant select, insert, update, delete on public.time_blocks, public.letter_templates to authenticated;
grant select, insert on public.reschedule_requests to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.time_blocks, public.reschedule_requests, public.letter_templates, public.notifications to service_role;

-- internal helpers: never callable from the browser (Supabase grants new functions to anon/authenticated by default)
revoke execute on function public.slot_check(timestamptz), public.notify(boolean, uuid, uuid, text, text, text), public.actor_is_firm()
  from anon, authenticated, public;
revoke execute on function public.decide_reschedule(uuid, boolean, text) from anon, public;
revoke execute on function public.validate_reschedule(), public.notify_appointments(), public.notify_case_activity() from anon, authenticated, public;
grant execute on function public.decide_reschedule(uuid, boolean, text), public.busy_slots(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.slot_check(timestamptz), public.notify(boolean, uuid, uuid, text, text, text), public.actor_is_firm() to service_role;

-- ---------- direct requests: one built-in referrer card the clinic books under ----------
insert into public.firms (name, kind, contact_name)
select 'פניות ישירות', 'private', 'המרפאה'
where not exists (select 1 from public.firms where kind = 'private');
