-- Text-message reminders (SMS / WhatsApp through Twilio) to the patient's mobile
alter table public.settings add column if not exists sms_reminders boolean not null default true;
