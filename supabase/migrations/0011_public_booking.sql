-- A public booking page: the clinic sends one link, and any lawyer, broker or patient books
-- without a user name or password. Every booking waits for the doctor's approval (when approval is on).

alter table public.settings add column if not exists public_booking boolean not null default true;

-- a personal link per referrer (the form then already knows who is booking)
alter table public.firms add column if not exists book_code text;
update public.firms set book_code = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10) where book_code is null;
alter table public.firms alter column book_code set default substr(md5(random()::text || clock_timestamp()::text), 1, 10);
create unique index if not exists firms_book_code_idx on public.firms (book_code);

-- where a booking came from, and a short-lived key that lets the booker attach documents
alter table public.appointments
  add column if not exists source text not null default '' check (source in ('', 'public')),
  add column if not exists upload_key_hash text,
  add column if not exists upload_key_expires timestamptz;

-- a public booking (no signed-in user) notifies the clinic like a referrer's booking does
create or replace function public.notify_appointments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(nullif(new.patient_name, ''), 'ממתין לפרטים') || ' · תיק ' || new.case_no;
  local_when text := to_char(new.starts_at at time zone 'Asia/Jerusalem', 'DD.MM HH24:MI');
  from_outside boolean := public.actor_is_firm() or auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    if new.walk_in then return new; end if;
    if from_outside then
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
