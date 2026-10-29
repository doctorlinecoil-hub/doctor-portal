-- Extra addresses typed when booking (a colleague at the office, the patient's relative):
-- they get the summons, the reminder and the letters, like the referrer.
alter table public.appointments add column if not exists notify_emails text[] not null default '{}';
